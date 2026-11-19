import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  exit,
  external,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  QitsTriggers,
  type QitsDomainEvent,
} from '@qits/angular';
import { repositoryNamed } from '$core/ci/repository-ci';
import { docBlocks, publishedBy, sectionOf, shortNameOf } from '$core/docs/doc-sections';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { docsReadPath } from '$core/release-requests/release-links';
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
 * One repository's docs, at `/projects/<slug>/docs/repositories/<repository name>` (qits-2336):
 * the docs sites whose newest version this repository published, grouped as the project's Docs
 * page groups the whole catalog (`docBlocks`, `core/docs/doc-sections.ts`): one block per section
 * holding a site, in `DOC_SECTIONS` order, each with its label and site count. A row shows the
 * short name, the full name, the newest version, how many versions there are and how long ago the
 * newest was published (the instant on hover), as on the project's page.
 *
 * Two reads, each its own `qitsResource`, in the browser only (the server render has no session):
 * the project's repositories (`PROJECT_REPOSITORY_NAMES`), where the address's name is found
 * (`repositoryNamed`), and qits-artifacts' docs catalog (`DOCS_CATALOG`, `listDocsSites` of the
 * `docs` repository), whose sites are kept by the repository their newest version names
 * (`latestRepository`, `publishedBy`): never by the site's name (`@contracts/qits-ci` is
 * `qits-ci-service`'s), never one read per site, never qits-docs-service.
 *
 * `?section=<route segment>` keeps that section's block alone (a value naming no section is
 * ignored): the docs app's old `/<slug>/<group>/<repository>/<section>` addresses land here so.
 *
 * A row opens the site's reader on the docs app until qits-2337 moves it here, the same exit as
 * the project's page (`open-docs-site` `open`, `docsReadPath` without a version, same tab).
 *
 * States: loading, a failed read (either) with Retry, the unknown repository (with a link back to
 * the project's Docs page, and no rows), a repository that published no site, and a `?section=`
 * the repository holds no site of, with a link that clears it.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`) → the
 * project's repositories. The docs store emits no domain event when a release publishes a site,
 * so nothing on the stream could say the catalog moved, and the rule forbids a timer: no polling;
 * Refresh reads both again.
 */
@Component({
  selector: 'app-repository-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsTriggers,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="repo()" [actions]="actions">
        <p class="mt-0 mb-4 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.docs"
            [exitParams]="{ slug: slug() }"
            data-back
            >← Docs</a
          >
          <span class="text-fg-soft">
            · Docs sites whose newest version this repository published</span
          >
        </p>
        <ui-load-failure
          message="This repository’s docs could not be read."
          [class.hidden]="state() !== 'error' || unknown()"
          (retry)="retry()"
        />
        @if (unknown()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown>
            This project has no repository {{ repo() }}.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.docs"
              [exitParams]="{ slug: slug() }"
              >Back to Docs</a
            >
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || unknown()"
        >
          <nav
            class="mb-4 flex-wrap gap-1"
            [class]="mine().length ? 'flex' : 'hidden'"
            aria-label="Sections"
            [qitsEntityList]="sites"
          >
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
                </div>
                <ul
                  class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0"
                  [attr.aria-label]="block.section.label"
                >
                  @for (site of block.sites; track site.name) {
                    <li [qitsEntity]="site" entityKey="name">
                      <a
                        class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 no-underline hover:bg-surface-muted"
                        [attr.href]="href(site) || null"
                        [qitsTriggers]="href(site) ? [opening.open] : []"
                        (click)="open($event, site)"
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
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && mine().length === 0 ? 'block' : 'hidden'"
            data-empty
          >
            {{ repo() }} has published no docs site yet. A release declares
            <code>{{ docsType }}</code> to publish here.
          </p>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="
              state() === 'loaded' && mine().length > 0 && blocks().length === 0
                ? 'block'
                : 'hidden'
            "
            data-no-match
          >
            No docs site of {{ repo() }} in {{ section()?.label }}.
            <a
              class="text-accent no-underline hover:underline"
              [routerLink]="[]"
              [queryParams]="{ section: null }"
              queryParamsHandling="merge"
              >Clear the filter</a
            >
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class RepositoryDocsPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly docsOrigin = inject(PlatformOrigins).page('docs');

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');

  /** The open project's slug, for the links back to its Docs page and to the readers. */
  protected readonly slug = computed(() => this.selected.slug() ?? this.params().get('slug') ?? '');

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** A row: the site's reader on the docs app, until qits-2337 moves it here. Same tab. */
  protected readonly opening = outcomes('open-docs-site', { open: external('docs') });

  /** Back to the project's Docs page. */
  protected readonly leaving = outcomes('leave-repository-docs', {
    docs: exit('projects/:slug/docs'),
  });

  /** The marks over values a helper derives from the site (class constants, which the rule trusts). */
  protected readonly marks = {
    /** A section's heading and count: which sites show is their names and their publisher. */
    sections: { derived: ['sites'] },
    shortName: { derived: ['name'] },
    versionCount: { derived: ['versionCount'] },
    publishedAt: { derived: ['latestPublishedAt'] },
  } as const;

  /** The section filter's chosen and unchosen looks. */
  protected readonly on = 'border-accent-line bg-accent-soft text-accent';
  protected readonly off = 'border-line bg-surface text-fg-soft';

  /** How a release asks to publish here, as its `release.yml` spells it. */
  protected readonly docsType = '{ type: docs }';

  /** The section the URL keeps alone (`?section=`), or none: absent, or naming no section. */
  protected readonly section = computed(() => sectionOf(this.query().get('section')));

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

  /** Every docs site, in the browser only (the server render has no session). */
  protected readonly sites = qitsResource(DOCS_CATALOG, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(
    () =>
      !!this.repositoryAnswer() &&
      !repositoryNamed(this.repositoryAnswer()?.entries ?? [], this.repo()),
  );

  /** The catalog as read; no sites until it answered. */
  protected readonly catalog = computed(
    (): DocsCatalog => (this.sites.hasValue() ? this.sites.value() : undefined) ?? NO_SITES,
  );

  /** The sites whose newest version this repository published. */
  protected readonly mine = computed((): readonly DocsCatalogSite[] =>
    publishedBy(this.catalog().sites ?? [], this.repo()),
  );

  /** The section filter's choices: every section holding one of its sites, with its count. */
  protected readonly sections = computed(() => docBlocks(this.mine()));

  /** The blocks the filter keeps. */
  protected readonly blocks = computed(() =>
    docBlocks(this.mine(), { only: this.section()?.kind }),
  );

  /** Failed when either read failed, loaded once both answered. */
  protected readonly state = computed((): LoadState => {
    const reads = [loadState(this.repositories), loadState(this.sites)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** Refresh: reads both again (no domain event says the catalog moved). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.repositories.reload();
        this.sites.reload();
      },
    },
  ];

  /** Reads again what failed. */
  protected retry(): void {
    if (this.repositories.status() === 'error') this.repositories.reload();
    if (this.sites.status() === 'error') this.sites.reload();
  }

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }

  /** The site's reader on the docs app, at its newest version; `''` while the origin is unknown. */
  protected href(site: DocsCatalogSite): string {
    const slug = this.slug();
    if (!this.docsOrigin || !slug || !site.name) return '';
    return `${this.docsOrigin}${docsReadPath(`/${slug}/`, site.name)}`;
  }

  /** Leaves for the site's reader through `open-docs-site`, which records the outcome. */
  protected open(event: MouseEvent, site: DocsCatalogSite): void {
    const href = this.href(site);
    if (!href || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.opening.open.leave(href);
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
