import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
} from '@qits/angular';
import { docBlocks, projectRepositoryOf, sectionOf, shortNameOf } from '$core/docs/doc-sections';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { PROJECT_REPOSITORY_NAMES } from '$core/repositories/repositories.operations';
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

/**
 * A project's Docs page (qits-2318), at `/projects/<slug>/docs`: every docs site qits-artifacts'
 * docs store holds (`DOCS_CATALOG`, `listDocsSites` of the `docs` repository; never qits-docs-service),
 * grouped as the docs app groups them (`DOC_SECTIONS`, `core/docs/doc-sections.ts`): one block per
 * section holding a site, in the sections' order, each with its label, description and site count,
 * its sites by short name. A row shows the short name, the full name, the newest version, how many
 * versions there are and how long ago the newest was published (`formatRelativeTime`, the instant
 * on hover).
 *
 * The filters are the URL's query, so a view is bookmarkable and Back undoes a change (a router
 * navigation, not a replace): `?section=<route segment>` keeps that section's block alone (a value
 * naming no section is ignored), `?q=` keeps the sites whose name holds it, ignoring case (applied
 * on Enter or when the field is left).
 *
 * A row opens the site's reader in this app (`DocsReaderPage`, qits-2337): `open-docs-site` `open`
 * goes to `docs/read/<site>`, without a version, so the newest of `main`.
 * A row whose newest version one of the project's repositories published (`latestRepository`,
 * `projectRepositoryOf`) names that repository beside it, a link to the repository's Docs page
 * (`open-repository-docs` `repository`, qits-2336); any other row names no repository.
 *
 * It reads through its own `qitsResource`s, in the browser only (the server render has no
 * session): the catalog, which the spinner follows, and the project's repositories
 * (`PROJECT_REPOSITORY_NAMES`), for those links alone (a failed read shows none). It marks what it
 * shows (qits-2141): the blocks are the catalog's read, each row a site by its name.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`) → the
 * project's repositories. The docs store emits no domain event when a release publishes a site, so
 * nothing on the stream could say the catalog moved, and the rule forbids a timer: Refresh reads
 * both again.
 */
@Component({
  selector: 'app-project-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Documentation" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">Every docs site the platform publishes</p>
        <ui-load-failure
          message="The docs catalog could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="sites.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <div
            class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"
            [class.hidden]="all().length === 0"
          >
            <nav class="flex flex-wrap gap-1" aria-label="Sections" [qitsEntityList]="sites">
              <a
                class="flex h-7 items-center rounded-md border px-2 text-xs font-semibold no-underline"
                [class]="!section() ? on : off"
                [attr.aria-current]="!section() ? 'true' : null"
                [routerLink]="[]"
                [queryParams]="{ section: null }"
                queryParamsHandling="merge"
                >All</a
              >
              @for (block of sections(); track block.section.kind) {
                <a
                  class="flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold no-underline"
                  [class]="section()?.kind === block.section.kind ? on : off"
                  [attr.aria-current]="section()?.kind === block.section.kind ? 'true' : null"
                  [routerLink]="[]"
                  [queryParams]="{ section: block.section.route }"
                  queryParamsHandling="merge"
                  [fieldOf]="catalog()"
                  [qitsField]="marks.sections"
                  >{{ block.section.label }}
                  <span class="font-normal text-fg-muted tabular-nums">{{
                    block.sites.length
                  }}</span></a
                >
              }
            </nav>
            <input
              type="search"
              class="h-7 min-w-48 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-fg"
              aria-label="Filter docs sites"
              placeholder="Filter by name"
              [value]="query() ?? ''"
              (keydown.enter)="setQuery(inputValue($event))"
              (change)="setQuery(inputValue($event))"
            />
          </div>
          <div class="flex flex-col gap-6" [qitsEntityList]="sites">
            @for (block of blocks(); track block.section.kind) {
              <section [attr.aria-labelledby]="'docs-section-' + block.section.route">
                <div
                  class="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                  [fieldOf]="catalog()"
                  [qitsField]="marks.sections"
                >
                  <h2
                    class="m-0 text-base font-semibold text-fg"
                    [attr.id]="'docs-section-' + block.section.route"
                  >
                    {{ block.section.label }}
                  </h2>
                  <span class="text-xs text-fg-muted tabular-nums">{{
                    plural(block.sites.length, 'site')
                  }}</span>
                  <p class="m-0 basis-full text-sm text-fg-soft">
                    {{ block.section.description }}
                  </p>
                </div>
                <ul
                  class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0"
                  [attr.aria-label]="block.section.label"
                >
                  @for (site of block.sites; track site.name) {
                    <li
                      class="flex flex-wrap items-baseline hover:bg-surface-muted"
                      [qitsEntity]="site"
                      entityKey="name"
                    >
                      <a
                        class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 no-underline"
                        [qitsExit]="opening.open"
                        [exitParams]="{ slug: slug(), site: site.name ?? '' }"
                      >
                        <span
                          class="font-semibold break-all text-accent"
                          [fieldOf]="site"
                          [qitsField]="marks.shortName"
                          >{{ short(site) }}</span
                        >
                        <span
                          class="font-mono text-xs break-all text-fg-muted"
                          [fieldOf]="site"
                          qitsField="name"
                          >{{ site.name }}</span
                        >
                        <span class="ml-auto flex flex-wrap items-baseline gap-x-3 text-xs">
                          <span
                            class="font-mono text-fg"
                            [fieldOf]="site"
                            qitsField="latestVersion"
                            >{{ site.latestVersion }}</span
                          >
                          <span
                            class="text-fg-muted tabular-nums"
                            [fieldOf]="site"
                            [qitsField]="marks.versionCount"
                            >{{ plural(site.versionCount ?? 0, 'version') }}</span
                          >
                          <span
                            class="text-fg-muted tabular-nums"
                            [attr.title]="instant(site.latestPublishedAt)"
                            [fieldOf]="site"
                            [qitsField]="marks.publishedAt"
                            >{{ ago(site.latestPublishedAt) }}</span
                          >
                        </span>
                      </a>
                      @if (repositoryOf(site); as repository) {
                        <a
                          class="px-3 py-2 font-mono text-xs break-all text-accent no-underline hover:underline"
                          [qitsExit]="toRepository.repository"
                          [exitParams]="{ slug: slug(), repo: repository }"
                          [title]="'Docs of ' + repository"
                          [fieldOf]="site"
                          [qitsField]="marks.repository"
                          data-repository
                          >{{ repository }}</a
                        >
                      }
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && all().length === 0 ? 'block' : 'hidden'"
          >
            Nothing is published yet. A release declares <code>{{ docsType }}</code> to publish
            here.
          </p>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="
              state() === 'loaded' && all().length > 0 && blocks().length === 0 ? 'block' : 'hidden'
            "
          >
            No docs site matches.
            <a
              class="text-accent no-underline hover:underline"
              [routerLink]="[]"
              [queryParams]="{ section: null, q: null }"
              queryParamsHandling="merge"
              >Clear filters</a
            >
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectDocsPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** A row: the site's reader, at its newest version (qits-2337). */
  protected readonly opening = outcomes('open-docs-site', {
    open: exit('projects/:slug/docs/read/:site'),
  });

  /** A row's repository: that repository's Docs page (qits-2336). */
  protected readonly toRepository = outcomes('open-repository-docs', {
    repository: exit('projects/:slug/docs/repositories/:repo'),
  });

  /** The open project's slug, for the links to its repositories' Docs pages. */
  protected readonly slug = computed(
    () => this.selected.slug() ?? this.route.snapshot.paramMap.get('slug') ?? '',
  );

  /** The marks over values a helper derives from the site (class constants, which the rule trusts). */
  protected readonly marks = {
    /** A section's heading and count: which sections show, and how full, is the sites' names. */
    sections: { derived: ['sites'] },
    shortName: { derived: ['name'] },
    versionCount: { derived: ['versionCount'] },
    publishedAt: { derived: ['latestPublishedAt'] },
    /** A row's repository: its publisher, when the project holds it. */
    repository: { derived: ['latestRepository'] },
  } as const;

  /** The section filter's chosen and unchosen looks. */
  protected readonly on = 'border-accent-line bg-accent-soft text-accent';
  protected readonly off = 'border-line bg-surface text-fg-soft';

  /** How a release asks to publish here, as its `release.yml` spells it. */
  protected readonly docsType = '{ type: docs }';

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The section the URL keeps alone (`?section=`), or none: absent, or naming no section. */
  protected readonly section = computed(() => sectionOf(this.params()?.get('section')));

  /** The name filter the URL asks for (`?q=`), or none. */
  protected readonly query = computed(() => this.params()?.get('q')?.trim() || undefined);

  /** Every docs site, in the browser only (the server render has no session). */
  protected readonly sites = qitsResource(DOCS_CATALOG, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The catalog as read; no sites until it answered. */
  protected readonly catalog = computed(
    (): DocsCatalog => (this.sites.hasValue() ? this.sites.value() : undefined) ?? NO_SITES,
  );

  /** The catalog's sites. */
  protected readonly all = computed((): readonly DocsCatalogSite[] => this.catalog().sites ?? []);

  /** The section filter's choices: every section holding a site, with its count. */
  protected readonly sections = computed(() => docBlocks(this.all()));

  /** The blocks the filters keep. */
  protected readonly blocks = computed(() =>
    docBlocks(this.all(), { only: this.section()?.kind, query: this.query() }),
  );

  protected readonly state = computed((): LoadState => loadState(this.sites));

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORY_NAMES,
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

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The project's repositories' names: a row links its publisher only when it is one of them. */
  private readonly repositoryNames = computed(
    () =>
      new Set(
        (this.repositoryAnswer()?.entries ?? []).flatMap((entry) =>
          entry.repository?.name ? [entry.repository.name] : [],
        ),
      ),
  );

  /** Refresh: reads the catalog and the repositories again (no domain event says the catalog moved). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sites.reload();
        this.repositories.reload();
      },
    },
  ];

  /** The project's repository that published the site's newest version, if any. */
  protected repositoryOf(site: DocsCatalogSite): string | undefined {
    return projectRepositoryOf(site, this.repositoryNames());
  }

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
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

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Puts the name filter into the URL's query (a new history entry), which narrows the blocks. */
  protected setQuery(text: string): void {
    const q = text.trim() || null;
    if ((this.query() ?? null) === q) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q },
      queryParamsHandling: 'merge',
    });
  }
}
