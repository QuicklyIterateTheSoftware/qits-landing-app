import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  type QitsDomainEvent,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { repositoryNamed } from '$core/ci/repository-ci';
import { payloadIds } from '$core/events/refresh-on';
import type { Currency } from '$core/maintenance/currency';
import type { AdoptionJourney, RepositoryDownstream } from '$core/maintenance/maintenance.consumes';
import {
  MAINTENANCE_ADOPTION,
  MAINTENANCE_REPOSITORY_DEPENDENTS,
  MAINTENANCE_REPOSITORY_DOWNSTREAM,
} from '$core/maintenance/maintenance.operations';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import {
  adoptionSummary,
  artifactGroups,
  releasedVersions,
  type ArtifactGroup,
} from '$core/maintenance/repository-maintenance';
import { RELEASE_REQUEST_EVENTS } from '$core/projects/release-request-events';
import { requestTone } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import type { RepositoryReleaseRequest } from '$core/release-requests/repository-release-requests.consumes';
import { REPOSITORY_RELEASE_REQUESTS } from '$core/release-requests/repository-release-requests.operations';
import { PROJECT_REPOSITORY_PAGE } from '$core/repositories/repositories.operations';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A currency's chip tone. */
const CURRENCY_TONE: Readonly<Record<Currency, ChipTone>> = {
  current: 'ok',
  behind: 'waiting',
  unknown: 'neutral',
};

/** Whether the read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * Who depends on one repository, at `/projects/<slug>/components/<repo>/dependents` (qits-2489,
 * the bottom half of qits-2334's maintenance repository page, and its releases): the repository
 * sidebar's Dependents entry, current on its releases' adoption pages too.
 *
 * Reads, in the browser only (the server has no session), through `qitsResource`:
 *
 * - Dependents: who embeds what the repository publishes (`MAINTENANCE_REPOSITORY_DEPENDENTS`,
 *   `listRepositoryDependents`, by name), one group per published artifact (name, ecosystem,
 *   latest), each dependent's repository linked to its own Depends on page
 *   (`MaintenanceRepositoryLinks`), the artifact and version it embeds, direct or transitive, and
 *   current, behind or unknown against that artifact's latest; the behind ones first. A behind row
 *   is a bump the dependent owes.
 * - Downstream: the closure as the inventory gives it (`MAINTENANCE_REPOSITORY_DOWNSTREAM`,
 *   `getRepositoryDownstream`, no row filtered), with depth, repository (linked), archetype and
 *   `via`, the count in the caption.
 * - Releases: the repository's newest released versions (`releasedVersions`: RELEASED and
 *   FINALIZED with a version, at most ten), from the project's repositories
 *   (`PROJECT_REPOSITORY_PAGE`, for the repository's id; an unknown name says so) and its requests
 *   (`REPOSITORY_RELEASE_REQUESTS`, `state=all`, as its Release requests page reads them), each
 *   version opening its adoption page (`open-repository-adoption`). The newest one's journey is
 *   read once (`MAINTENANCE_ADOPTION`, `getAdoptionByRelease?repository=&version=`) and said in a
 *   line: "n of m downstream carry <version>".
 *
 * States: each section its own loading, its own empty line and Retry; a 403 on a qits-maintenance
 * read is a refusal (only qits:admin, admin-agent, desk-admin, desk, system and agent may read
 * them). Marks (qits-2141): each published artifact by ecosystem and name, each dependent by the
 * artifact it is, each downstream repository by its name, each release by its request's `id`, the
 * journey by its `repository`.
 *
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` naming the repository (`payloadIds`'
 * `repositoryId`) → its requests, debounced. Dependents, downstream and the journey are read once.
 * Refresh reads them all again.
 */
@Component({
  selector: 'app-repository-dependents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Dependents" [actions]="actions">
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading a repository’s dependents needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <p class="mt-0 mb-6 text-sm text-fg-soft">
          Who embeds what {{ name() }} publishes, what is downstream of it, and how far its releases
          got.
        </p>

        <section
          aria-labelledby="repository-dependents"
          class="mb-8"
          [qitsEntityList]="dependents"
          data-dependents
        >
          <h3 id="repository-dependents" class="mt-0 mb-3 text-base font-semibold">Dependents</h3>
          <ui-load-failure
            message="This repository’s dependents could not be read."
            [class.hidden]="dependentsState() !== 'error' || refusal()"
            (retry)="dependents.reload()"
          />
          <ui-spinner [state]="dependentsState()" [class.hidden]="dependentsState() === 'error'">
            @for (artifact of groups(); track artifact.key) {
              <div class="mb-4" [qitsEntity]="artifact" entityKey="key" data-artifact>
                <h4 class="m-0 mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span
                    class="font-mono font-semibold break-all text-fg"
                    [fieldOf]="artifact"
                    qitsField="name"
                    >{{ artifact.name }}</span
                  >
                  <span
                    class="text-xs font-normal text-fg-muted"
                    [fieldOf]="artifact"
                    qitsField="ecosystem"
                    >{{ artifact.ecosystem }}</span
                  >
                  <span
                    class="text-xs font-normal text-fg-muted"
                    [fieldOf]="artifact"
                    [qitsField]="marks.latest"
                    >latest {{ artifact.latest ?? 'unknown' }}</span
                  >
                </h4>
                @if (artifact.rows.length) {
                  <ul
                    class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                    [attr.aria-label]="'Dependents of ' + artifact.name"
                  >
                    @for (dependent of artifact.rows; track dependent.key) {
                      <li
                        class="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,10rem)_5rem] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-[1fr_auto]"
                        [qitsEntity]="dependent"
                        entityKey="key"
                      >
                        <a
                          class="truncate text-accent no-underline hover:underline"
                          [qitsExit]="repositoryLinks.opening.repository"
                          [exitParams]="repositoryLinks.params(dependent.repository)"
                          [fieldOf]="dependent"
                          qitsField="repository"
                          >{{ dependent.repository }}</a
                        >
                        <span
                          class="flex min-w-0 flex-wrap items-baseline gap-x-2 max-md:col-start-1"
                        >
                          <span
                            class="font-mono break-all text-fg-soft"
                            [fieldOf]="dependent"
                            qitsField="artifactName"
                            >{{ dependent.artifactName }}</span
                          >
                          <span
                            class="text-xs text-fg-muted"
                            [fieldOf]="dependent"
                            qitsField="artifactEcosystem"
                            >{{ dependent.artifactEcosystem }}</span
                          >
                        </span>
                        <span
                          class="flex flex-wrap items-baseline gap-x-2 text-xs max-md:col-start-1"
                        >
                          <span
                            class="font-mono text-fg-soft"
                            [fieldOf]="dependent"
                            qitsField="embeddedVersion"
                            >{{ dependent.embeddedVersion }}</span
                          >
                          <span
                            class="text-fg-muted"
                            [fieldOf]="dependent"
                            [qitsField]="marks.direct"
                            >{{ dependent.direct ? 'direct' : 'transitive' }}</span
                          >
                        </span>
                        <ui-chip
                          class="justify-self-end max-md:col-start-2 max-md:row-start-1"
                          [label]="dependent.currency"
                          [tone]="currencyTone(dependent.currency)"
                          [fieldOf]="dependent"
                          [qitsField]="marks.embedded"
                        />
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="m-0 text-sm text-fg-muted">Nothing of ours embeds it.</p>
                }
              </div>
            } @empty {
              <p class="m-0 text-sm text-fg-muted" data-no-dependents>
                Nothing of ours embeds what {{ name() }} publishes.
              </p>
            }
          </ui-spinner>
        </section>

        <section
          aria-labelledby="repository-downstream"
          class="mb-8"
          [qitsEntityList]="downstream"
          data-downstream
        >
          <h3 id="repository-downstream" class="mt-0 mb-3 text-base font-semibold">Downstream</h3>
          <ui-load-failure
            message="What is downstream of this repository could not be read."
            [class.hidden]="downstreamState() !== 'error' || refusal()"
            (retry)="downstream.reload()"
          />
          <ui-spinner [state]="downstreamState()" [class.hidden]="downstreamState() === 'error'">
            @if (downstreamRows().length) {
              <div class="overflow-x-auto rounded-md border border-line">
                <table class="w-full border-collapse text-left text-sm" aria-label="Downstream">
                  <caption
                    class="px-3 py-1.5 text-left text-xs text-fg-muted"
                    [fieldOf]="downstreamAnswer()"
                    [qitsField]="marks.downstream"
                  >
                    {{
                      downstreamCaption()
                    }}
                  </caption>
                  <thead class="bg-surface-muted text-xs text-fg-muted">
                    <tr>
                      <th class="px-3 py-1.5 font-semibold">Depth</th>
                      <th class="px-3 py-1.5 font-semibold">Repository</th>
                      <th class="px-3 py-1.5 font-semibold">Archetype</th>
                      <th class="px-3 py-1.5 font-semibold">Via</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of downstreamRows(); track entry.repository) {
                      <tr
                        class="border-t border-line-subtle"
                        [qitsEntity]="entry"
                        entityKey="repository"
                      >
                        <td class="px-3 py-1.5 tabular-nums" [fieldOf]="entry" qitsField="depth">
                          {{ entry.depth }}
                        </td>
                        <td class="px-3 py-1.5">
                          <a
                            class="break-all text-accent no-underline hover:underline"
                            [qitsExit]="repositoryLinks.opening.repository"
                            [exitParams]="repositoryLinks.params(entry.repository)"
                            [fieldOf]="entry"
                            qitsField="repository"
                            >{{ entry.repository }}</a
                          >
                        </td>
                        <td class="px-3 py-1.5" [fieldOf]="entry" qitsField="archetype">
                          {{ entry.archetype }}
                        </td>
                        <td
                          class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                          [fieldOf]="entry"
                          [qitsField]="marks.via"
                        >
                          {{ (entry.via ?? []).join(', ') }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="m-0 text-sm text-fg-muted" data-no-downstream>
                Nothing is downstream of {{ name() }}.
              </p>
            }
          </ui-spinner>
        </section>

        <section aria-labelledby="repository-releases" [qitsEntityList]="requests" data-releases>
          <h3 id="repository-releases" class="mt-0 mb-3 text-base font-semibold">Releases</h3>
          @if (unknown()) {
            <p class="m-0 text-sm text-fg-muted" data-unknown>
              This project has no repository {{ name() }}.
            </p>
          }
          <ui-load-failure
            message="This repository’s releases could not be read."
            [class.hidden]="releasesState() !== 'error' || unknown()"
            (retry)="retryReleases()"
          />
          <ui-spinner
            [state]="releasesState()"
            [class.hidden]="releasesState() === 'error' || unknown()"
          >
            @if (journey(); as journey) {
              <p
                class="mt-0 mb-3 text-sm text-fg"
                [qitsEntity]="journey"
                entityKey="repository"
                [fieldOf]="journey"
                [qitsField]="marks.adopters"
                data-adoption
              >
                {{ summary() }}
              </p>
            }
            @if (releases().length) {
              <ul
                class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                aria-label="Releases"
              >
                @for (release of releases(); track release.id) {
                  <li
                    class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                    [qitsEntity]="release"
                    entityKey="id"
                  >
                    <a
                      class="font-mono font-semibold text-accent no-underline hover:underline"
                      [qitsExit]="adopting.release"
                      [exitParams]="{ slug: slug(), repo: name(), version: release.version ?? '' }"
                      [fieldOf]="release"
                      qitsField="version"
                      >{{ release.version }}</a
                    >
                    <ui-chip
                      [label]="(release.state ?? 'unknown').toLowerCase()"
                      [tone]="tone(release)"
                      [fieldOf]="release"
                      [qitsField]="marks.state"
                    />
                    <span
                      class="ml-auto text-xs text-fg-muted tabular-nums"
                      [attr.title]="instant(release.updatedAt)"
                      [fieldOf]="release"
                      [qitsField]="marks.updatedAt"
                      >{{ ago(release.updatedAt) }}</span
                    >
                  </li>
                }
              </ul>
            } @else {
              <p class="m-0 text-sm text-fg-muted" data-no-releases>
                {{ name() }} has no release yet.
              </p>
            }
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryDependentsPage {
  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);

  /** A release's adoption page, under the repository (qits-2489). */
  protected readonly adopting = outcomes('open-repository-adoption', {
    release: exit('projects/:slug/components/:repo/adoption/:version'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The repository the address names. */
  protected readonly name = computed(() => this.params().get('repo') ?? '');
  protected readonly slug = computed(() => this.selected.slug() ?? this.params().get('slug') ?? '');

  /** The repository's name, in the browser only: the inventory's reads wait for it. */
  private readonly path = computed(() => {
    const name = this.name();
    return this.browser && name ? { path: { name } } : undefined;
  });

  /** Who embeds what it publishes; read once. */
  protected readonly dependents = qitsResource(MAINTENANCE_REPOSITORY_DEPENDENTS, () =>
    this.path(),
  );

  /** What is downstream of it; read once. */
  protected readonly downstream = qitsResource(MAINTENANCE_REPOSITORY_DOWNSTREAM, () =>
    this.path(),
  );

  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The project's repositories, for the address's repository's id. */
  protected readonly repositories = qitsResource(PROJECT_REPOSITORY_PAGE, () => {
    const projectId = this.projectId();
    return projectId ? { path: { projectId } } : undefined;
  });

  private readonly found = computed(() =>
    repositoryNamed(
      (this.repositories.hasValue() ? this.repositories.value() : undefined)?.entries ?? [],
      this.name(),
    ),
  );

  /** The repository's id, once found. */
  private readonly repoId = computed(() => this.found()?.id);

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(() => this.repositories.hasValue() && !this.found());

  /** The repository's whole history of requests, read again after one of its own moves. */
  protected readonly requests = qitsResource(
    REPOSITORY_RELEASE_REQUESTS,
    () => {
      const repoId = this.repoId();
      return repoId ? { path: { repoId }, query: { state: 'all' } } : undefined;
    },
    {
      refreshOn: {
        names: [...RELEASE_REQUEST_EVENTS],
        when: (event: QitsDomainEvent) => {
          const repoId = this.repoId();
          return !!repoId && payloadIds(event).repositoryId === repoId;
        },
      },
    },
  );

  /** The newest released versions, newest first. */
  protected readonly releases = computed((): readonly RepositoryReleaseRequest[] =>
    releasedVersions(
      (this.requests.hasValue() ? this.requests.value() : undefined)?.requests ?? [],
    ),
  );

  /** The newest release's version; `''` while there is none. */
  private readonly newest = computed(() => this.releases()[0]?.version ?? '');

  /** The newest release's journey, read once per release. */
  protected readonly adoption = qitsResource(MAINTENANCE_ADOPTION, () => {
    const repository = this.path()?.path.name;
    const version = this.newest();
    return repository && version ? { query: { repository, version } } : undefined;
  });

  /** The journey, once read. */
  protected readonly journey = computed((): AdoptionJourney | undefined =>
    this.adoption.hasValue() ? (this.adoption.value() ?? undefined) : undefined,
  );

  /** "n of m downstream carry <version>". */
  protected readonly summary = computed(() =>
    adoptionSummary(this.journey()?.adopters ?? [], this.newest()),
  );

  protected readonly groups = computed((): readonly ArtifactGroup[] =>
    this.dependents.hasValue() ? artifactGroups(this.dependents.value() ?? {}) : [],
  );

  protected readonly downstreamAnswer = computed(
    (): RepositoryDownstream =>
      (this.downstream.hasValue() ? this.downstream.value() : undefined) ?? {},
  );

  protected readonly downstreamRows = computed(() => this.downstreamAnswer().downstream ?? []);

  protected readonly downstreamCaption = computed(() => {
    const n = this.downstreamRows().length;
    return `${n} ${n === 1 ? 'repository' : 'repositories'} downstream`;
  });

  /** Whether any of qits-maintenance's reads was refused for the viewer's roles. */
  protected readonly refusal = computed(() =>
    [this.dependents, this.downstream, this.adoption].some((read) => refused(read)),
  );

  protected readonly dependentsState = computed(() => loadState(this.dependents));
  protected readonly downstreamState = computed(() => loadState(this.downstream));

  /** The releases: the project's repositories and the requests, both read. */
  protected readonly releasesState = computed((): LoadState => {
    const reads = [loadState(this.repositories), loadState(this.requests)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** Refresh: reads everything again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.dependents.reload();
        this.downstream.reload();
        this.repositories.reload();
        this.requests.reload();
        this.adoption.reload();
      },
    },
  ];

  protected retryReleases(): void {
    if (this.repositories.status() === 'error') this.repositories.reload();
    if (this.requests.status() === 'error') this.requests.reload();
  }

  protected readonly marks = MARKS;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);

  protected currencyTone(currency: Currency): ChipTone {
    return CURRENCY_TONE[currency];
  }

  protected tone(release: RepositoryReleaseRequest) {
    return requestTone(release.state);
  }
}

/** The data marks of what the page derives from its reads (each a class constant, as the rule reads). */
const MARKS = {
  latest: { derived: ['latest'] },
  direct: { derived: ['direct'] },
  embedded: { derived: ['embeddedVersion'] },
  via: { derived: ['via'] },
  downstream: { derived: ['downstream'] },
  adopters: { derived: ['adopters', 'version'] },
  state: { derived: ['state'] },
  updatedAt: { derived: ['updatedAt'] },
} as const;
