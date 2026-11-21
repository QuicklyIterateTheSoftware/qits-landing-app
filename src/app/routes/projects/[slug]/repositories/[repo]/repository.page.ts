import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
} from '@qits/angular';
import { repositoryNamed } from '$core/ci/repository-ci';
import { docBlocks, publishedBy, shortNameOf } from '$core/docs/doc-sections';
import type { ArtifactEntry } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_ARTIFACTS } from '$core/maintenance/maintenance.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import {
  kindLabel,
  repositoryArtifacts,
  type RepositoryArtifact,
} from '$core/repositories/repository-artifacts';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import { PROJECT_REPOSITORY_PAGE } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import { loadState } from '$core/resources/load-state';
import {
  DOCS_REPOSITORY,
  type DocsCatalog,
  type DocsCatalogSite,
} from '$core/ui-builder/docs.consumes';
import { DOCS_CATALOG } from '$core/ui-builder/docs.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No sites yet. */
const NO_SITES: DocsCatalog = { sites: [] };

/** No artifacts yet. */
const NO_ARTIFACTS: readonly ArtifactEntry[] = [];

/** No repository found (yet). */
const NO_REPOSITORY: NonNullable<RepositoryEntry['repository']> = {};

/** Whether a failed read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * One repository of the open project, at `/projects/<slug>/repositories/<repository name>`
 * (qits-2478): its name and archetype, links to its own pages (contracts and entities for a
 * service, the UI builder for a frontend or an app, its docs for every one), and the artifacts it
 * publishes, each linking the artifact store's page that shows it.
 *
 * Three reads, each its own `qitsResource`, in the browser only (the server render has no session):
 *
 * - the project's repositories (`PROJECT_REPOSITORY_PAGE`), where the address's name is found
 *   (`repositoryNamed`; an unknown name says so, with a link back to the Repositories page) and
 *   its archetype read, which decides the links;
 * - qits-maintenance's released artifacts (`MAINTENANCE_ARTIFACTS`, `listArtifacts`: what each
 *   release published, read off the release's declared outputs), kept by their `repository`
 *   (`repositoryArtifacts`): images, npm and maven packages and daemons, each with its newest
 *   version and how long ago it was built, its name linking its store page (`open-repository-artifact`:
 *   an image in its namespace's image store, `qits/qits-ci` → `artifacts/repositories/qits/images/qits-ci`).
 *   Only staff roles may read it: a 403 says so, and the rest of the page stays;
 * - qits-artifacts' docs catalog (`DOCS_CATALOG`), whose sites are kept by the repository their
 *   newest version names (`publishedBy`), each linking its docs store page (`open-repository-artifact`
 *   `docsSite`).
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`) → the
 * project's repositories. Neither qits-maintenance's inventory nor the docs store sends a domain
 * event when a release publishes, so neither is followed: Refresh reads all three again.
 */
@Component({
  selector: 'app-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
      <app-page-layout [title]="repo()" [actions]="actions">
        <p class="mt-0 mb-4 text-sm" [qitsEntityList]="repositories">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.repositories"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            data-back
            >← Repositories</a
          >
          <span
            class="text-fg-soft"
            [class.hidden]="!archetype()"
            [qitsEntity]="shown()"
            entityKey="id"
            [fieldOf]="shown()"
            [qitsField]="{ derived: ['archetype'] }"
          >
            · {{ archetype() }}</span
          >
        </p>
        <ui-load-failure
          message="This project’s repositories could not be read."
          [class.hidden]="repositoriesState() !== 'error'"
          (retry)="repositories.reload()"
        />
        @if (unknown()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown>
            This project has no repository {{ repo() }}.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.repositories"
              [exitParams]="{ slug: slug() }"
              [exitCurrent]="null"
              >Back to Repositories</a
            >
          </p>
        }
        <ui-spinner
          [state]="repositoriesState()"
          class="min-h-32"
          [class.hidden]="repositoriesState() === 'error' || unknown()"
        >
          <div class="flex flex-col gap-8" [qitsEntityList]="repositories">
            <nav
              class="flex flex-wrap gap-2"
              aria-label="Repository pages"
              [qitsEntity]="shown()"
              entityKey="id"
            >
              @if (service()) {
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.contracts"
                  [exitParams]="params()"
                  >Contracts →</a
                >
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.entities"
                  [exitParams]="params()"
                  >Entities →</a
                >
              }
              @if (frontend()) {
                <a
                  class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                  [qitsExit]="pages.uiBuilder"
                  [exitParams]="params()"
                  >UI builder →</a
                >
              }
              <a
                class="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg no-underline hover:bg-surface-muted"
                [qitsExit]="docs.repository"
                [exitParams]="params()"
                >Docs →</a
              >
            </nav>

            <section aria-labelledby="repository-artifacts" [qitsEntityList]="artifacts">
              <h2
                class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-fg"
                id="repository-artifacts"
              >
                Published artifacts
                <span
                  class="text-sm font-normal text-fg-muted tabular-nums"
                  [class.hidden]="artifactsState() !== 'loaded'"
                  [fieldOf]="artifactsAnswer()"
                  [qitsField]="{ derived: [] }"
                  >{{ plural(mine().length, 'artifact') }}</span
                >
              </h2>
              <p
                class="m-0 mb-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                role="alert"
                [class.hidden]="!artifactsRefused()"
              >
                Reading published artifacts needs a staff role: qits:admin, qits:desk or qits:agent.
              </p>
              <ui-load-failure
                message="This repository’s artifacts could not be read."
                [class.hidden]="artifactsState() !== 'error' || artifactsRefused()"
                (retry)="artifacts.reload()"
              />
              <ui-spinner
                [state]="artifactsState()"
                class="min-h-16"
                [class.hidden]="artifactsState() === 'error'"
              >
                <ul
                  class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                  aria-label="Published artifacts"
                  [class.hidden]="mine().length === 0"
                >
                  @for (artifact of mine(); track artifact.key) {
                    <li
                      class="grid grid-cols-[minmax(0,1fr)_10rem_minmax(0,14rem)] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-1"
                      [qitsEntity]="artifact"
                      entityKey="key"
                    >
                      @switch (artifact.place?.kind) {
                        @case ('image') {
                          <a
                            class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                            [qitsExit]="opening.image"
                            [exitParams]="{
                              repo: artifact.place?.store ?? '',
                              image: artifact.place?.name ?? '',
                            }"
                            [fieldOf]="artifact"
                            qitsField="name"
                            >{{ artifact.name }}</a
                          >
                        }
                        @case ('npm') {
                          <a
                            class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                            [qitsExit]="opening.npm"
                            [exitParams]="{
                              repo: artifact.place?.store ?? '',
                              package: artifact.place?.name ?? '',
                            }"
                            [fieldOf]="artifact"
                            qitsField="name"
                            >{{ artifact.name }}</a
                          >
                        }
                        @case ('maven') {
                          <a
                            class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                            [qitsExit]="opening.maven"
                            [exitParams]="{
                              repo: artifact.place?.store ?? '',
                              coordinate: artifact.place?.name ?? '',
                            }"
                            [fieldOf]="artifact"
                            qitsField="name"
                            >{{ artifact.name }}</a
                          >
                        }
                        @case ('daemon') {
                          <a
                            class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                            [qitsExit]="opening.daemon"
                            [exitParams]="{
                              repo: artifact.place?.store ?? '',
                              daemon: artifact.place?.name ?? '',
                            }"
                            [fieldOf]="artifact"
                            qitsField="name"
                            >{{ artifact.name }}</a
                          >
                        }
                        @default {
                          <span
                            class="font-mono font-semibold break-all text-fg"
                            [fieldOf]="artifact"
                            qitsField="name"
                            >{{ artifact.name }}</span
                          >
                        }
                      }
                      <span
                        class="text-xs text-fg-muted"
                        [fieldOf]="artifact"
                        [qitsField]="{ derived: ['ecosystem'] }"
                        >{{ kind(artifact) }}</span
                      >
                      <span class="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span class="font-mono text-fg" [fieldOf]="artifact" qitsField="version">{{
                          artifact.version
                        }}</span>
                        <span
                          class="text-fg-muted tabular-nums"
                          [attr.title]="instant(artifact.occurredAt)"
                          [fieldOf]="artifact"
                          [qitsField]="{ derived: ['occurredAt'] }"
                          >{{ ago(artifact.occurredAt) }}</span
                        >
                      </span>
                    </li>
                  }
                </ul>
                <p
                  class="m-0 px-3 py-4 text-sm text-fg-muted"
                  [class.hidden]="artifactsState() !== 'loaded' || mine().length > 0"
                  data-no-artifacts
                >
                  {{ repo() }} has published no image, package or daemon yet.
                </p>
              </ui-spinner>
            </section>

            <section aria-labelledby="repository-docs-sites" [qitsEntityList]="sites">
              <h2
                class="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lg font-semibold text-fg"
                id="repository-docs-sites"
              >
                Docs sites
                <span
                  class="text-sm font-normal text-fg-muted tabular-nums"
                  [class.hidden]="sitesState() !== 'loaded'"
                  [fieldOf]="catalog()"
                  [qitsField]="marks.sites"
                  >{{ plural(mySites().length, 'site') }}</span
                >
              </h2>
              <ui-load-failure
                message="This repository’s docs sites could not be read."
                [class.hidden]="sitesState() !== 'error'"
                (retry)="sites.reload()"
              />
              <ui-spinner
                [state]="sitesState()"
                class="min-h-16"
                [class.hidden]="sitesState() === 'error'"
              >
                <ul
                  class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 text-sm"
                  aria-label="Docs sites"
                  [class.hidden]="mySites().length === 0"
                >
                  @for (site of mySites(); track site.name) {
                    <li
                      class="grid grid-cols-[minmax(0,1fr)_10rem_minmax(0,14rem)] items-baseline gap-x-3 gap-y-1 px-3 py-2 max-md:grid-cols-1"
                      [qitsEntity]="site"
                      entityKey="name"
                    >
                      <a
                        class="font-mono font-semibold break-all text-accent no-underline hover:underline"
                        [qitsExit]="opening.docsSite"
                        [exitParams]="{ repo: docsStore, site: site.name ?? '' }"
                        [fieldOf]="site"
                        qitsField="name"
                        >{{ site.name }}</a
                      >
                      <span
                        class="text-xs text-fg-muted"
                        [fieldOf]="site"
                        [qitsField]="marks.shortName"
                        >{{ short(site) }}</span
                      >
                      <span class="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span
                          class="font-mono text-fg"
                          [fieldOf]="site"
                          qitsField="latestVersion"
                          >{{ site.latestVersion }}</span
                        >
                        <span
                          class="text-fg-muted tabular-nums"
                          [attr.title]="instant(site.latestPublishedAt)"
                          [fieldOf]="site"
                          [qitsField]="marks.publishedAt"
                          >{{ ago(site.latestPublishedAt) }}</span
                        >
                      </span>
                    </li>
                  }
                </ul>
                <p
                  class="m-0 px-3 py-4 text-sm text-fg-muted"
                  [class.hidden]="sitesState() !== 'loaded' || mySites().length > 0"
                  data-no-sites
                >
                  {{ repo() }} has published no docs site yet.
                </p>
              </ui-spinner>
            </section>
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.paramMap().get('repo') ?? '');

  /** The open project's slug. */
  protected readonly slug = computed(
    () => this.selected.slug() ?? this.paramMap().get('slug') ?? '',
  );

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The repository's own pages, as its card links them (epic qits-2000). */
  protected readonly pages = outcomes('open-repository-pages', {
    uiBuilder: exit('projects/:slug/repositories/:repo/ui-builder'),
    contracts: exit('projects/:slug/repositories/:repo/contracts'),
    entities: exit('projects/:slug/repositories/:repo/entities'),
  });

  /** The repository's Docs page (qits-2336). */
  protected readonly docs = outcomes('open-repository-docs', {
    repository: exit('projects/:slug/docs/repositories/:repo'),
  });

  /** A published artifact's page in the artifact store (qits-2324…qits-2328). */
  protected readonly opening = outcomes('open-repository-artifact', {
    image: exit('artifacts/repositories/:repo/images/:image'),
    npm: exit('artifacts/repositories/:repo/packages/:package'),
    maven: exit('artifacts/repositories/:repo/maven-packages/:coordinate'),
    daemon: exit('artifacts/repositories/:repo/daemons/:daemon'),
    docsSite: exit('artifacts/repositories/:repo/docs/:site'),
  });

  /** Back to the project's Repositories page. */
  protected readonly leaving = outcomes('leave-repository', {
    repositories: exit('projects/:slug/repositories'),
  });

  /** The docs store's repository, where every docs site is. */
  protected readonly docsStore = DOCS_REPOSITORY;

  /** The marks over values a helper derives (class constants, which the rule trusts). */
  protected readonly marks = {
    sites: { derived: ['sites'] },
    shortName: { derived: ['name'] },
    publishedAt: { derived: ['latestPublishedAt'] },
  } as const;

  /** The repository's pages' exit params. */
  protected readonly params = computed(() => ({ slug: this.slug(), repo: this.repo() }));

  /** The open project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORY_PAGE,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: ['SCMPublishCommit'],
        when: (event) => this.commitsToWrapper(event),
      },
    },
  );

  /** Every released artifact, in the browser only. */
  protected readonly artifacts = qitsResource(MAINTENANCE_ARTIFACTS, () =>
    this.browser ? {} : undefined,
  );

  /** Every docs site, in the browser only. */
  protected readonly sites = qitsResource(DOCS_CATALOG, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The address's repository, once the project's repositories are read. */
  private readonly found = computed(() =>
    repositoryNamed(this.repositoryAnswer()?.entries ?? [], this.repo()),
  );

  /** The repository as shown: the found one, or an empty one before (or without) it. */
  protected readonly shown = computed(() => this.found() ?? NO_REPOSITORY);

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(() => !!this.repositoryAnswer() && !this.found());

  /** The archetype, as a word: SERVICE reads "Service". */
  protected readonly archetype = computed(() => {
    const archetype = this.shown()?.archetype;
    return archetype ? archetype.charAt(0) + archetype.slice(1).toLowerCase() : '';
  });

  /** A frontend or an app, whose routes the UI builder shows (never judged by its name). */
  protected readonly frontend = computed(() => {
    const archetype = this.shown()?.archetype;
    return archetype === 'FRONTEND' || archetype === 'APP';
  });

  /** A service, whose contracts and entities have pages. */
  protected readonly service = computed(() => this.shown()?.archetype === 'SERVICE');

  /** The artifacts' answer, once there; none before. */
  protected readonly artifactsAnswer = computed(
    (): readonly ArtifactEntry[] =>
      (this.artifacts.hasValue() ? this.artifacts.value() : undefined) ?? NO_ARTIFACTS,
  );

  /** The artifacts this repository publishes. */
  protected readonly mine = computed((): readonly RepositoryArtifact[] =>
    repositoryArtifacts(this.artifactsAnswer(), this.repo()),
  );

  /** The catalog as read; no sites until it answered. */
  protected readonly catalog = computed(
    (): DocsCatalog => (this.sites.hasValue() ? this.sites.value() : undefined) ?? NO_SITES,
  );

  /** The docs sites whose newest version this repository published, in the Docs pages' order. */
  protected readonly mySites = computed((): readonly DocsCatalogSite[] =>
    docBlocks(publishedBy(this.catalog().sites ?? [], this.repo())).flatMap((block) => block.sites),
  );

  protected readonly repositoriesState = computed((): LoadState => loadState(this.repositories));
  protected readonly artifactsState = computed((): LoadState => loadState(this.artifacts));
  protected readonly sitesState = computed((): LoadState => loadState(this.sites));

  /** Whether the artifacts' read was refused for the viewer's roles. */
  protected readonly artifactsRefused = computed(() => refused(this.artifacts));

  /** Refresh: reads all three again (no domain event says a release published). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.repositories.reload();
        this.artifacts.reload();
        this.sites.reload();
      },
    },
  ];

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }

  protected kind(artifact: RepositoryArtifact): string {
    return kindLabel(artifact);
  }

  protected short(site: DocsCatalogSite): string {
    return shortNameOf(site.name ?? '');
  }

  protected plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
  }

  protected ago(iso: string | undefined): string {
    return formatRelativeTime(iso);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }
}
