import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  external,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsResource,
  QitsTriggers,
} from '@qits/angular';
import { docBlocks, sectionOf, shortNameOf } from '$core/docs/doc-sections';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { docsReadPath } from '$core/release-requests/release-links';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { DOCS_REPOSITORY, type DocsSite, type DocsSites } from '$core/ui-builder/docs.consumes';
import { DOCS_SITES } from '$core/ui-builder/docs.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** No sites yet. */
const NO_SITES: DocsSites = { sites: [] };

/**
 * A project's Docs page (qits-2318), at `/projects/<slug>/docs`: every docs site qits-artifacts'
 * docs store holds (`DOCS_SITES`, `listDocsSites` of the `docs` repository; never qits-docs-service),
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
 * A row opens the site's reader, which still lives on the docs app until qits-2337 moves it here:
 * `open-docs-site` `open` leaves for `PlatformOrigins.page('docs')` + `/<slug>/read/<site>`
 * (`docsReadPath`, the release page's docs links without the version, so the newest), same tab.
 *
 * It reads through its own `qitsResource`, in the browser only (the server render has no session),
 * and marks what it shows (qits-2141): the blocks are that read, each row a site by its name.
 *
 * Staleness (qits-1270): none followed. The docs store emits no domain event when a release
 * publishes a site, so nothing on the stream could say the catalog moved, and the rule forbids a
 * timer: Refresh reads the catalog again.
 */
@Component({
  selector: 'app-project-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsField,
    QitsTriggers,
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
  private readonly docsOrigin = inject(PlatformOrigins).page('docs');

  /** A row: the site's reader on the docs app, until qits-2337 moves it here. Same tab. */
  protected readonly opening = outcomes('open-docs-site', { open: external('docs') });

  /** The marks over values a helper derives from the site (class constants, which the rule trusts). */
  protected readonly marks = {
    /** A section's heading and count: which sections show, and how full, is the sites' names. */
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

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The section the URL keeps alone (`?section=`), or none: absent, or naming no section. */
  protected readonly section = computed(() => sectionOf(this.params()?.get('section')));

  /** The name filter the URL asks for (`?q=`), or none. */
  protected readonly query = computed(() => this.params()?.get('q')?.trim() || undefined);

  /** Every docs site, in the browser only (the server render has no session). */
  protected readonly sites = qitsResource(DOCS_SITES, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The catalog as read; no sites until it answered. */
  protected readonly catalog = computed(
    (): DocsSites => (this.sites.hasValue() ? this.sites.value() : undefined) ?? NO_SITES,
  );

  /** The catalog's sites. */
  protected readonly all = computed((): readonly DocsSite[] => this.catalog().sites ?? []);

  /** The section filter's choices: every section holding a site, with its count. */
  protected readonly sections = computed(() => docBlocks(this.all()));

  /** The blocks the filters keep. */
  protected readonly blocks = computed(() =>
    docBlocks(this.all(), { only: this.section()?.kind, query: this.query() }),
  );

  protected readonly state = computed((): LoadState => loadState(this.sites));

  /** Refresh: reads the catalog again (no domain event says it moved). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.sites.reload() },
  ];

  /** The site's reader on the docs app, at its newest version; `''` while the origin is unknown. */
  protected href(site: DocsSite): string {
    const slug = this.selected.slug();
    if (!this.docsOrigin || !slug || !site.name) return '';
    return `${this.docsOrigin}${docsReadPath(`/${slug}/`, site.name)}`;
  }

  /** Leaves for the site's reader through `open-docs-site`, which records the outcome. */
  protected open(event: MouseEvent, site: DocsSite): void {
    const href = this.href(site);
    if (!href || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.opening.open.leave(href);
  }

  protected short(site: DocsSite): string {
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
