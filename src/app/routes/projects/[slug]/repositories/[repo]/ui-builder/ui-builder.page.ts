import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { RoutesBundleStore } from '$core/ui-builder/routes-bundle.store';
import {
  initialRoute,
  matchRoute,
  routeCalls,
  routeFreezes,
  routeTree,
  type FreezeRecord,
} from '$core/ui-builder/routes-manifest';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** Which providers' calls the builder shows: every one, or those of one component. */
type Scope = { readonly all: true } | { readonly all: false; readonly component: string };

/**
 * The UI builder of one frontend (qits-1951), at `/projects/<slug>/repositories/<repo>/ui-builder`:
 * the frontend's routes as a tree, the selected route's frozen states as tabs with the selected
 * state's frozen page, and the calls the route makes, each with its provider and provider state.
 * Everything comes from the frontend's published `@routes/` bundle (`RoutesBundleStore`, qits-1947
 * and qits-1948); the page is a viewer and changes nothing.
 *
 * - Tree (left): `routeTree` of the manifest. Each route shows its state count. A segment without a
 *   route is greyed and disabled; a redirect and `**` are shown and not selectable. It opens on the
 *   first route with states; choosing another route goes back to its first state.
 * - States (middle): the route's freezes by name, as tabs that wrap. The selected one is read on
 *   demand and drawn in `<iframe sandbox="allow-same-origin" [srcdoc]>`, never with `allow-scripts`
 *   (see `preview`). A link clicked inside it selects the route it leads to (qits-1949, see
 *   `holdLinks`); the frame itself never navigates.
 * - Selection: the URL's query, `route` (the route's full path) and `state` (the freeze's name),
 *   so Back walks back through tree, tab and link clicks. A `route` that is not a route of the tree
 *   opens the first route with states, a `state` the route lacks its first state.
 * - Calls (right): `routeCalls`, the union of the freezes' calls, filtered to the scope.
 * - Scope (owner rule in qits-1951): `<project slug>-landing-app` covers every service; any other
 *   frontend only its own component, by the `component` its repository declares (the project's
 *   repositories, `RepositoriesStore`), and the calls panel says how many calls it hid. A frontend
 *   whose component is not known yet (the list is loading, or the project does not list it) hides
 *   nothing and shows no chip.
 *
 * The data is read in the browser only (the server render holds no token).
 *
 * Staleness (qits-1270): `SCMRelease` of the repository → its bundle (`RoutesBundleStore.follow`):
 * only a release publishes a new version. A freeze is keyed by its version, so it never goes stale.
 * The scope's repositories follow the wrapper's main branch (`RepositoriesStore.follow`).
 */
@Component({
  selector: 'app-ui-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, PageLayoutComponent, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[96rem] px-6 pt-8 pb-12">
      <app-page-layout>
        <div slot="header" class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 class="m-0 text-3xl leading-[1.1] font-bold">UI builder</h1>
          <span class="repo font-mono text-charcoal-brown-700">{{ repo() }}</span>
          @if (scopeLabel(); as label) {
            <ui-chip class="scope self-center" [label]="label" />
          }
        </div>
        <ui-spinner [state]="state()" class="min-h-48">
          @switch (bundle()?.status) {
            @case ('none') {
              <p class="none m-0 text-sm text-charcoal-brown-600">
                No frozen routes published for {{ repo() }}.
              </p>
            }
            @case ('loaded') {
              <div class="grid grid-cols-1 gap-6 xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
                <nav aria-label="Routes" class="text-[0.8125rem]">
                  @for (row of rows(); track row.fullPath) {
                    <button
                      type="button"
                      class="route flex w-full items-center gap-1.5 rounded py-0.5 pr-2 text-left font-mono"
                      [style.padding-left.rem]="0.5 + row.depth * 0.875"
                      [class]="
                        row.kind === 'route'
                          ? row.fullPath === selectedPath()
                            ? 'cursor-pointer bg-charcoal-brown-800 text-white'
                            : 'cursor-pointer hover:bg-charcoal-brown-50'
                          : 'cursor-default text-charcoal-brown-500'
                      "
                      [disabled]="row.kind !== 'route'"
                      [attr.aria-current]="row.fullPath === selectedPath() ? 'page' : null"
                      (click)="select(row.fullPath)"
                    >
                      <span class="shrink-0">{{ row.segment }}</span>
                      @if (row.kind === 'redirect') {
                        <span class="min-w-0 truncate text-[0.6875rem]"
                          >→ {{ row.redirectTo }}</span
                        >
                      }
                      @if (row.kind === 'route') {
                        <span class="ml-auto text-[0.6875rem] tabular-nums opacity-70">{{
                          row.states
                        }}</span>
                      }
                    </button>
                  }
                </nav>

                <section aria-label="Preview" class="min-w-0">
                  @if (selectedPath(); as path) {
                    <h2 class="m-0 mb-2 font-mono text-base">/{{ path }}</h2>
                    @if (freezes().length) {
                      <div role="tablist" aria-label="States" class="mb-2 flex flex-wrap gap-1">
                        @for (freeze of freezes(); track freeze.file; let i = $index) {
                          <button
                            type="button"
                            role="tab"
                            class="state cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                            [class]="
                              i === stateIndex()
                                ? 'bg-charcoal-brown-800 text-white'
                                : 'bg-charcoal-brown-100 text-charcoal-brown-700 hover:bg-charcoal-brown-200'
                            "
                            [attr.aria-selected]="i === stateIndex()"
                            (click)="pickState(freeze.name)"
                          >
                            {{ freeze.name }}
                          </button>
                        }
                      </div>
                      @if (linkNotice(); as notice) {
                        <p class="link-notice m-0 mb-2 truncate text-xs text-charcoal-brown-600">
                          {{ notice }}
                        </p>
                      }
                      @if (preview(); as html) {
                        <!--
                          sandbox without allow-scripts, always: the frozen page is drawn on this
                          page's own origin. allow-same-origin alone lets this page cancel the
                          frame's link clicks; nothing in the frame can run.
                        -->
                        <iframe
                          class="block h-[32rem] w-full rounded-md border border-charcoal-brown-200 bg-white"
                          sandbox="allow-same-origin"
                          [srcdoc]="html"
                          [title]="'Frozen state ' + (freeze()?.name ?? '')"
                          (load)="holdLinks($event)"
                        ></iframe>
                      } @else {
                        <div
                          class="frame-placeholder flex h-[32rem] items-center justify-center rounded-md border border-charcoal-brown-200 bg-white text-sm text-charcoal-brown-600"
                        >
                          {{
                            freezeFailed()
                              ? 'Could not read this frozen state.'
                              : 'Reading the frozen state…'
                          }}
                        </div>
                      }
                    } @else {
                      <p class="no-states m-0 text-sm text-charcoal-brown-600">
                        No screenshot test for this route, so nothing is frozen.
                      </p>
                    }
                  }
                </section>

                <aside aria-label="Calls" class="text-[0.8125rem]">
                  <h3 class="m-0 mb-1 text-xs font-semibold text-charcoal-brown-700 uppercase">
                    Calls and states
                  </h3>
                  <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                    @for (call of calls().shown; track $index) {
                      <li class="call">
                        <span class="block font-mono text-xs">{{ call.operationId }}</span>
                        <span class="block text-xs text-charcoal-brown-500"
                          >{{ call.provider }} · “{{ call.state }}”</span
                        >
                      </li>
                    } @empty {
                      @if (!calls().hidden) {
                        <li class="text-charcoal-brown-600">Its spec answers no request.</li>
                      }
                    }
                  </ul>
                  @if (calls().hidden; as hidden) {
                    <p class="hidden-calls m-0 mt-2 text-xs text-charcoal-brown-600">
                      Hid {{ hidden }} call{{ hidden === 1 ? '' : 's' }} to providers outside
                      {{ scopeComponent() }}.
                    </p>
                  }
                </aside>
              </div>
            }
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class UiBuilderPage {
  private readonly selected = inject(SelectedProject);
  private readonly repositories = inject(RepositoriesStore);
  private readonly store = inject(RoutesBundleStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The repository the URL names. */
  protected readonly repo = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('repo') ?? '')),
    { initialValue: '' },
  );

  /** The URL's `route` and `state`: what is selected, as asked (see `selectedPath`, `freeze`). */
  private readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({ route: params.get('route'), state: params.get('state') })),
    ),
    { initialValue: { route: null, state: null } },
  );

  protected readonly bundle = computed(() => this.store.bundles()[this.repo()]);

  protected readonly state = computed((): LoadState => {
    const status = this.bundle()?.status;
    return status === 'error'
      ? 'error'
      : status === 'loaded' || status === 'none'
        ? 'loaded'
        : 'loading';
  });

  private readonly loaded = computed(() => {
    const bundle = this.bundle();
    return bundle?.status === 'loaded' ? bundle : null;
  });

  protected readonly rows = computed(() => {
    const bundle = this.loaded();
    return bundle ? routeTree(bundle.manifest) : [];
  });

  /** The URL's `route` when it is a route of the tree, else the first route with states. */
  protected readonly selectedPath = computed(() => {
    const picked = this.query().route;
    const rows = this.rows();
    return rows.some((row) => row.kind === 'route' && row.fullPath === picked)
      ? picked
      : initialRoute(rows);
  });

  protected readonly freezes = computed(() => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null ? routeFreezes(bundle.manifest, path) : [];
  });

  /** The index of the URL's `state` among the route's freezes; 0 (the first) when it has none. */
  protected readonly stateIndex = computed(() =>
    Math.max(
      0,
      this.freezes().findIndex((freeze) => freeze.name === this.query().state),
    ),
  );

  protected readonly freeze = computed(() => this.freezes()[this.stateIndex()] ?? null);

  /** Why the last link clicked in the frame selected nothing; null after any selection. */
  protected readonly linkNotice = signal<string | null>(null);

  protected readonly freezeFailed = computed(() => {
    const bundle = this.loaded();
    const freeze = this.freeze();
    return !!bundle && !!freeze && this.store.freezeRead(bundle, freeze.file)?.status === 'error';
  });

  /**
   * The frozen page, trusted so the whole document reaches `srcdoc`.
   *
   * Safe because of the sandbox on the element and not because of anything about the markup: it is
   * `sandbox="allow-same-origin"` and never `allow-scripts`, so nothing in it can run. A freeze
   * carries no script (the freezer drops `<script>`, `on*` and `javascript:` URLs), but the sandbox
   * is what holds whatever a bundle ever carries. Angular would sanitize `[srcdoc]` as HTML; the
   * bypass is what lets a whole document through.
   */
  protected readonly preview = computed((): SafeHtml | null => {
    const bundle = this.loaded();
    const freeze = this.freeze();
    const html = bundle && freeze ? this.store.preview(bundle, freeze.file) : null;
    return html === null ? null : this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /** The repository's entry in the open project's list, once it is loaded. */
  private readonly entry = computed(() => {
    const id = this.selected.project()?.id;
    const entries = id ? (this.repositories.byProject()[id]?.entries ?? []) : [];
    return entries.find((entry) => entry.repository?.name === this.repo());
  });

  private readonly componentOf = computed(() => {
    const id = this.selected.project()?.id;
    const entries = id ? (this.repositories.byProject()[id]?.entries ?? []) : [];
    return new Map(entries.map((e) => [e.repository?.name ?? '', e.repository?.component ?? null]));
  });

  protected readonly scope = computed((): Scope | null => {
    const slug = this.selected.slug();
    if (slug && this.repo() === `${slug}-landing-app`) return { all: true };
    const component = this.entry()?.repository?.component;
    return component ? { all: false, component } : null;
  });

  protected readonly scopeComponent = computed(() => {
    const scope = this.scope();
    return scope && !scope.all ? scope.component : '';
  });

  protected readonly scopeLabel = computed(() => {
    const scope = this.scope();
    if (!scope) return null;
    return scope.all ? 'Scope: all services' : `Scope: ${scope.component}`;
  });

  /** The selected route's calls in scope, and how many the scope hid. */
  protected readonly calls = computed(() => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    const all: readonly FreezeRecord[] =
      bundle && path !== null ? routeCalls(bundle.manifest, path) : [];
    const scope = this.scope();
    if (!scope || scope.all) return { shown: all, hidden: 0 };
    const components = this.componentOf();
    const shown = all.filter((call) => components.get(call.provider) === scope.component);
    return { shown, hidden: all.length - shown.length };
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const repo = this.repo();
      if (browser && repo) untracked(() => void this.store.load(repo));
    });
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.repositories.load(id));
    });
    effect(() => {
      const bundle = this.loaded();
      const freeze = this.freeze();
      if (browser && bundle && freeze) {
        untracked(() => this.store.freeze(bundle, freeze.file));
      }
    });
    const destroy = inject(DestroyRef);
    this.store.follow(() => this.repo() || undefined, destroy);
    this.repositories.follow(() => this.selected.project()?.id, destroy);
  }

  /** Selects the route at `fullPath` on its first state, as a new entry in the history. */
  protected select(fullPath: string): Promise<boolean> {
    this.linkNotice.set(null);
    return this.navigate({ route: fullPath, state: null });
  }

  /** Selects the route's state named `name`. */
  protected pickState(name: string): void {
    this.linkNotice.set(null);
    void this.navigate({ state: name });
  }

  private navigate(queryParams: { route?: string; state: string | null }): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Turns link clicks inside the frame into click-through between routes (qits-1949), once its
   * document is in. Every click on a link is cancelled, so the frame never navigates; its written
   * `href` (never `anchor.href`, resolved against this page) goes through `matchRoute`. A route of
   * the app is selected as a tree click would, and its row scrolled into view; a link outside the
   * app or to no route of it leaves the route as it is and says so under the tabs (`linkNotice`); a
   * fragment does nothing. The frame is same-origin (`allow-same-origin`), so this page can reach
   * its document; the listener is this page's, the frame runs nothing of its own.
   */
  protected holdLinks(event: Event): void {
    const frame = event.target as HTMLIFrameElement;
    frame.contentDocument?.addEventListener('click', (click) => {
      const link = (click.target as Element | null)?.closest?.('a[href], area[href]');
      if (!link) return;
      click.preventDefault();
      const href = link.getAttribute('href') ?? '';
      const bundle = this.loaded();
      const target = bundle ? matchRoute(bundle.manifest, href) : ({ kind: 'fragment' } as const);
      switch (target.kind) {
        case 'route':
          void this.select(target.fullPath).then(() => this.revealSelected());
          break;
        case 'outside':
          this.linkNotice.set(`Leads outside the app: ${href}`);
          break;
        case 'unmatched':
          this.linkNotice.set(`No route of this app matches ${target.path}`);
          break;
      }
    });
  }

  /** Scrolls the selected tree row into view once the selection is drawn. */
  private revealSelected(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector('nav button.route[aria-current="page"]')
          ?.scrollIntoView?.({ block: 'nearest' }),
      { injector: this.injector },
    );
  }
}
