import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { map } from 'rxjs';
import { formatBytes, plural, searched } from '$core/artifacts/artifact-listings';
import { evictionWindowWords } from '$core/mirror/eviction-window';
import type {
  CachedPackage,
  CachedVersion,
  MirrorRepository,
  RepositoryPackages,
} from '$core/mirror/repository-packages.consumes';
import { REPOSITORY_PACKAGES } from '$core/mirror/repository-packages.operations';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { PackageReleases } from '$patterns/mirror/package-releases/package-releases';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_PACKAGES: RepositoryPackages = { packages: [] };

/** What a package of each cache type is called, singular and plural. */
const NOUNS: Readonly<Record<string, readonly [string, string]>> = {
  'oci-mirror': ['image', 'images'],
  'maven-proxy': ['coordinate', 'coordinates'],
  'npm-proxy': ['package', 'packages'],
};

/** The hex digits a digest is shortened to after `sha256:`. */
const SHORT_DIGEST = 12;

/**
 * One of qits-mirror's pull-through cache roots (qits-2358), at `/mirror/repositories/<repository>`:
 * what the cache holds, package by package and version by version. It replaces
 * qits-mirror-frontend's `repositories/:repository`, read through a pact instead of hand-written
 * DTOs, with an unknown name told apart from an outage and the cache's eviction rule stated.
 *
 * **Load budget: 1, nothing per row, plus 2 per package shown (`PackageReleases`).** `REPOSITORY_PACKAGES` (`listRepositoryPackages`) is the
 * root's row and every package with its versions, in the server's order (packages by name, each
 * package's versions as the mirror sorts them; for OCI digests newest first). The door is not
 * paged, so the name search narrows the one bounded answer in the page. The read is made in the
 * browser only (the server render has no session).
 *
 * - Header: the name (mono), Refresh; the type's chip and "a cache of <upstream>" (or that the
 *   upstream was deleted, an OCI namespace's); "N packages · M cached versions · <size>", the
 *   type's noun for packages (images, coordinates).
 * - The eviction line: the type's window as qits-mirror sweeps it ("Entries unused for 30 days are
 *   evicted by the next sweep"), or that the cache is not swept (`evictionWindow: null`). For OCI,
 *   that a tag an image pin from qits-maintenance names is kept: the pins reach the mirror only in
 *   the body of each sweep, so no read can show them, and the page claims no per-version verdict
 *   (only a `qits:system` dry run knows one).
 * - The packages table (name, versions, size, last used) and, below it, the selected package's
 *   versions (version or shortened digest, tags as chips, files for maven only, size, cached, last
 *   used). The first package shown is selected until another is pressed
 *   (`select-mirror-package`).
 * - Below them, which of our releases embed the selected package and which repositories pin it
 *   (`PackageReleases`, qits-2488: two qits-maintenance reads per package shown).
 *
 * States: loading; a root nobody has pulled through yet (`packages: []`, every root on a fresh
 * deployment) says nothing is cached; a 404 (the mirror has no root of that name) says so, with no
 * Retry, which could not help; any other failure (a 5xx: qits-mirror never answers a fault as an
 * empty list) says the contents cannot be read right now, with Retry.
 *
 * Marks (qits-2141): both tables are the packages read, each package row by its `name` and each
 * version row by its `version`; the header is the root's row; counts and formatted values are
 * derived.
 *
 * Staleness (qits-1270): no `refreshOn`. qits-mirror sends no event when a client pulls through,
 * when an entry is evicted or when a sweep runs, so none of it is followed: Refresh reads the
 * packages again. Nothing polls.
 */
@Component({
  selector: 'app-mirror-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PackageReleases,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [actions]="actions">
        <h1
          slot="header"
          class="m-0 min-w-0 font-mono text-2xl leading-[1.2] font-bold wrap-anywhere"
        >
          {{ name() }}
        </h1>

        @if (unknown()) {
          <p
            role="status"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            The mirror has no cache root called {{ name() }}.
          </p>
        } @else {
          <ui-load-failure
            message="This cache’s contents cannot be read right now."
            [class.hidden]="state() !== 'error'"
            (retry)="packages.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (root(); as row) {
              <div
                class="mb-4 flex flex-col gap-1 text-sm text-fg-soft"
                [qitsEntity]="row"
                entityKey="name"
                [entitySource]="packages"
                data-facts
              >
                <p class="m-0 flex flex-wrap items-center gap-2">
                  <ui-chip [label]="row.type ?? ''" [fieldOf]="row" qitsField="type" />
                  @if (row.upstream) {
                    <span
                      >a cache of
                      <span class="font-mono break-all" [fieldOf]="row" qitsField="upstream">{{
                        row.upstream
                      }}</span></span
                    >
                  } @else {
                    <span [fieldOf]="row" [qitsField]="marks.upstream"
                      >Its upstream was deleted: it serves what is cached and fetches nothing
                      new.</span
                    >
                  }
                </p>
                <p class="m-0" data-lede>
                  <span [fieldOf]="answer()" [qitsField]="marks.caption">{{ caption() }}</span>
                </p>
                <p class="m-0" data-eviction>
                  <span [fieldOf]="row" [qitsField]="marks.evictionWindow">{{ eviction() }}</span>
                  @if (row.type === 'oci-mirror') {
                    A tag that an image pin from qits-maintenance names is kept whatever its age;
                    the pins reach the mirror only at sweep time, so they are not shown here.
                  }
                </p>
              </div>
            }

            @if (state() === 'loaded' && all().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                Nothing is cached in {{ name() }} yet. It fills as clients pull through it.
              </p>
            } @else if (all().length > 0) {
              <input
                type="search"
                class="mb-3 h-8 w-full max-w-sm rounded-md border border-line bg-surface px-2 text-sm text-fg"
                aria-label="Search packages"
                placeholder="Filter by name…"
                [value]="search()"
                (input)="search.set(inputValue($event))"
              />
              @if (rows().length === 0) {
                <p role="status" class="m-0 px-3 py-8 text-center text-sm text-fg-muted">
                  No packages match “{{ search().trim() }}”.
                </p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Packages">
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th class="py-1.5 pr-3 font-semibold">Name</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Versions</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                        <th class="py-1.5 font-semibold">Last used</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="packages">
                      @for (pkg of rows(); track pkg.name) {
                        <tr
                          class="border-b border-line-subtle align-top"
                          [qitsEntity]="pkg"
                          entityKey="name"
                        >
                          <td class="py-1 pr-3">
                            <button
                              type="button"
                              class="-mx-1 rounded px-1 py-0.5 text-left font-mono font-medium break-all text-accent hover:underline aria-pressed:bg-accent-soft aria-pressed:no-underline"
                              [attr.aria-pressed]="pkg.name === selected()?.name"
                              [qitsTriggers]="[selecting.selected]"
                              (click)="select(pkg.name)"
                              [fieldOf]="pkg"
                              qitsField="name"
                            >
                              {{ pkg.name }}
                            </button>
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right tabular-nums"
                            [fieldOf]="pkg"
                            [qitsField]="marks.versionCount"
                          >
                            {{ pkg.versions?.length ?? 0 }}
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                            [fieldOf]="pkg"
                            [qitsField]="marks.sizeBytes"
                          >
                            {{ bytes(pkg.sizeBytes) }}
                          </td>
                          <td
                            class="py-1.5 whitespace-nowrap text-fg-soft"
                            [fieldOf]="pkg"
                            [qitsField]="marks.lastAccessedAt"
                          >
                            {{ lastUsed(pkg.lastAccessedAt) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (selected(); as pkg) {
                  <section
                    class="mt-8"
                    aria-labelledby="mirror-package-versions"
                    [qitsEntity]="pkg"
                    entityKey="name"
                    [entitySource]="packages"
                  >
                    <h2 id="mirror-package-versions" class="mt-0 mb-2 text-base font-semibold">
                      Versions of
                      <span class="font-mono break-all" [fieldOf]="pkg" qitsField="name">{{
                        pkg.name
                      }}</span>
                    </h2>
                    <div class="overflow-x-auto">
                      <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
                        <thead>
                          <tr class="border-b border-line text-xs text-fg-muted">
                            <th class="py-1.5 pr-3 font-semibold">Version</th>
                            <th class="py-1.5 pr-3 font-semibold">Tags</th>
                            @if (withFiles()) {
                              <th class="py-1.5 pr-3 text-right font-semibold">Files</th>
                            }
                            <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                            <th class="py-1.5 pr-3 font-semibold">Cached</th>
                            <th class="py-1.5 font-semibold">Last used</th>
                          </tr>
                        </thead>
                        <tbody [qitsEntityList]="packages">
                          @for (version of pkg.versions ?? []; track version.version) {
                            <tr
                              class="border-b border-line-subtle align-top"
                              [qitsEntity]="version"
                              entityKey="version"
                            >
                              <td
                                class="py-1.5 pr-3 font-mono break-all"
                                [attr.title]="version.version"
                                [fieldOf]="version"
                                [qitsField]="marks.version"
                              >
                                {{ shortVersion(version.version) }}
                              </td>
                              <td class="py-1.5 pr-3" [fieldOf]="version" qitsField="labels">
                                @for (label of version.labels ?? []; track label) {
                                  <ui-chip class="mr-1 inline-block font-mono" [label]="label" />
                                } @empty {
                                  <span class="text-fg-muted">—</span>
                                }
                              </td>
                              @if (withFiles()) {
                                <td
                                  class="py-1.5 pr-3 text-right tabular-nums"
                                  [attr.title]="fileNames(version)"
                                  [fieldOf]="version"
                                  [qitsField]="marks.files"
                                >
                                  {{ version.files?.length ?? 0 }}
                                </td>
                              }
                              <td
                                class="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums"
                                [fieldOf]="version"
                                [qitsField]="marks.sizeBytes"
                              >
                                {{ bytes(version.sizeBytes) }}
                              </td>
                              <td
                                class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                                [fieldOf]="version"
                                [qitsField]="marks.cachedAt"
                              >
                                {{ instant(version.cachedAt) }}
                              </td>
                              <td
                                class="py-1.5 whitespace-nowrap text-fg-soft"
                                [fieldOf]="version"
                                [qitsField]="marks.lastAccessedAt"
                              >
                                {{ lastUsed(version.lastAccessedAt) }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <app-package-releases
                    [root]="name()"
                    [type]="root()?.type"
                    [name]="pkg.name ?? ''"
                  />
                }
              }
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class MirrorRepositoryPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  /** Choosing a package shows its versions; it reads nothing. */
  protected readonly selecting = outcomes('select-mirror-package', { selected: stay() });

  /** The URL's cache root name. */
  protected readonly name = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('repository') ?? '')),
    { initialValue: '' },
  );

  /** The root's row and contents; read again on Refresh only (no event announces a change). */
  protected readonly packages = qitsResource(REPOSITORY_PACKAGES, () =>
    this.browser && this.name() ? { path: { repository: this.name() } } : undefined,
  );

  /** The read's answer; nothing while it has none. */
  protected readonly answer = computed(
    (): RepositoryPackages =>
      (this.packages.hasValue() ? this.packages.value() : undefined) ?? NO_PACKAGES,
  );

  /** The cache root's own row, once the read answered. */
  protected readonly root = computed((): MirrorRepository | undefined => this.answer().repository);

  /** Every package the root holds, in the server's order. */
  protected readonly all = computed((): readonly CachedPackage[] => this.answer().packages ?? []);

  /** The read's failure status (404, 500, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.packages.status() !== 'error') return undefined;
    const error = this.packages.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 404: the mirror has no cache root of that name. */
  protected readonly unknown = computed(() => this.failure() === 404);

  protected readonly state = computed((): LoadState => loadState(this.packages));

  /** The name search; cleared when another root opens. */
  protected readonly search = linkedSignal({ source: this.name, computation: () => '' });

  /** The packages the search lets through, in the server's order. */
  protected readonly rows = computed(() =>
    searched(this.all(), this.search(), (pkg) => pkg.name ?? ''),
  );

  /** The package last pressed; none (the first shown) until one is, and again on another root. */
  private readonly chosen = linkedSignal<string, string | undefined>({
    source: this.name,
    computation: () => undefined,
  });

  /** The package whose versions are shown: the one pressed while it is listed, else the first. */
  protected readonly selected = computed((): CachedPackage | undefined => {
    const rows = this.rows();
    return rows.find((pkg) => pkg.name === this.chosen()) ?? rows[0];
  });

  /** Only a maven cache lists files per version. */
  protected readonly withFiles = computed(() => this.root()?.type === 'maven-proxy');

  /** `1 image · 2 cached versions · 800 B`. */
  protected readonly caption = computed(() => {
    const [one, many] = NOUNS[this.root()?.type ?? ''] ?? NOUNS['npm-proxy'];
    const packages = this.all();
    const versions = packages.reduce((sum, pkg) => sum + (pkg.versions?.length ?? 0), 0);
    const bytes = packages.reduce((sum, pkg) => sum + (pkg.sizeBytes ?? 0), 0);
    return [
      plural(packages.length, one, many),
      plural(versions, 'cached version', 'cached versions'),
      formatBytes(bytes),
    ].join(' · ');
  });

  /** The type's eviction rule, as the sweep applies it. */
  protected readonly eviction = computed(() => {
    const window = this.root()?.evictionWindow;
    return window
      ? `Entries unused for ${evictionWindowWords(window)} are evicted by the next sweep.`
      : 'This cache is not swept: nothing is evicted.';
  });

  /** The selected package's releases and pins (qits-2488), while a package is shown. */
  private readonly releases = viewChild(PackageReleases);

  /**
   * Refresh: the packages, and the selected package's releases and pins, read again (neither
   * qits-mirror nor qits-maintenance sends an event for them).
   */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.packages.reload();
        this.releases()?.reload();
      },
    },
  ];

  protected readonly marks = MARKS;

  protected select(name: string | undefined): void {
    this.chosen.set(name);
    this.selecting.selected.reach();
  }

  /** A digest as `sha256:` and its first 12 hex digits; any other version as it is. */
  protected shortVersion(version: string | undefined): string {
    const value = version ?? '';
    const digest = /^(sha256:)([0-9a-f]+)$/.exec(value);
    return digest && digest[2].length > SHORT_DIGEST
      ? `${digest[1]}${digest[2].slice(0, SHORT_DIGEST)}`
      : value;
  }

  /** A maven version's file names, one per line, for the Files cell's title. */
  protected fileNames(version: CachedVersion): string {
    return (version.files ?? []).join('\n');
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  /** When an entry was last served, or `never`. */
  protected lastUsed(iso: string | undefined): string {
    return iso ? formatInstant(iso) : 'never';
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  caption: { derived: [] },
  upstream: { derived: ['upstream'] },
  evictionWindow: { derived: ['evictionWindow'] },
  versionCount: { derived: ['versions'] },
  sizeBytes: { derived: ['sizeBytes'] },
  lastAccessedAt: { derived: ['lastAccessedAt'] },
  cachedAt: { derived: ['cachedAt'] },
  version: { derived: ['version'] },
  files: { derived: ['files'] },
} as const;
