import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  external,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  QitsTriggers,
} from '@qits/angular';
import { formatBytes, plural, publishedFrom } from '$core/artifacts/artifact-listings';
import type { ArtifactDocsVersion, ArtifactDocsVersions } from '$core/artifacts/artifacts.consumes';
import { ARTIFACT_DOCS_VERSIONS } from '$core/artifacts/artifacts.operations';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { docsReadPath } from '$core/release-requests/release-links';
import { formatInstant } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The answer while the read has none. */
const NO_VERSIONS: ArtifactDocsVersions = { versions: [] };

/**
 * One docs site of a docs store (qits-2328), at `/artifacts/repositories/<repo>/docs/<site>`: its
 * published versions, each read in qits-docs' reader. It replaces qits-artifacts-frontend's
 * `repositories/:repo/docs/:site`. Every site name is scoped and slashed (`@changelog/qits-qits`),
 * and it is one segment: `@changelog%2Fqits-qits` in the URL, and `%40changelog%2Fqits-qits` in
 * the read (this `/artifacts/api/` door takes it encoded; `literalDocsPaths` rewrites only
 * `/artifacts/docs/` wire URLs).
 *
 * **Load budget: 1, nothing per row.** `ARTIFACT_DOCS_VERSIONS` (`listDocsVersionSummaries`) is
 * the table, and the header's count is taken from its answer; the store page's site listing is not
 * read. The read is made in the browser only (the server render has no session).
 *
 * - Header: "← <repo>" back to the store page (`leave-artifact-docs-site`), the site's name, and
 *   "N versions · newest first".
 * - Versions, newest first as the wire gives them: the version, its file count, its size (the
 *   union of the version's own blobs; one caption says the sizes are per version and do not add
 *   up), published, last accessed ("Never" when null), where it was published from
 *   (`publishedFrom`: repository · branch when present · short commit · release request when
 *   present, `—` for none), and Read (`read-artifact-docs-version`, `external('docs')`, same tab):
 *   `PlatformOrigins.page('docs')` + `docsReadPath('/', site, version)`, qits-docs' reader, which
 *   renders any site (until qits-2337 moves it here).
 * - Left out: the old page's raw `index.html` Open link (most sites hold no `index.html`: the
 *   reader replaces it), a version search (one bounded answer, a few hundred rows at most), and
 *   deletes or filters (the old page had none).
 *
 * States: loading; a failed read offers Retry; a 404 is "There is no repository called <repo> in
 * this store"; a 400 "<repo> is not a docs repository", linking its store page; an empty list is
 * "There is no site called <site> in this repository" (the wire answers 200 with no versions for
 * an unknown site, so an empty site and an unknown one read the same).
 *
 * Marks (qits-2141): the table is the versions' read, each row an entry by its `version`; the
 * header's count and the published-from line are derived from the answer.
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a publish, a read or a sweep. Refresh reads the versions again.
 */
@Component({
  selector: 'app-artifacts-docs-site-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="site()" [actions]="actions">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ repo: repo() }"
            [exitCurrent]="null"
            data-back
            >← {{ repo() }}</a
          >
        </p>
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="versions" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.lede">{{ lede() }}</span>
          </p>
        }

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ repo() }}” in this store.
          </p>
        } @else if (notDocs()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            “{{ repo() }}” is not a docs repository.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.repository"
              [exitParams]="{ repo: repo() }"
              [exitCurrent]="null"
              >Open its store page</a
            >.
          </p>
        } @else {
          <ui-load-failure
            message="This docs site’s versions could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="versions.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (versionList().length === 0) {
              <p
                role="status"
                class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
              >
                There is no site called “{{ site() }}” in this repository.
              </p>
            } @else {
              <section aria-labelledby="docs-site-versions">
                <h2 id="docs-site-versions" class="mt-0 mb-1 text-base font-semibold">Versions</h2>
                <p class="mt-0 mb-2 text-xs text-fg-muted">
                  Each size is that version’s own files, and the sizes do not add up: versions that
                  hold the same file share its bytes.
                </p>
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Versions">
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th class="py-1.5 pr-3 font-semibold">Version</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Files</th>
                        <th class="py-1.5 pr-3 text-right font-semibold">Size</th>
                        <th class="py-1.5 pr-3 font-semibold">Published</th>
                        <th class="py-1.5 pr-3 font-semibold">Last accessed</th>
                        <th class="py-1.5 pr-3 font-semibold">Published from</th>
                        <th class="py-1.5 font-semibold">Read</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="versions">
                      @for (version of versionList(); track version.version) {
                        <tr
                          class="border-b border-line-subtle align-top"
                          [qitsEntity]="version"
                          entityKey="version"
                        >
                          <td
                            class="py-1.5 pr-3 font-mono font-medium whitespace-nowrap"
                            [fieldOf]="version"
                            qitsField="version"
                          >
                            {{ version.version }}
                          </td>
                          <td
                            class="py-1.5 pr-3 text-right tabular-nums"
                            [fieldOf]="version"
                            qitsField="fileCount"
                          >
                            {{ version.fileCount }}
                          </td>
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
                            [qitsField]="marks.publishedAt"
                          >
                            {{ instant(version.publishedAt) }}
                          </td>
                          <td
                            class="py-1.5 pr-3 whitespace-nowrap text-fg-soft"
                            [fieldOf]="version"
                            [qitsField]="marks.accessedAt"
                          >
                            {{ accessed(version.accessedAt) }}
                          </td>
                          <td
                            class="min-w-56 py-1.5 pr-3 font-mono text-xs break-words text-fg-soft"
                            [fieldOf]="version"
                            [qitsField]="marks.metadata"
                          >
                            {{ from(version) }}
                          </td>
                          <td class="py-1.5 whitespace-nowrap">
                            <a
                              class="font-semibold text-accent no-underline hover:underline"
                              [attr.href]="readHref(version) || null"
                              [attr.aria-label]="'Read ' + site() + ' version ' + version.version"
                              [qitsTriggers]="readHref(version) ? [reading.read] : []"
                              (click)="read($event, version)"
                              >Read</a
                            >
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsDocsSitePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly docsOrigin = inject(PlatformOrigins).page('docs');

  /** "← <repo>", and a non-docs repository's store page: the repository's page. */
  protected readonly leaving = outcomes('leave-artifact-docs-site', {
    back: exit('artifacts/repositories/:repo'),
    repository: exit('artifacts/repositories/:repo'),
  });

  /** A version's Read: qits-docs' reader at that version, same tab. */
  protected readonly reading = outcomes('read-artifact-docs-version', { read: external('docs') });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');
  /** The URL's site name, decoded (`@changelog/qits-qits`). */
  protected readonly site = computed(() => this.params().get('site') ?? '');

  /** The site's versions, newest first. */
  protected readonly versions = qitsResource(ARTIFACT_DOCS_VERSIONS, () => {
    const repo = this.repo();
    const site = this.site();
    return this.browser && repo && site ? { path: { repo, site } } : undefined;
  });

  /** The read's answer; no versions while it has none. */
  protected readonly answer = computed(
    (): ArtifactDocsVersions =>
      (this.versions.hasValue() ? this.versions.value() : undefined) ?? NO_VERSIONS,
  );

  protected readonly versionList = computed(
    (): readonly ArtifactDocsVersion[] => this.answer().versions ?? [],
  );

  /** The read's failure status (404, 400, …); undefined while it has not failed. */
  private readonly failure = computed((): number | undefined => {
    if (this.versions.status() !== 'error') return undefined;
    const error = this.versions.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 404: the store holds no repository of that name. */
  protected readonly unknownRepository = computed(() => this.failure() === 404);

  /** A 400: the repository holds something other than docs. */
  protected readonly notDocs = computed(() => this.failure() === 400);

  protected readonly state = computed((): LoadState => loadState(this.versions));

  /** `2 versions · newest first`. */
  protected readonly lede = computed(
    () => `${plural(this.versionList().length, 'version')} · newest first`,
  );

  /** Refresh: the versions, read again (no event follows the store). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.versions.reload() },
  ];

  protected readonly marks = MARKS;

  /** The version in qits-docs' reader; `''` while the docs app's origin is not known. */
  protected readonly readHref = (version: ArtifactDocsVersion): string => {
    const site = this.site();
    if (!this.docsOrigin || !site || !version.version) return '';
    return `${this.docsOrigin}${docsReadPath('/', site, version.version)}`;
  };

  /** Leaves for the reader through `read-artifact-docs-version`, which records the outcome. */
  protected read(event: MouseEvent, version: ArtifactDocsVersion): void {
    const href = this.readHref(version);
    if (!href || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.reading.read.leave(href);
  }

  protected from(version: ArtifactDocsVersion): string {
    return publishedFrom(version.metadata);
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  protected accessed(iso: string | null | undefined): string {
    return iso ? formatInstant(iso) : 'Never';
  }
}

/** The data marks of what the page derives from a row (each a class constant, as the rule reads). */
const MARKS = {
  lede: { derived: ['versions'] },
  sizeBytes: { derived: ['sizeBytes'] },
  publishedAt: { derived: ['publishedAt'] },
  accessedAt: { derived: ['accessedAt'] },
  metadata: { derived: ['metadata'] },
} as const;
