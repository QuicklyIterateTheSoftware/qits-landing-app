import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { docBlocks, publishedBy, shortNameOf } from '$core/docs/doc-sections';
import type { ArtifactEntry } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_ARTIFACTS } from '$core/maintenance/maintenance.operations';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import {
  kindLabel,
  repositoryArtifacts,
  type RepositoryArtifact,
} from '$core/repositories/repository-artifacts';
import { loadState } from '$core/resources/load-state';
import {
  DOCS_REPOSITORY,
  type DocsCatalog,
  type DocsCatalogSite,
} from '$core/ui-builder/docs.consumes';
import { DOCS_CATALOG } from '$core/ui-builder/docs.operations';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No sites yet. */
const NO_SITES: DocsCatalog = { sites: [] };

/** No artifacts yet. */
const NO_ARTIFACTS: readonly ArtifactEntry[] = [];

/** Whether a failed read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * What one repository publishes (qits-2478), shown on its page and its Artifacts page (qits-2492):
 * two reads, each its own `qitsResource`, in the browser only (the server render has no session):
 *
 * - qits-maintenance's released artifacts (`MAINTENANCE_ARTIFACTS`, `listArtifacts`: what each
 *   release published), kept by their `repository` (`repositoryArtifacts`): images, npm and maven
 *   packages and daemons, each with its newest version and how long ago it was built, its name
 *   linking its store page (`open-repository-artifact`: an image in its namespace's image store,
 *   `qits/qits-ci` → `artifacts/qits/images/qits-ci` below the component, qits-2477). Only staff roles may read it: a
 *   403 says so, and the docs sites stay;
 * - qits-artifacts' docs catalog (`DOCS_CATALOG`), whose sites are kept by the repository their
 *   newest version names (`publishedBy`), each linking its docs store page
 *   (`open-repository-artifact` `docsSite`).
 *
 * Staleness (qits-1270): neither qits-maintenance's inventory nor the docs store sends a domain
 * event when a release publishes, so neither is followed: the page's Refresh calls `reload()`.
 */
@Component({
  selector: 'app-repository-published',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, QitsEntity, QitsEntityList, QitsExit, QitsField, Spinner],
  host: { class: 'flex flex-col gap-8' },
  template: `
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
                      slug: slug(),
                      repo: repo(),
                      store: artifact.place?.store ?? '',
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
                      slug: slug(),
                      repo: repo(),
                      store: artifact.place?.store ?? '',
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
                      slug: slug(),
                      repo: repo(),
                      store: artifact.place?.store ?? '',
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
                      slug: slug(),
                      repo: repo(),
                      store: artifact.place?.store ?? '',
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
      <ui-spinner [state]="sitesState()" class="min-h-16" [class.hidden]="sitesState() === 'error'">
        <!-- The repository's docs by category (qits-2486): each section holding one of its sites
             opens its Docs page narrowed to that section. -->
        <nav
          class="mb-3 flex-wrap gap-1"
          [class]="categories().length ? 'flex' : 'hidden'"
          aria-label="Docs by category"
        >
          @for (block of categories(); track block.section.kind) {
            <a
              class="flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft no-underline hover:bg-surface-muted"
              [qitsExit]="byCategory.section"
              [exitParams]="{ slug: slug(), repo: repo() }"
              [exitQueryParams]="{ section: block.section.route }"
              [fieldOf]="catalog()"
              [qitsField]="marks.sites"
              >{{ block.section.label }}
              <span class="font-normal text-fg-muted tabular-nums">{{
                block.sites.length
              }}</span></a
            >
          }
        </nav>
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
                [exitParams]="{
                  slug: slug(),
                  repo: repo(),
                  store: docsStore,
                  site: site.name ?? '',
                }"
                [fieldOf]="site"
                qitsField="name"
                >{{ site.name }}</a
              >
              <span class="text-xs text-fg-muted" [fieldOf]="site" [qitsField]="marks.shortName">{{
                short(site)
              }}</span>
              <span class="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span class="font-mono text-fg" [fieldOf]="site" qitsField="latestVersion">{{
                  site.latestVersion
                }}</span>
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
  `,
})
export class RepositoryPublished {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The repository's name. */
  readonly repo = input.required<string>();

  /** The open project's slug, for the links to the repository's docs. */
  readonly slug = input.required<string>();

  /** The repository's Docs page, narrowed to one category (qits-2486). */
  protected readonly byCategory = outcomes('open-repository-docs-category', {
    section: exit('projects/:slug/components/:repo/docs'),
  });

  /** A published artifact's page, below the component (qits-2324…qits-2328, qits-2477). */
  protected readonly opening = outcomes('open-repository-artifact', {
    image: exit('projects/:slug/components/:repo/artifacts/:store/images/:image'),
    npm: exit('projects/:slug/components/:repo/artifacts/:store/packages/:package'),
    maven: exit('projects/:slug/components/:repo/artifacts/:store/maven-packages/:coordinate'),
    daemon: exit('projects/:slug/components/:repo/artifacts/:store/daemons/:daemon'),
    docsSite: exit('projects/:slug/components/:repo/artifacts/:store/docs/:site'),
  });

  /** The docs store's repository, where every docs site is. */
  protected readonly docsStore = DOCS_REPOSITORY;

  /** The marks over values a helper derives (class constants, which the rule trusts). */
  protected readonly marks = {
    sites: { derived: ['sites'] },
    shortName: { derived: ['name'] },
    publishedAt: { derived: ['latestPublishedAt'] },
  } as const;

  /** Every released artifact, in the browser only. */
  protected readonly artifacts = qitsResource(MAINTENANCE_ARTIFACTS, () =>
    this.browser ? {} : undefined,
  );

  /** Every docs site, in the browser only. */
  protected readonly sites = qitsResource(DOCS_CATALOG, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

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

  /** The categories holding one of the repository's sites, in `DOC_SECTIONS` order. */
  protected readonly categories = computed(() =>
    docBlocks(publishedBy(this.catalog().sites ?? [], this.repo())),
  );

  protected readonly artifactsState = computed((): LoadState => loadState(this.artifacts));
  protected readonly sitesState = computed((): LoadState => loadState(this.sites));

  /** Whether the artifacts' read was refused for the viewer's roles. */
  protected readonly artifactsRefused = computed(() => refused(this.artifacts));

  /** Reads both again (no domain event says a release published). */
  reload(): void {
    this.artifacts.reload();
    this.sites.reload();
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
