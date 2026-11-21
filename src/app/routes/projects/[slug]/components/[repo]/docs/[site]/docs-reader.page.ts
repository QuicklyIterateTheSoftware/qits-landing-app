import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  PLATFORM_ID,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  exit,
  external,
  outcomes,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  QitsTriggers,
  type QitsDomainEvent,
} from '@qits/angular';
import { QitsMermaidDiagram } from '@qits/ui-components';
import {
  bundlePathOf,
  categoriesOf,
  markdownParts,
  openapiPathOf,
  pagesInCategory,
  storyPages,
  storyTitle,
  type StoryPage,
} from '$core/docs/bundle-files';
import { kindOf, shortNameOf } from '$core/docs/doc-sections';
import { docsAppReadPath, parseReadPath } from '$core/docs/doc-url';
import { newestVersionOutcomes } from '$core/docs/reader-links';
import {
  branchOf,
  defaultVersion,
  distinctBranches,
  versionLabel,
  versionsOnBranch,
} from '$core/docs/doc-versions';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import { PROJECT_REPOSITORY_NAMES } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import { loadState } from '$core/resources/load-state';
import { isMissing, ResourceFamily } from '$core/resources/resource-family';
import {
  DOCS_REPOSITORY,
  type DocsCatalogSite,
  type DocsVersions,
} from '$core/ui-builder/docs.consumes';
import {
  DOCS_CATALOG,
  DOCS_FILE,
  DOCS_VERSION,
  DOCS_VERSIONS,
} from '$core/ui-builder/docs.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Markdown } from '$ui/components/markdown/markdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The body's reading: in place (Markdown, OpenAPI), or a hand-off to the page that reads it. */
type Body = 'markdown' | 'swagger' | 'contracts' | 'routes' | 'storybook';

/** Asks the file as text: a Markdown page, an OpenAPI document (the store labels YAML octet-stream). */
const AS_TEXT = { responseType: 'text' } as const;

/** Where swagger-ui's stylesheet is served: a non-injected global style (`angular.json`). */
const SWAGGER_CSS = '/swagger-ui.css';

/** No versions yet. */
const NO_VERSIONS: DocsVersions = { versions: [] };

/** No catalog entry yet (the marks' stand-in; a hand-off shows nothing of it). */
const NO_SITE: DocsCatalogSite = {
  name: '',
  versionCount: 0,
  latestVersion: '',
  latestPublishedAt: '',
};

/** No files yet. */
const NO_FILES = { files: [] as string[] };

/** One story of a Markdown bundle as the body draws it. */
interface ShownStory {
  readonly page: StoryPage;
  readonly anchor: string;
  readonly title: string;
  readonly state: LoadState;
  readonly parts: ReturnType<typeof markdownParts>;
}

/**
 * The docs reader (qits-2337), at `/projects/<slug>/repositories/<repo>/docs/<site>[/-/<version>]`
 * (under the publishing repository since qits-2486; the old `docs/read/…` addresses redirect here,
 * `DocsReadRedirectPage`): one docs site
 * of qits-artifacts' docs store, read in this app instead of qits-docs-frontend's `Reader`, whose
 * reads (`/docs/api/*` on qits-docs-service) are private. Every read is qits-artifacts' public
 * docs store, through the generated client; there is no qits-docs-service call.
 *
 * The site spans segments, so it is read off the URL (`parseReadPath`, `core/docs/doc-url.ts`):
 * the segments after `docs`, split on `/-/` into the site and an optional version. Three routes
 * render it: `docs/:site` and `docs/:site/-/:version`, which this app's own links name (the site
 * one segment, its `/` escaped), and `docs/**`, the same addresses split. It sits under the
 * repository, so the repository sidebar keeps Docs current.
 *
 * The header: the site's short name (`shortNameOf`) as the title, the full name below it, a link
 * back to the repository's Docs page, and native selects: Version (every version, `versionLabel`; the
 * version on screen stays listed when the branch narrowing drops it) and, for userflows only,
 * Branch, narrowing the versions (`versionsOnBranch`). A pick goes to `…/read/<site>/-/<version>`
 * keeping `?category=` (`pick-docs-version`). No version in the URL reads `defaultVersion` (the
 * newest of `main`, else the newest) in place, without a redirect.
 *
 * The body, by section (`kindOf`):
 * - userflows, guides, changelog: every `.md` of the version's file list (`storyPages`), each read
 *   on its own (`DOCS_FILE`, as text), drawn with `ui-markdown`, each `mermaid` fence with
 *   `<qits-mermaid-diagram>` (`markdownParts`). A relative image becomes that file's address on the
 *   docs store (`bundlePathOf`), so `ui-markdown` fetches it with the bearer where it has one.
 *   Categories are chips that push `?category=` (All clears it; a value naming no category is
 *   ignored), and a legend of jump links shows when more than one story does. A page that cannot be
 *   read says so in its place; the others still render. A changelog is a bundle of one page: no
 *   chips, no legend.
 * - apidocs: swagger-ui (`swagger-ui-dist`, imported lazily in the browser only, its stylesheet a
 *   non-injected global style), on the bundle's `openapi.*` (`openapiPathOf`) read as text and handed
 *   over as a `blob:` URL, so the library parses the YAML and never needs the bearer. It is told
 *   the document's docs store address and reads the `blob:` behind it (`requestInterceptor`), so
 *   what it renders is the same every run; `supportedSubmitMethods: []`, as the reader documents
 *   and calls nothing; that address, which needs the bearer to open, is hidden. Its box stays light in
 *   both schemes: swagger-ui paints for itself and has no dark theme.
 * - contracts and routes: no renderer, a hand-off (`open-docs-handoff`) to the repository the
 *   site's newest version names (the catalog's `latestRepository`, `DOCS_CATALOG`), its Contracts
 *   page or its UI builder, when it is one of the project's (`PROJECT_REPOSITORY_NAMES`); else it
 *   says the site names no repository of this project.
 * - storybook: a notice that the docs app serves it whole on the private network, linking there
 *   (`PlatformOrigins.page('docs')` + `/<slug>/read/<site>[/-/<version>]`, the one place this app
 *   still links the docs app). No iframe:
 *   a frame cannot send the bearer.
 *
 * The hand-offs (contracts, routes, Storybook) read the catalog only, never a version: whether
 * the site exists, and its publisher; Storybook links the docs app at the URL's version, else the
 * newest. They show no Version select.
 *
 * States: loading; a failed read with Retry (each read's own); an unknown site (`listDocsVersions`
 * 404 or no version at all; a hand-off's site missing from the catalog) and an unknown version
 * (`getDocsVersion` 404), each saying so with a link (back to Docs; to the newest).
 *
 * Staleness (qits-1270): published versions are immutable and the docs store emits no domain
 * event, so nothing on the stream could say a site moved, and the rule forbids a timer: no polling;
 * Refresh reads the version list again (the catalog, for a hand-off). Only the
 * hand-offs' project repositories follow `SCMPublishCommit` to the wrapper's main branch
 * (`movesWrapper`).
 */
@Component({
  selector: 'app-docs-reader-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    Markdown,
    PageLayoutComponent,
    QitsEntityList,
    QitsExit,
    QitsField,
    QitsMermaidDiagram,
    QitsTriggers,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="short()" [actions]="actions">
        <div class="mt-0 mb-4 flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
          <p class="m-0 flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <a
              class="font-semibold text-accent no-underline hover:underline"
              [qitsExit]="leaving.docs"
              [exitParams]="{ slug: slug(), repo: repo() }"
              data-back
              >← Docs</a
            >
            <span class="font-mono text-xs break-all text-fg-muted" data-site>{{ site() }}</span>
          </p>
          <div
            class="flex-wrap items-end gap-3"
            [class]="versionOptions().length ? 'flex' : 'hidden'"
            [qitsEntityList]="versions"
          >
            @if (body() === 'markdown' && kind() === 'userflows' && branches().length) {
              <label class="flex flex-col gap-0.5 text-xs text-fg-muted">
                Branch
                <select
                  aria-label="Branch"
                  class="h-8 max-w-64 rounded-md border border-line bg-surface px-2 text-sm text-fg"
                  [qitsTriggers]="[picking.version]"
                  [fieldOf]="versionMarks()"
                  [qitsField]="marks.branches"
                  (change)="pickBranch(selectValue($event))"
                >
                  @for (branch of branches(); track branch) {
                    <option [value]="branch" [selected]="branch === branch_()">{{ branch }}</option>
                  }
                </select>
              </label>
            }
            <label class="flex flex-col gap-0.5 text-xs text-fg-muted">
              Version
              <select
                aria-label="Version"
                class="h-8 max-w-64 rounded-md border border-line bg-surface px-2 font-mono text-sm text-fg"
                [qitsTriggers]="[picking.version]"
                [fieldOf]="versionMarks()"
                [qitsField]="marks.versions"
                (change)="pickVersion(selectValue($event))"
              >
                @for (option of versionOptions(); track option.version) {
                  <option [value]="option.version" [selected]="option.version === version()">
                    {{ option.label }}
                  </option>
                }
              </select>
            </label>
          </div>
        </div>

        <ui-load-failure
          [message]="failure()"
          [class.hidden]="state() !== 'error' || unknownSite() || unknownVersion()"
          (retry)="retry()"
        />

        @if (unknownSite()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown-site>
            No docs site {{ site() || '(none named)' }}.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.docs"
              [exitParams]="{ slug: slug(), repo: repo() }"
              >Back to Docs</a
            >
          </p>
        } @else if (unknownVersion()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown-version>
            {{ site() }} has no version {{ urlVersion() }}.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="toNewest.newest"
              [exitParams]="{ slug: slug(), repo: repo(), site: site() }"
              >Read the newest</a
            >
          </p>
        }

        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || unknownSite() || unknownVersion()"
        >
          @switch (body()) {
            @case ('markdown') {
              <div [qitsEntityList]="detail">
                <nav
                  class="mb-4 flex-wrap gap-1"
                  [class]="categories().length ? 'flex' : 'hidden'"
                  aria-label="Categories"
                  [fieldOf]="detailMarks()"
                  [qitsField]="marks.files"
                >
                  <a
                    class="flex h-7 items-center rounded-md border px-2 text-xs font-semibold no-underline"
                    [class]="!category() ? on : off"
                    [attr.aria-current]="!category() ? 'true' : null"
                    [routerLink]="[]"
                    [queryParams]="{ category: null }"
                    queryParamsHandling="merge"
                    >All</a
                  >
                  @for (name of categories(); track name) {
                    <a
                      class="flex h-7 items-center rounded-md border px-2 text-xs font-semibold no-underline"
                      [class]="category() === name ? on : off"
                      [attr.aria-current]="category() === name ? 'true' : null"
                      [routerLink]="[]"
                      [queryParams]="{ category: name }"
                      queryParamsHandling="merge"
                      >{{ name }}</a
                    >
                  }
                </nav>
                @if (stories().length > 1) {
                  <nav
                    class="mb-6 flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2"
                    aria-label="Stories"
                    [fieldOf]="detailMarks()"
                    [qitsField]="marks.files"
                  >
                    <span class="text-xs text-fg-muted">Stories</span>
                    @for (story of stories(); track story.page.path) {
                      <a
                        class="self-start border-l-2 border-line px-2 text-sm text-fg-soft no-underline hover:border-accent hover:text-fg"
                        [attr.href]="'#' + story.anchor"
                        (click)="jump($event, story.anchor)"
                        >{{ story.title }}</a
                      >
                    }
                  </nav>
                }
                <div class="flex flex-col divide-y divide-line">
                  @for (story of stories(); track story.page.path) {
                    <article
                      class="scroll-mt-16 py-6 first:pt-0"
                      [id]="story.anchor"
                      [attr.data-story]="story.page.path"
                      [fieldOf]="detailMarks()"
                      [qitsField]="marks.body"
                    >
                      @if (story.state === 'error') {
                        <p class="m-0 text-sm text-danger" data-story-failed>
                          This page could not be read.
                          <span class="font-mono text-xs text-fg-muted">{{ story.page.path }}</span>
                        </p>
                      } @else if (story.state === 'loading') {
                        <p class="m-0 text-sm text-fg-muted">Reading {{ story.page.path }}…</p>
                      } @else {
                        @for (part of story.parts; track $index) {
                          @if (part.kind === 'mermaid') {
                            <qits-mermaid-diagram
                              class="my-3 block overflow-x-auto"
                              [definition]="part.definition"
                              [label]="'Diagram in ' + story.title"
                            />
                          } @else {
                            <ui-markdown
                              [text]="part.text"
                              [resolveUrl]="resolverFor(story.page.path)"
                            />
                          }
                        }
                      }
                    </article>
                  } @empty {
                    <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-no-pages>
                      This version holds no Markdown page.
                    </p>
                  }
                </div>
              </div>
            }
            @case ('swagger') {
              <div [qitsEntityList]="detail">
                @if (openapiPath()) {
                  <div
                    class="min-h-48 rounded-md border border-line bg-[Canvas] [color-scheme:light] [&_.info_a:has(>.url)]:hidden"
                    [fieldOf]="detailMarks()"
                    [qitsField]="marks.body"
                    data-swagger
                    #swagger
                  ></div>
                } @else {
                  <p
                    class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
                    [class.hidden]="!detailValue()"
                    [fieldOf]="detailMarks()"
                    [qitsField]="marks.files"
                    data-no-openapi
                  >
                    This bundle carries no OpenAPI document.
                  </p>
                }
              </div>
            }
            @case ('storybook') {
              <div
                class="rounded-md border border-line bg-surface px-4 py-6 text-sm text-fg"
                [qitsEntityList]="catalog"
                data-storybook
              >
                <p class="m-0 mb-2">
                  Storybook is served whole by the docs app, on the private network.
                </p>
                @if (storybookHref(); as href) {
                  <a
                    class="font-semibold text-accent no-underline hover:underline"
                    [href]="href"
                    [qitsTriggers]="[handingOff.storybook]"
                    [fieldOf]="siteMarks()"
                    qitsField="name"
                    (click)="openStorybook($event, href)"
                    >Open {{ short() }} {{ label(urlVersion() ?? '') }} in the docs app</a
                  >
                }
              </div>
            }
            @default {
              <div
                class="rounded-md border border-line bg-surface px-4 py-6 text-sm text-fg"
                [qitsEntityList]="catalog"
                data-handoff
              >
                @if (handoffRepository(); as repo) {
                  @if (body() === 'contracts') {
                    <p class="m-0" [fieldOf]="siteMarks()" [qitsField]="marks.repository">
                      Contracts are read on {{ repo }}’s Contracts page.
                      <a
                        class="font-semibold text-accent no-underline hover:underline"
                        [qitsExit]="handingOff.contracts"
                        [exitParams]="{ slug: slug(), repo }"
                        [fieldOf]="siteMarks()"
                        [qitsField]="marks.repository"
                        >Open the Contracts page</a
                      >
                    </p>
                  } @else {
                    <p class="m-0" [fieldOf]="siteMarks()" [qitsField]="marks.repository">
                      Routes are explored in {{ repo }}’s UI builder.
                      <a
                        class="font-semibold text-accent no-underline hover:underline"
                        [qitsExit]="handingOff.builder"
                        [exitParams]="{ slug: slug(), repo }"
                        [fieldOf]="siteMarks()"
                        [qitsField]="marks.repository"
                        >Open in the UI builder</a
                      >
                    </p>
                  }
                } @else {
                  <p class="m-0 text-fg-muted" data-no-repository>
                    {{ site() }} names no repository of this project.
                  </p>
                }
              </div>
            }
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class DocsReaderPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly origins = inject(PlatformOrigins);

  /** Back to the repository's Docs page (the back link, an unknown site's, qits-2486). */
  protected readonly leaving = outcomes('leave-docs-site', {
    docs: exit('projects/:slug/components/:repo/docs'),
  });

  /** An unknown version's link to the newest (app-wide: it shows on the versioned addresses only). */
  protected readonly toNewest = newestVersionOutcomes();

  /** The Version and Branch selects: a pick reads that version, keeping `?category=`. */
  protected readonly picking = outcomes('pick-docs-version', {
    version: exit('projects/:slug/components/:repo/docs/:site/-/:version'),
  });

  /** The bodies this page does not draw: the pages that read them, or the docs app (Storybook). */
  protected readonly handingOff = outcomes('open-docs-handoff', {
    contracts: exit('projects/:slug/components/:repo/contracts'),
    builder: exit('projects/:slug/components/:repo/ui-builder'),
    storybook: external('docs'),
  });

  /**
   * The reads as the marks take them: an answer, or an empty one of the same shape until it is in
   * (`[fieldOf]` takes an object).
   */
  protected readonly versionMarks = computed((): DocsVersions => this.versionList() ?? NO_VERSIONS);
  protected readonly detailMarks = computed(() => this.detailValue() ?? NO_FILES);
  protected readonly siteMarks = computed((): DocsCatalogSite => this.catalogSite() ?? NO_SITE);

  /** The marks over values a helper derives (class constants, which the rule trusts). */
  protected readonly marks = {
    versions: { derived: ['versions'] },
    branches: { derived: ['versions'] },
    files: { derived: ['files'] },
    /** A page's body: the file the list names, read on its own (`getDocsFile`). */
    body: { derived: ['files'] },
    repository: { derived: ['latestRepository'] },
  } as const;

  /** The category chips' chosen and unchosen looks. */
  protected readonly on = 'border-accent-line bg-accent-soft text-accent';
  protected readonly off = 'border-line bg-surface text-fg-soft';

  private readonly url = toSignal(this.route.url, { initialValue: this.route.snapshot.url });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * The site and the version the address names: the segments after
   * `projects/:slug/components/:repo/docs`.
   */
  private readonly read = computed(() =>
    parseReadPath(
      this.url()
        .slice(5)
        .map((segment) => segment.path),
    ),
  );

  /** The repository the address names (qits-2486): the site's publisher. */
  protected readonly repo = computed(() => this.url()[3]?.path ?? '');

  protected readonly site = computed(() => this.read().site);
  protected readonly urlVersion = computed(() => this.read().version);
  protected readonly short = computed(() => shortNameOf(this.site()) || 'Docs site');
  protected readonly kind = computed(() => kindOf(this.site()));
  protected readonly body = computed((): Body => {
    switch (this.kind()) {
      case 'userflows':
      case 'guides':
      case 'changelog':
        return 'markdown';
      case 'apidocs':
        return 'swagger';
      case 'contracts':
        return 'contracts';
      case 'routes':
        return 'routes';
      default:
        return 'storybook';
    }
  });

  /** The open project's slug, for every link the page makes. */
  protected readonly slug = computed(
    () => this.selected.slug() ?? this.route.snapshot.paramMap.get('slug') ?? '',
  );

  /** The `?category=` the URL asks for, when it names one of the version's categories. */
  protected readonly category = computed(() => {
    const asked = this.query().get('category');
    return asked && this.categories().includes(asked) ? asked : undefined;
  });

  /** Whether the body reads the version's file list (Markdown and OpenAPI bundles). */
  private readonly readsFiles = computed(
    () => this.body() === 'markdown' || this.body() === 'swagger',
  );

  /**
   * The site's versions, newest first, for the bodies drawn here, in the browser only (the server
   * render has no session). A hand-off needs no version: the page it hands off to reads its own.
   */
  protected readonly versions = qitsResource(DOCS_VERSIONS, () => {
    const site = this.site();
    return this.browser && site && this.readsFiles()
      ? { path: { repository: DOCS_REPOSITORY, site } }
      : undefined;
  });

  protected readonly versionList = computed(() =>
    this.versions.hasValue() ? this.versions.value() : undefined,
  );
  private readonly all = computed(() => this.versionList()?.versions ?? []);

  /** The version read: the URL's, else the newest of `main`, else the newest. */
  protected readonly version = computed(() => this.urlVersion() ?? defaultVersion(this.all()));

  /** The version's file list, for the bodies drawn here. */
  protected readonly detail = qitsResource(DOCS_VERSION, () => {
    const site = this.site();
    const version = this.version();
    return this.browser && site && version && this.readsFiles()
      ? { path: { repository: DOCS_REPOSITORY, site, version } }
      : undefined;
  });

  protected readonly detailValue = computed(() =>
    this.detail.hasValue() ? this.detail.value() : undefined,
  );

  /** Whether a hand-off shows: only then the catalog is read, for the site and its publisher. */
  private readonly handsOff = computed(() => !this.readsFiles());

  /** Whether the hand-off goes to a repository of the project (contracts, routes). */
  private readonly toRepository = computed(
    () => this.body() === 'contracts' || this.body() === 'routes',
  );

  /** The catalog, for the site and its publisher (`latestRepository`), when a hand-off shows. */
  protected readonly catalog = qitsResource(DOCS_CATALOG, () =>
    this.browser && this.handsOff() ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser && this.toRepository() ? this.selected.project()?.id : undefined,
  );

  /** The open project's repositories, to hand off only to one of them. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORY_NAMES,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    { refreshOn: { names: ['SCMPublishCommit'], when: (event) => this.commitsToWrapper(event) } },
  );

  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The catalog's entry for this site. */
  protected readonly catalogSite = computed(() => {
    const sites = this.catalog.hasValue() ? (this.catalog.value()?.sites ?? []) : [];
    return sites.find((site) => site.name === this.site());
  });

  /** The project's repository that published the site's newest version, if it is one. */
  protected readonly handoffRepository = computed(() => {
    const repository = this.catalogSite()?.latestRepository;
    const names = (this.repositoryAnswer()?.entries ?? []).map((entry) => entry.repository?.name);
    return repository && names.includes(repository) ? repository : undefined;
  });

  /** Every file of a Markdown bundle, one read each, by site, version and path. */
  private readonly files = new ResourceFamily(DOCS_FILE, this.injector);

  /** The version's Markdown pages. */
  private readonly pages = computed(() => storyPages(this.detailValue()?.files ?? []));
  protected readonly categories = computed(() => categoriesOf(this.pages()));

  /** The pages shown: the category's, or every page. */
  private readonly shownPages = computed(() => {
    const category = this.category();
    return category ? pagesInCategory(this.pages(), category) : this.pages();
  });

  /** The shown pages as the body draws them: each with its read, title and parts. */
  protected readonly stories = computed((): readonly ShownStory[] => {
    const site = this.site();
    const version = this.version() ?? '';
    return this.shownPages().map((page) => {
      const read = this.files.get(fileKey(site, version, page.path));
      const text = read?.hasValue() ? String(read.value() ?? '') : undefined;
      const state: LoadState =
        read?.status() === 'error' ? 'error' : text === undefined ? 'loading' : 'loaded';
      return {
        page,
        anchor: anchorOf(page.path),
        title: storyTitle(text ?? '', page.story),
        state,
        parts: text === undefined ? [] : markdownParts(text),
      };
    });
  });

  /** The OpenAPI document of an apidocs version. */
  protected readonly openapiPath = computed(() =>
    this.body() === 'swagger' ? openapiPathOf(this.detailValue()?.files ?? []) : undefined,
  );

  /** The OpenAPI document's text. */
  protected readonly openapi = qitsResource(DOCS_FILE, () => {
    const site = this.site();
    const version = this.version();
    const path = this.openapiPath();
    return this.browser && site && version && path
      ? { path: { repository: DOCS_REPOSITORY, site, version, path }, ...AS_TEXT }
      : undefined;
  });

  private readonly swaggerHost = viewChild<ElementRef<HTMLElement>>('swagger');

  /** The branches of the site's versions, newest first (userflows only show the select). */
  protected readonly branches = computed(() => distinctBranches(this.all()));

  /** The branch of the version read: what the Branch select shows as chosen. */
  protected readonly branch_ = computed(() => {
    const read = this.all().find((v) => v.version === this.version());
    return (read && branchOf(read)) ?? this.branches()[0];
  });

  /**
   * The Version select's options: the branch's versions (userflows) or all of them, with the
   * version on screen put first when the narrowing lost it, so the select never misreports it.
   */
  protected readonly versionOptions = computed(() => {
    if (!this.readsFiles()) return [];
    const narrowed =
      this.kind() === 'userflows' ? versionsOnBranch(this.all(), this.branch_()) : [...this.all()];
    const names = narrowed.flatMap((v) => (v.version ? [v.version] : []));
    const current = this.version();
    if (current && !names.includes(current)) names.unshift(current);
    return names.map((version) => ({ version, label: versionLabel(version) }));
  });

  /**
   * Whether the site is unknown: no name; its versions missing (404) or none; for a hand-off, a
   * catalog that does not list it.
   */
  protected readonly unknownSite = computed(() => {
    if (!this.site()) return this.browser;
    if (!this.readsFiles()) return this.catalog.hasValue() && !this.catalogSite();
    return isMissing(this.versions) || (this.versions.hasValue() && this.all().length === 0);
  });

  /** Whether the version the URL names is missing (404). */
  protected readonly unknownVersion = computed(() => !this.unknownSite() && isMissing(this.detail));

  /** The reads the body needs, as one state. */
  protected readonly state = computed((): LoadState => {
    const reads: LoadState[] = [];
    if (this.readsFiles()) reads.push(loadState(this.versions), loadState(this.detail));
    if (this.handsOff()) reads.push(loadState(this.catalog));
    if (this.toRepository()) reads.push(loadState(this.repositories));
    if (this.openapi.status() !== 'idle') reads.push(loadState(this.openapi));
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** What failed, in words. */
  protected readonly failure = computed(() => {
    if (this.versions.status() === 'error') return 'This site’s versions could not be read.';
    if (this.detail.status() === 'error') return 'This version’s files could not be read.';
    if (this.openapi.status() === 'error') return 'The OpenAPI document could not be read.';
    if (this.catalog.status() === 'error') return 'The docs catalog could not be read.';
    return 'This project’s repositories could not be read.';
  });

  /** The docs app's reader of a Storybook site, at the URL's version, else its newest. */
  protected readonly storybookHref = computed(() => {
    const origin = this.origins.page('docs');
    const slug = this.slug();
    return origin && slug && this.site()
      ? `${origin}${docsAppReadPath(`/${slug}/`, this.site(), this.urlVersion())}`
      : '';
  });

  /** Refresh: reads the versions again, and the catalog when a hand-off shows (no event says either moved). */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        if (this.readsFiles()) this.versions.reload();
        if (this.handsOff()) this.catalog.reload();
        if (this.toRepository()) this.repositories.reload();
      },
    },
  ];

  constructor() {
    // Each shown page is read once, as text; a failed one again when Retry asks.
    effect(() => {
      const site = this.site();
      const version = this.version();
      if (!this.browser || !site || !version || this.body() !== 'markdown') return;
      const pages = this.shownPages();
      untracked(() => {
        for (const page of pages) {
          this.files.read(fileKey(site, version, page.path), {
            path: { repository: DOCS_REPOSITORY, site, version, path: page.path },
            ...AS_TEXT,
          });
        }
      });
    });

    // swagger-ui, loaded on the first OpenAPI document, mounted again on each new one.
    let objectUrl: string | undefined;
    const revoke = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    };
    effect(() => {
      const host = this.swaggerHost()?.nativeElement;
      const text = this.openapi.hasValue() ? this.openapi.value() : undefined;
      if (!this.browser || !host || typeof text !== 'string') return;
      untracked(() => {
        revoke();
        const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }));
        objectUrl = url;
        // swagger-ui is told the document's docs store address, which it shows and which stays
        // the same run after run (a freeze holds it), and reads the `blob:` behind it instead.
        const shown = this.resolverFor('')(this.openapiPath() ?? '');
        this.loadSwaggerStyles();
        void import('swagger-ui-dist/swagger-ui-es-bundle.js').then(({ default: SwaggerUI }) => {
          if (objectUrl !== url) return;
          host.replaceChildren();
          SwaggerUI({
            url: shown,
            requestInterceptor: (request: { url: string }) => {
              if (request.url === shown) request.url = url;
              return request;
            },
            domNode: host,
            presets: [SwaggerUI.presets.apis],
            supportedSubmitMethods: [],
          });
        });
      });
    });
    inject(DestroyRef).onDestroy(revoke);
  }

  /** Puts swagger-ui's stylesheet in the document once. */
  private loadSwaggerStyles(): void {
    if (this.document.head.querySelector(`link[href="${SWAGGER_CSS}"]`)) return;
    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SWAGGER_CSS;
    this.document.head.appendChild(link);
  }

  /**
   * `ui-markdown`'s `resolveUrl` for a page: a relative reference becomes its docs store address,
   * spelled as the generated client spells `getDocsFile` (each parameter one encoded segment, the
   * file path's `/` as `%2F`): the address `DOCS_FILE` would read that file at (qits-2409).
   */
  protected resolverFor(page: string): (url: string) => string {
    const site = this.site();
    const version = this.version() ?? '';
    const base = this.origins.api('artifacts');
    return (url) => {
      const path = bundlePathOf(page, url);
      if (!path || !site || !version) return url;
      const [repository, name, at, file] = [DOCS_REPOSITORY, site, version, path].map((s) =>
        encodeURIComponent(s),
      );
      return `${base}/artifacts/docs/${repository}/${name}/-/${at}/${file}`;
    };
  }

  /** A Version pick: reads it, keeping the category. */
  protected pickVersion(version: string): void {
    if (!version || version === this.version()) return;
    void this.picking.version.go(
      { slug: this.slug(), repo: this.repo(), site: this.site(), version },
      { queryParams: { category: this.query().get('category') ?? undefined } },
    );
  }

  /** A Branch pick: reads that branch's newest version. */
  protected pickBranch(branch: string): void {
    const newest = versionsOnBranch(this.all(), branch)[0]?.version;
    if (newest) this.pickVersion(newest);
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /** A legend link scrolls to its story; the fragment stays out of the router. */
  protected jump(event: Event, anchor: string): void {
    event.preventDefault();
    this.document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }

  /** Leaves for the docs app's Storybook reader through `open-docs-handoff`, which records it. */
  protected openStorybook(event: MouseEvent, href: string): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    this.handingOff.storybook.leave(href);
  }

  /** Reads again what failed. */
  protected retry(): void {
    for (const read of [
      this.versions,
      this.detail,
      this.openapi,
      this.catalog,
      this.repositories,
    ]) {
      if (read.status() === 'error') read.reload();
    }
  }

  protected label(version: string): string {
    return versionLabel(version);
  }

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }
}

/** A file read's key in the family. */
function fileKey(site: string, version: string, path: string): string {
  return `${site}/-/${version}/${path}`;
}

/** A story's element id: its path, with every character an id selector would trip on replaced. */
function anchorOf(path: string): string {
  return `story-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}
