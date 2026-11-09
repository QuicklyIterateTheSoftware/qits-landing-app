import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { joinEntities, type EntityUsage } from '$core/ui-builder/entity-map';
import { EntityMapStore, type ContractsSite } from '$core/ui-builder/entity-map.store';
import { RoutesBundleStore } from '$core/ui-builder/routes-bundle.store';
import {
  initialRoute,
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

/** The left panel's tabs. */
type LeftTab = 'routes' | 'entities';

/** One application's entities in the Entities tab, or why it has none to show. */
interface EntityGroup {
  readonly key: string;
  /** The map's application; the repository when no map is read. */
  readonly application: string;
  /** `none`: no entity map published; `error`: the map (or the site) could not be read. */
  readonly status: 'loading' | 'error' | 'none' | 'loaded';
  /** Untouched first, each part by name. */
  readonly entities: readonly EntityUsage[];
}

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
 *   (see `preview`). A click on a link inside it is cancelled: the frame never navigates.
 * - Calls (right): `routeCalls`, the union of the freezes' calls, filtered to the scope.
 * - Scope (owner rule in qits-1951): `<project slug>-landing-app` covers every service; any other
 *   frontend only its own component, by the `component` its repository declares (the project's
 *   repositories, `RepositoriesStore`), and the calls panel says how many calls it hid. A frontend
 *   whose component is not known yet (the list is loading, or the project does not list it) hides
 *   nothing and shows no chip.
 *
 * - Entities (qits-1950): the services' entity maps (`EntityMapStore`: each `@contracts/` site
 *   whose newest version names a repository in scope, its `entities.json`), joined with the
 *   manifest's calls on (provider, operationId) by `joinEntities`. Below the calls, the route's
 *   domain entities with their verbs, and how many calls touch no mapped entity. The left panel's
 *   Entities tab lists the in-scope domain entities by application, untouched ones first and
 *   marked; selecting one lists its routes in the right panel, and a route there opens it in the
 *   Routes tab. Technical and projection entities are only counted. A provider without a map is
 *   named ("No entity map published"); a map that cannot be read marks its application alone.
 *   The maps are read once the bundle is in and the scope is known (for a frontend other than the
 *   landing app, once the project's repositories answered); an unknown scope covers every service,
 *   as the calls panel does.
 *
 * The data is read in the browser only (the server render holds no token).
 *
 * Staleness (qits-1270): `SCMRelease` of the repository → its bundle (`RoutesBundleStore.follow`):
 * only a release publishes a new version. A freeze is keyed by its version, so it never goes stale.
 * The same release, or one of a service a contracts site names, → the contracts sites
 * (`EntityMapStore.follow`); a map is keyed by its version, so it never goes stale either.
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
                <div class="min-w-0">
                  <div role="tablist" aria-label="Panels" class="mb-2 flex gap-1">
                    @for (tab of leftTabs; track tab.id) {
                      <button
                        type="button"
                        role="tab"
                        class="panel-tab cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                        [class]="
                          tab.id === leftTab()
                            ? 'bg-charcoal-brown-800 text-white'
                            : 'bg-charcoal-brown-100 text-charcoal-brown-700 hover:bg-charcoal-brown-200'
                        "
                        [attr.aria-selected]="tab.id === leftTab()"
                        (click)="leftTab.set(tab.id)"
                      >
                        {{ tab.label }}
                      </button>
                    }
                  </div>
                  @if (leftTab() === 'routes') {
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
                  } @else {
                    <section aria-label="Entities" class="text-[0.8125rem]">
                      @switch (entityState()) {
                        @case ('loading') {
                          <p class="m-0 text-charcoal-brown-600">Reading the entity maps…</p>
                        }
                        @case ('error') {
                          <p class="entities-error m-0 text-cinnabar-700">
                            Could not read the entity maps.
                          </p>
                        }
                        @default {
                          <p class="entity-summary m-0 font-semibold">
                            {{ entityCounts().untouched }} of {{ entityCounts().total }} domain
                            entities have no route
                          </p>
                          @if (entityCounts().leftOut; as leftOut) {
                            <p class="left-out m-0 mt-0.5 text-xs text-charcoal-brown-600">
                              {{ leftOut }} technical or projection
                              {{ leftOut === 1 ? 'entity' : 'entities' }} left out.
                            </p>
                          }
                          @for (group of entityGroups(); track group.key) {
                            <h3
                              class="group m-0 mt-3 mb-1 text-xs font-semibold text-charcoal-brown-700"
                            >
                              {{ group.application }}
                            </h3>
                            @switch (group.status) {
                              @case ('none') {
                                <p class="no-map m-0 text-xs text-charcoal-brown-600">
                                  No entity map published
                                </p>
                              }
                              @case ('error') {
                                <p class="map-error m-0 text-xs text-cinnabar-700">
                                  Could not read its entity map
                                </p>
                              }
                              @case ('loading') {
                                <p class="m-0 text-xs text-charcoal-brown-600">Reading…</p>
                              }
                              @default {
                                @for (entity of group.entities; track entity.key) {
                                  <button
                                    type="button"
                                    class="entity flex w-full cursor-pointer items-center gap-1.5 rounded py-0.5 pr-2 pl-2 text-left"
                                    [class]="
                                      entity.key === selectedEntity()?.key
                                        ? 'bg-charcoal-brown-800 text-white'
                                        : 'hover:bg-charcoal-brown-50'
                                    "
                                    [attr.aria-current]="
                                      entity.key === selectedEntity()?.key ? 'true' : null
                                    "
                                    (click)="pickedEntity.set(entity.key)"
                                  >
                                    <span class="min-w-0 truncate font-mono">{{
                                      entity.name
                                    }}</span>
                                    @if (entity.routes.length) {
                                      <span
                                        class="ml-auto text-[0.6875rem] tabular-nums opacity-70"
                                        >{{ entity.routes.length }}</span
                                      >
                                    } @else {
                                      <ui-chip
                                        class="untouched ml-auto"
                                        tone="waiting"
                                        label="No route shows this"
                                      />
                                    }
                                  </button>
                                } @empty {
                                  <p class="m-0 text-xs text-charcoal-brown-600">
                                    No domain entity.
                                  </p>
                                }
                              }
                            }
                          }
                        }
                      }
                    </section>
                  }
                </div>

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
                            (click)="stateIndex.set(i)"
                          >
                            {{ freeze.name }}
                          </button>
                        }
                      </div>
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

                @if (selectedEntity(); as entity) {
                  <aside aria-label="Entity routes" class="text-[0.8125rem]">
                    <h3 class="m-0 text-xs font-semibold text-charcoal-brown-700 uppercase">
                      Routes showing
                    </h3>
                    <p class="entity-heading m-0 mb-1">
                      <span class="font-mono">{{ entity.name }}</span>
                      <span class="text-xs text-charcoal-brown-500">
                        · {{ entity.application }}</span
                      >
                    </p>
                    <ul class="m-0 flex list-none flex-col gap-1 p-0">
                      @for (route of entity.routes; track route.route) {
                        <li class="entity-route flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            class="cursor-pointer rounded px-1 text-left font-mono text-xs hover:bg-charcoal-brown-50"
                            (click)="openRoute(route.route)"
                          >
                            /{{ route.route }}
                          </button>
                          @for (verb of route.verbs; track verb) {
                            <ui-chip class="verb" [label]="verb" />
                          }
                        </li>
                      } @empty {
                        <li class="text-charcoal-brown-600">No route shows this.</li>
                      }
                    </ul>
                  </aside>
                } @else {
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

                    <h3
                      class="m-0 mt-4 mb-1 text-xs font-semibold text-charcoal-brown-700 uppercase"
                    >
                      Entities
                    </h3>
                    @if (routeEntities(); as found) {
                      <ul class="m-0 flex list-none flex-col gap-1 p-0">
                        @for (entity of found.entities; track entity.key) {
                          <li class="route-entity flex flex-wrap items-center gap-1">
                            <span class="font-mono text-xs">{{ entity.name }}</span>
                            <span class="text-xs text-charcoal-brown-500">{{
                              entity.application
                            }}</span>
                            @for (verb of entity.verbs; track verb) {
                              <ui-chip class="verb" [label]="verb" />
                            }
                          </li>
                        } @empty {
                          <li class="no-entities text-charcoal-brown-600">
                            This route touches no mapped entity.
                          </li>
                        }
                      </ul>
                      @if (found.unmatched; as unmatched) {
                        <p class="unmatched m-0 mt-2 text-xs text-charcoal-brown-600">
                          {{ unmatched }} {{ unmatched === 1 ? 'call touches' : 'calls touch' }} no
                          mapped entity.
                        </p>
                      }
                    } @else if (entityState() === 'error') {
                      <p class="entities-error m-0 text-cinnabar-700">
                        Could not read the entity maps.
                      </p>
                    } @else {
                      <p class="m-0 text-charcoal-brown-600">Reading the entity maps…</p>
                    }
                  </aside>
                }
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
  private readonly entityMaps = inject(EntityMapStore);
  private readonly sanitizer = inject(DomSanitizer);

  /** The repository the URL names. */
  protected readonly repo = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('repo') ?? '')),
    { initialValue: '' },
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

  /** The route picked in the tree; null: the first route with states. */
  private readonly picked = signal<string | null>(null);

  protected readonly selectedPath = computed(() => {
    const picked = this.picked();
    const rows = this.rows();
    return rows.some((row) => row.kind === 'route' && row.fullPath === picked)
      ? picked
      : initialRoute(rows);
  });

  protected readonly stateIndex = signal(0);

  protected readonly freezes = computed(() => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null ? routeFreezes(bundle.manifest, path) : [];
  });

  protected readonly freeze = computed(
    () => this.freezes()[this.stateIndex()] ?? this.freezes()[0] ?? null,
  );

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

  protected readonly leftTabs: readonly { readonly id: LeftTab; readonly label: string }[] = [
    { id: 'routes', label: 'Routes' },
    { id: 'entities', label: 'Entities' },
  ];

  protected readonly leftTab = signal<LeftTab>('routes');

  /** Whether a provider (a repository name) is in scope; an unknown scope covers every one. */
  private readonly inScope = computed((): ((provider: string) => boolean) => {
    const scope = this.scope();
    if (!scope || scope.all) return () => true;
    const components = this.componentOf();
    return (provider) => components.get(provider) === scope.component;
  });

  /**
   * Whether the scope is decided: it is known, or the project's repositories answered without
   * naming the repository's component (then it covers every service, as the calls do).
   */
  private readonly scopeSettled = computed(() => {
    if (this.scope()) return true;
    const id = this.selected.project()?.id;
    const status = id ? this.repositories.byProject()[id]?.status : undefined;
    return status === 'loaded' || status === 'error';
  });

  /** The contracts sites whose repository is in scope, once the scope is decided. */
  private readonly sitesInScope = computed((): readonly ContractsSite[] => {
    const catalog = this.entityMaps.catalog();
    if (catalog?.status !== 'loaded' || !this.scopeSettled()) return [];
    const inScope = this.inScope();
    return catalog.sites.filter((site) => inScope(site.repository));
  });

  protected readonly entityState = computed((): LoadState => {
    const catalog = this.entityMaps.catalog();
    if (catalog?.status === 'error') return 'error';
    return catalog?.status === 'loaded' && this.scopeSettled() ? 'loaded' : 'loading';
  });

  /** Every in-scope map is read, or failed: what the join counts is final. */
  private readonly mapsSettled = computed(() =>
    this.sitesInScope().every((site) => {
      const status = this.entityMaps.mapRead(site)?.status;
      return status !== undefined && status !== 'loading';
    }),
  );

  /** The manifest joined with the in-scope maps read so far. */
  private readonly join = computed(() => {
    const bundle = this.loaded();
    if (!bundle || this.entityState() !== 'loaded') return null;
    const sources = this.sitesInScope().flatMap((site) => {
      const read = this.entityMaps.mapRead(site);
      return read?.status === 'loaded' ? [{ repository: site.repository, map: read.map }] : [];
    });
    return joinEntities(bundle.manifest, sources, this.inScope());
  });

  /** The selected route's entities and its calls that touch none, once every map is settled. */
  protected readonly routeEntities = computed(() => {
    const join = this.join();
    const path = this.selectedPath();
    if (!join || !this.mapsSettled() || path === null) return null;
    return { entities: join.byRoute[path] ?? [], unmatched: join.unmatched[path] ?? 0 };
  });

  protected readonly entityCounts = computed(() => {
    const join = this.join();
    return {
      untouched: join?.untouched.length ?? 0,
      total: join?.entities.length ?? 0,
      leftOut: join?.leftOut ?? 0,
    };
  });

  /**
   * The Entities tab's groups, by application: each in-scope contracts site with its map's
   * entities (untouched first), a provider the routes call that publishes no map, and, when the
   * scope covers every service, a site whose versions could not be read.
   */
  protected readonly entityGroups = computed((): readonly EntityGroup[] => {
    const join = this.join();
    const bundle = this.loaded();
    const catalog = this.entityMaps.catalog();
    if (!join || !bundle || catalog?.status !== 'loaded') return [];
    const groups: EntityGroup[] = [];
    const sites = this.sitesInScope();
    for (const site of sites) {
      const read = this.entityMaps.mapRead(site);
      const entities = join.entities.filter((e) => e.repository === site.repository);
      groups.push({
        key: site.site,
        application: read?.status === 'loaded' ? read.map.application : site.repository,
        status: read?.status ?? 'loading',
        entities: [
          ...entities.filter((e) => !e.routes.length),
          ...entities.filter((e) => e.routes.length),
        ],
      });
    }
    const mapped = new Set(sites.map((site) => site.repository));
    const inScope = this.inScope();
    const called = new Set(
      bundle.manifest.freezes
        .filter((freeze) => freeze.route !== null)
        .flatMap((freeze) => freeze.records.map((record) => record.provider))
        .filter((provider) => inScope(provider) && !mapped.has(provider)),
    );
    for (const provider of called) {
      groups.push({ key: provider, application: provider, status: 'none', entities: [] });
    }
    const scope = this.scope();
    if (!scope || scope.all) {
      for (const site of catalog.unreadable) {
        groups.push({ key: site, application: site, status: 'error', entities: [] });
      }
    }
    return groups.sort((a, b) => a.application.localeCompare(b.application));
  });

  /** The entity picked in the Entities tab. */
  protected readonly pickedEntity = signal<string | null>(null);

  /** The picked entity, while the Entities tab is open and the entity is still in the join. */
  protected readonly selectedEntity = computed(() => {
    const key = this.pickedEntity();
    if (this.leftTab() !== 'entities' || key === null) return null;
    return this.join()?.entities.find((entity) => entity.key === key) ?? null;
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
    effect(() => {
      if (browser && this.loaded()) untracked(() => void this.entityMaps.load());
    });
    effect(() => {
      const sites = this.sitesInScope();
      if (browser) untracked(() => sites.forEach((site) => this.entityMaps.readMap(site)));
    });
    const destroy = inject(DestroyRef);
    this.store.follow(() => this.repo() || undefined, destroy);
    this.entityMaps.follow(() => this.repo() || undefined, destroy);
    this.repositories.follow(() => this.selected.project()?.id, destroy);
  }

  protected select(fullPath: string): void {
    this.picked.set(fullPath);
    this.stateIndex.set(0);
  }

  /** Opens `fullPath` in the Routes tab, from an entity's routes. */
  protected openRoute(fullPath: string): void {
    this.leftTab.set('routes');
    this.select(fullPath);
  }

  /**
   * Cancels every link click inside the frame once its document is in, so the frame never
   * navigates (qits-1949 turns these into click-through between routes). The frame is
   * same-origin (`allow-same-origin`), so this page can reach its document; the listener is this
   * page's, the frame runs nothing of its own.
   */
  protected holdLinks(event: Event): void {
    const frame = event.target as HTMLIFrameElement;
    frame.contentDocument?.addEventListener('click', (click) => {
      const target = click.target as Element | null;
      if (target?.closest?.('a[href], area[href]')) click.preventDefault();
    });
  }
}
