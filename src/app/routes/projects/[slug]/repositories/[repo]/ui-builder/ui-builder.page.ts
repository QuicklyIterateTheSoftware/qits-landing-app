import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
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
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { joinEntities, type EntityUsage } from '$core/ui-builder/entity-map';
import { EntityMapStore, type ContractsSite } from '$core/ui-builder/entity-map.store';
import { CallDetails, type CallEntity } from '$patterns/ui-builder/call-details/call-details';
import { RoutesBundleStore } from '$core/ui-builder/routes-bundle.store';
import {
  FREEZE_VIEWPORTS,
  hasViewports,
  initialRoute,
  inOutcomeScope,
  matchRoute,
  outcomeLeads,
  outcomeProgress,
  routeCalls,
  routeOutcomeMarks,
  routeOutcomes,
  routeStates,
  routeTree,
  sharedOutcomes,
  stateFreeze,
  VIEWPORT_SIZES,
  type Freeze,
  type FreezeKind,
  type FreezeViewport,
  type FreezeRecord,
  type JoinedOutcome,
  type OutcomeMark,
  type OutcomeTest,
  type TreeRow,
} from '$core/ui-builder/routes-manifest';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** Which providers' calls the builder shows: every one, or those of one component. */
type Scope = { readonly all: true } | { readonly all: false; readonly component: string };

/** The left panel's tabs. */
type LeftTab = 'routes' | 'entities' | 'outcomes';

/**
 * What the bundle says of outcomes (qits-2006): nothing (frozen before outcomes were recorded), an
 * unreadable section, no declaration in the whole app, or declarations.
 */
type OutcomeStatus = 'unrecorded' | 'invalid' | 'undeclared' | 'declared';

/** The attribute the highlighted trigger carries in the frame (qits-2006). */
const HIGHLIGHT = 'data-qits-builder-highlight';

/** The frame's highlight style, injected as `<style data-qits-builder>` (cinnabar-500; qits-2006). */
const HIGHLIGHT_CSS = `[${HIGHLIGHT}] { outline: 3px solid oklch(57.66% 0.21 28.2) !important; outline-offset: 2px !important; }`;

/** `value` escaped for a double-quoted CSS attribute value (qits-2006). */
const quoted = (value: string) => value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ');

/** A state's kind on its tab (qits-2047): its words and its chip's tone. */
const KIND_LABELS: Readonly<
  Record<FreezeKind, { readonly label: string; readonly tone: ChipTone }>
> = {
  DATA: { label: 'data', tone: 'ok' },
  NO_DATA: { label: 'no data', tone: 'neutral' },
  PENDING: { label: 'pending', tone: 'waiting' },
  ERROR: { label: 'error', tone: 'failed' },
};

/** The viewport switch's buttons (qits-2047), narrowest first; the URL's `viewport` is the id. */
const VIEWPORT_CHOICES: readonly {
  readonly id: FreezeViewport;
  readonly query: string;
  readonly label: string;
}[] = FREEZE_VIEWPORTS.map((id) => ({
  id,
  query: id.toLowerCase(),
  label: `${id.charAt(0)}${id.slice(1).toLowerCase()}`,
}));

/** The width the frame's border adds to its box (1px each side), kept out of the frozen width. */
const FRAME_BORDER = 2;

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
 *   first route with states; choosing another route goes back to its first state. A route that
 *   declares page outcomes carries a mark before its count (qits-2045, `routeOutcomeMarks`): how
 *   many, toned as the gap chips when some are gaps, its label saying how many of each.
 * - States (middle): the route's states (`routeStates`: its freezes grouped by name, qits-2047), as
 *   tabs that wrap, DATA first, then NO_DATA, PENDING, ERROR and the states without a kind, by name
 *   within each; a state's kind is a chip on its tab. The selected one is read on demand and drawn
 *   in `<iframe sandbox="allow-same-origin" [srcdoc]>`, never with `allow-scripts` (see `preview`).
 *   A link clicked inside it selects the route it leads to (qits-1949, see `holdLinks`); the frame
 *   itself never navigates.
 * - Viewports (qits-2047): when any freeze of the bundle was shot at a preset width (qits-2046), a
 *   Phone / Tablet / Desktop switch above the frame picks which of the state's freezes is drawn
 *   (`stateFreeze`: that width's, else the one at the test's own viewport, else DESKTOP's, else the
 *   first). A freeze with a width is drawn in a frame of that window's size, scaled down with a CSS
 *   transform to the column's width when it is wider (`frameScale`, measured by a
 *   `ResizeObserver`), its box as tall as the scaled frame. The highlight and the link clicks live in
 *   the frame's own document, so the scale moves them with it. A freeze without one keeps the
 *   full-width, 32rem frame.
 * - Selection: the URL's query, `route` (the route's full path), `state` (the state's name) and
 *   `viewport` (`phone`, `tablet`, `desktop`), so Back walks back through tree, tab, switch and link
 *   clicks. A `route` that is not a route of the tree opens the first route with states; a `state`
 *   the route lacks its first DATA state, or its first state without one. Choosing a route clears
 *   `state` and keeps `viewport`, which is DESKTOP when absent or unknown.
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
 * - Entity pages (qits-1994): each entity of the Entities tab and of the route's entities has a small
 *   "↗" link to its entity page beside the action that picks it, and the selected entity's name
 *   heads its routes as that link; the calls' popovers link the same pages and the provider
 *   state's page. Each is a declared exit (`open-builder-entity`: `listedEntity`, `pickedEntity`,
 *   `routeEntity`; epic qits-2000).
 * - Outcomes (qits-2006): below the calls and above the entities, the route's page outcomes
 *   (`routeOutcomes` of the manifest's `outcomes`, which `@qits/angular` writes from 2026.1109.225625
 *   on), each with its kind, the tests that reach it, and a gap chip when no test reaches it or no
 *   screenshot shows its trigger. An exit's target is a button that selects that route as a frame
 *   link does, its folded ancestors unfolded; a target no route matches is named. A stay's "Show
 *   result" opens the freeze shot after it fired. A return and an external (qits-2044) have no
 *   target: their line says where they lead (`outcomeLeads`). A `triggered: false` outcome (a guard,
 *   a callback's result) has no "no screenshot shows its trigger" gap. An outcome `@qits/angular`
 *   declares (its `file` under `@qits/angular/`) says so, its file in the tooltip, and links no
 *   source. A bundle without the section, with an unreadable one, or an app that declares none says
 *   so in one line instead of the list; a route that declares none says how many of the tree's pages
 *   do (qits-2045, `outcomeProgress`).
 * - The Outcomes tab (qits-2006, owner decision 3 of qits-2000): the shared outcomes, a layout's and
 *   app-wide (`sharedOutcomes`), listed once, by scope, with the same rows. The right panel never
 *   repeats them; it ends with a line counting those in the route's scope, which opens the tab.
 * - Highlight (qits-2006): clicking an outcome (not its target or result) highlights its trigger in
 *   the frame, the element whose `data-qits-outcome` names it, and clicking it again clears it, as
 *   does choosing another route. The shown state is switched to the first freeze that shows the
 *   trigger when it does not. The highlight is drawn from this page into the same-origin frame, a
 *   `<style data-qits-builder>` in its head and an attribute on the element (see `drawHighlight`),
 *   again after each load; nothing runs inside the frame. A freeze that lists the trigger without
 *   the element is said so under the tabs.
 *
 * - Columns (qits-2050): from 1280px up the three panels sit side by side and each scrolls on its
 *   own, so a long tree, a tall frozen page or a long list of calls never moves the other two. The
 *   panels are as tall as the shell's scrolling `<main>` (the window below the top bar,
 *   `--app-header-h`, less the page's pinned actions, `--page-actions-h`, 0 while it has none), and
 *   the page keeps no bottom padding there: scrolled to its end, `<main>` shows the title row gone
 *   and the panels filling it exactly. A wheel at a panel's end carries on to `<main>`, which is how
 *   the title row scrolls away. Below 1280px the panels stack and the page scrolls as one, as
 *   before. A tree row scrolled into view (`revealSelected`) scrolls the tree's panel.
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
  imports: [Chip, PageLayoutComponent, Spinner, CallDetails, QitsExit, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[96rem] px-6 pt-8 pb-12 xl:pb-0">
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
              <div
                data-columns
                class="grid grid-cols-1 gap-6 xl:h-[calc(100dvh-var(--app-header-h,0px)-var(--page-actions-h,0px))] xl:grid-cols-[17rem_minmax(0,1fr)_20rem] xl:grid-rows-[minmax(0,1fr)]"
              >
                <div class="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pb-6">
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
                      @for (row of shownRows(); track row.fullPath) {
                        <div
                          class="route-row group flex w-full items-center rounded"
                          [class]="
                            row.kind === 'route' && row.fullPath === selectedPath()
                              ? 'bg-charcoal-brown-800 text-white'
                              : row.kind === 'route'
                                ? 'hover:bg-charcoal-brown-50'
                                : 'text-charcoal-brown-500'
                          "
                        >
                          <button
                            type="button"
                            class="route flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left font-mono"
                            [style.padding-left.rem]="0.5 + row.depth * 0.875"
                            [class]="row.kind === 'route' ? 'cursor-pointer' : 'cursor-default'"
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
                          </button>
                          @if (
                            row.kind === 'route' ? outcomeMarks().get(row.fullPath) : null;
                            as mark
                          ) {
                            @if (mark.outcomes > 0) {
                              <span
                                class="outcome-mark mr-1 shrink-0 rounded px-1 text-[0.6875rem] leading-4 tabular-nums"
                                [class.gap]="mark.gaps > 0"
                                [class]="
                                  mark.gaps > 0
                                    ? 'bg-sunflower-gold-100 text-sunflower-gold-800'
                                    : 'opacity-70'
                                "
                                role="img"
                                [attr.aria-label]="markLabel(mark)"
                                [title]="markLabel(mark)"
                                >◆{{ mark.outcomes }}</span
                              >
                            }
                          }
                          @if (row.parent) {
                            <!-- − on hover, + while folded: pseudo-content, so the row's text stays its count. -->
                            <button
                              type="button"
                              class="fold relative min-w-6 shrink-0 cursor-pointer self-stretch pr-2 pl-1 text-right text-[0.6875rem] tabular-nums after:absolute after:inset-y-0 after:right-2 after:flex after:items-center after:font-semibold pointer-fine:group-hover:aria-expanded:after:content-['−'] pointer-fine:aria-[expanded=false]:after:content-['+']"
                              [attr.aria-expanded]="!row.collapsed"
                              [attr.aria-label]="
                                (row.collapsed ? 'Expand /' : 'Collapse /') + row.fullPath
                              "
                              (click)="toggleFold(row.fullPath)"
                            >
                              <span
                                class="opacity-70 pointer-fine:group-hover:invisible pointer-fine:[[aria-expanded=false]>&]:invisible"
                                >{{ row.kind === 'route' ? row.states : '' }}</span
                              >
                            </button>
                          } @else if (row.kind === 'route') {
                            <span class="shrink-0 pr-2 text-[0.6875rem] tabular-nums opacity-70">{{
                              row.states
                            }}</span>
                          }
                        </div>
                      }
                    </nav>
                  } @else if (leftTab() === 'entities') {
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
                                  <div class="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      class="entity flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded py-0.5 pr-2 pl-2 text-left"
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
                                    @if (slug(); as project) {
                                      <a
                                        class="entity-link shrink-0 px-1 text-xs text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
                                        [qitsExit]="entityPages.listedEntity"
                                        [exitParams]="{
                                          slug: project,
                                          repo: entity.repository,
                                          entity: entity.entity,
                                        }"
                                        [attr.aria-label]="'Open ' + entity.name + ' entity page'"
                                        [title]="'Open ' + entity.name + ' entity page'"
                                        >↗</a
                                      >
                                    }
                                  </div>
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
                  } @else {
                    <section aria-label="Shared outcomes" class="text-[0.8125rem]">
                      @if (outcomeStatus() === 'declared') {
                        @for (group of sharedGroups(); track group.route) {
                          <h3
                            class="outcome-group m-0 mb-1 text-xs font-semibold text-charcoal-brown-700"
                            [class.mt-3]="!$first"
                          >
                            {{
                              group.route === null ? 'App-wide' : '/' + group.route + ' and below'
                            }}
                          </h3>
                          <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                            @for (outcome of group.outcomes; track outcome.key) {
                              <ng-container
                                [ngTemplateOutlet]="outcomeRow"
                                [ngTemplateOutletContext]="{ $implicit: outcome }"
                              />
                            }
                          </ul>
                        } @empty {
                          <p class="no-outcomes m-0 text-charcoal-brown-600">
                            No layout or app-wide outcome.
                          </p>
                        }
                      } @else {
                        <ng-container [ngTemplateOutlet]="outcomesMissing" />
                      }
                    </section>
                  }
                </div>

                <section aria-label="Preview" class="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pb-6">
                  @if (selectedPath(); as path) {
                    <h2 class="m-0 mb-2 font-mono text-base">/{{ path }}</h2>
                    @if (states().length) {
                      <div role="tablist" aria-label="States" class="mb-2 flex flex-wrap gap-1">
                        @for (item of states(); track item.name; let i = $index) {
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
                            (click)="pickState(item.name)"
                          >
                            {{ item.name }}
                            @if (item.kind; as kind) {
                              <ui-chip
                                class="kind ml-1"
                                [label]="kindLabels[kind].label"
                                [tone]="kindLabels[kind].tone"
                              />
                            }
                          </button>
                        }
                      </div>
                      @if (viewports()) {
                        <div
                          role="group"
                          aria-label="Viewport"
                          class="viewports mb-2 flex flex-wrap gap-1"
                        >
                          @for (choice of viewportChoices; track choice.id) {
                            <button
                              type="button"
                              class="viewport cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                              [class]="
                                choice.id === viewport()
                                  ? 'bg-charcoal-brown-800 text-white'
                                  : 'bg-charcoal-brown-100 text-charcoal-brown-700 hover:bg-charcoal-brown-200'
                              "
                              [attr.aria-pressed]="choice.id === viewport()"
                              (click)="pickViewport(choice.query)"
                            >
                              {{ choice.label }}
                            </button>
                          }
                        </div>
                      }
                      @if (linkNotice(); as notice) {
                        <p class="link-notice m-0 mb-2 truncate text-xs text-charcoal-brown-600">
                          {{ notice }}
                        </p>
                      }
                      <div #frameBox class="frame-box">
                        @if (preview(); as html) {
                          @if (frameSize(); as size) {
                            <!-- The window the freeze was shot in, scaled to the column (qits-2047). -->
                            <div
                              class="frame-scaler overflow-hidden"
                              [style.height.px]="(size.height + frameBorder) * frameScale()"
                            >
                              <!--
                                sandbox without allow-scripts, always: the frozen page is drawn on
                                this page's own origin. allow-same-origin alone lets this page cancel
                                the frame's link clicks; nothing in the frame can run.
                              -->
                              <iframe
                                class="block origin-top-left box-content rounded-md border border-charcoal-brown-200 bg-white"
                                sandbox="allow-same-origin"
                                [style.width.px]="size.width"
                                [style.height.px]="size.height"
                                [style.transform]="
                                  frameScale() < 1 ? 'scale(' + frameScale() + ')' : null
                                "
                                [srcdoc]="html"
                                [title]="'Frozen state ' + (freeze()?.name ?? '')"
                                (load)="frameLoaded($event)"
                              ></iframe>
                            </div>
                          } @else {
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
                              (load)="frameLoaded($event)"
                            ></iframe>
                          }
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
                      </div>
                    } @else {
                      <p class="no-states m-0 text-sm text-charcoal-brown-600">
                        No screenshot test for this route, so nothing is frozen.
                      </p>
                    }
                  }
                </section>

                @if (selectedEntity(); as entity) {
                  <aside
                    aria-label="Entity routes"
                    class="text-[0.8125rem] xl:min-h-0 xl:overflow-y-auto xl:pb-6"
                  >
                    <h3 class="m-0 text-xs font-semibold text-charcoal-brown-700 uppercase">
                      Routes showing
                    </h3>
                    <p class="entity-heading m-0 mb-1">
                      @if (slug(); as project) {
                        <a
                          class="entity-page font-mono"
                          [qitsExit]="entityPages.pickedEntity"
                          [exitParams]="{
                            slug: project,
                            repo: entity.repository,
                            entity: entity.entity,
                          }"
                          [title]="'Open ' + entity.name + ' entity page'"
                          >{{ entity.name }}</a
                        >
                      } @else {
                        <span class="font-mono">{{ entity.name }}</span>
                      }
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
                  <aside
                    aria-label="Calls"
                    class="text-[0.8125rem] xl:min-h-0 xl:overflow-y-auto xl:pb-6"
                  >
                    <h3 class="m-0 mb-1 text-xs font-semibold text-charcoal-brown-700 uppercase">
                      Calls and states
                    </h3>
                    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                      @for (call of calls().shown; track $index) {
                        <li class="call">
                          <app-call-details
                            [call]="call"
                            [site]="siteOf(call.provider)"
                            [entities]="callEntities(call)"
                            [project]="slug() ?? null"
                            (entityPicked)="pickEntity($event)"
                          />
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
                      Outcomes
                    </h3>
                    @if (outcomeStatus() === 'declared') {
                      <ul class="route-outcomes m-0 flex list-none flex-col gap-1.5 p-0">
                        @for (outcome of pageOutcomes(); track outcome.key) {
                          <ng-container
                            [ngTemplateOutlet]="outcomeRow"
                            [ngTemplateOutletContext]="{ $implicit: outcome }"
                          />
                        } @empty {
                          <li class="no-outcomes text-charcoal-brown-600">
                            Not declared yet: {{ outcomeProgress().declaring }} of
                            {{ outcomeProgress().pages }} pages
                            {{ outcomeProgress().declaring === 1 ? 'declares' : 'declare' }}
                            outcomes.
                          </li>
                        }
                      </ul>
                      @if (sharedInScope(); as shared) {
                        <button
                          type="button"
                          class="shared-outcomes mt-2 cursor-pointer rounded px-1 text-left text-xs text-charcoal-brown-600 hover:bg-charcoal-brown-50 hover:text-charcoal-brown-900"
                          (click)="leftTab.set('outcomes')"
                        >
                          {{ shared }} shared {{ shared === 1 ? 'outcome' : 'outcomes' }} from
                          layouts
                        </button>
                      }
                    } @else {
                      <ng-container [ngTemplateOutlet]="outcomesMissing" />
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
                            @if (slug(); as project) {
                              <a
                                class="entity-link text-xs text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
                                [qitsExit]="entityPages.routeEntity"
                                [exitParams]="{
                                  slug: project,
                                  repo: entity.repository,
                                  entity: entity.entity,
                                }"
                                [attr.aria-label]="'Open ' + entity.name + ' entity page'"
                                [title]="'Open ' + entity.name + ' entity page'"
                                >↗</a
                              >
                            }
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

    <!-- Why no outcome is listed, in place of a list (qits-2006). -->
    <ng-template #outcomesMissing>
      @switch (outcomeStatus()) {
        @case ('unrecorded') {
          <p class="no-outcomes m-0 text-charcoal-brown-600">
            This bundle was frozen before outcomes were recorded.
          </p>
        }
        @case ('invalid') {
          <p class="no-outcomes outcomes-error m-0 text-cinnabar-700">
            Could not read this bundle's outcomes.
          </p>
        }
        @case ('undeclared') {
          <p class="no-outcomes m-0 text-charcoal-brown-600">
            {{ repo() }} declares no outcomes yet.
          </p>
        }
      }
    </ng-template>

    <!-- One outcome, in the right panel and in the Outcomes tab alike (qits-2006). -->
    <ng-template #outcomeRow let-outcome>
      <li class="outcome flex flex-col gap-0.5">
        <button
          type="button"
          class="outcome-pick flex w-full cursor-pointer flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left"
          [class]="
            outcome.key === highlighted()
              ? 'bg-charcoal-brown-800 text-white'
              : 'hover:bg-charcoal-brown-50'
          "
          [attr.aria-pressed]="outcome.key === highlighted()"
          [title]="'Highlight the trigger of ' + outcome.mark"
          (click)="toggleOutcome(outcome)"
        >
          <span class="font-mono text-xs">{{ outcome.declared.interaction }}</span>
          <span class="text-xs opacity-60">·</span>
          <span class="font-mono text-xs">{{ outcome.declared.outcome }}</span>
          <ui-chip class="kind ml-auto" [label]="outcome.declared.kind" />
        </button>
        @if (outcome.target; as target) {
          @if (target.kind === 'route') {
            <button
              type="button"
              class="outcome-target cursor-pointer self-start rounded px-1 text-left font-mono text-xs hover:bg-charcoal-brown-50"
              (click)="openRoute(target.fullPath)"
            >
              → /{{ target.fullPath }}
            </button>
          } @else {
            <p class="outcome-unmatched m-0 px-1 text-xs text-charcoal-brown-600">
              No route of this app matches /{{ outcome.declared.to ?? '' }}
            </p>
          }
        } @else if (leads(outcome); as line) {
          <p class="outcome-leads m-0 px-1 text-xs text-charcoal-brown-600">{{ line }}</p>
        }
        @if (outcome.library) {
          <p
            class="outcome-library m-0 px-1 text-xs text-charcoal-brown-600"
            [title]="outcome.declared.file"
          >
            Declared by &#64;qits/angular
          </p>
        }
        @if (outcome.result; as result) {
          <button
            type="button"
            class="outcome-result cursor-pointer self-start rounded px-1 text-left text-xs text-charcoal-brown-700 underline hover:bg-charcoal-brown-50"
            [title]="'Open the state ' + result.name"
            (click)="showResult(result)"
          >
            Show result
          </button>
        }
        @for (test of outcome.reachedBy; track $index) {
          <p
            class="reached-by m-0 truncate px-1 text-xs text-charcoal-brown-600"
            [title]="testTitle(test)"
          >
            {{ test.test }}
          </p>
        }
        @if (!outcome.reachedBy.length || (outcome.triggered && !outcome.triggerFreezes.length)) {
          <div class="flex flex-wrap gap-1 px-1">
            @if (!outcome.reachedBy.length) {
              <ui-chip class="gap no-test" tone="waiting" label="No test reaches this" />
            }
            @if (outcome.triggered && !outcome.triggerFreezes.length) {
              <ui-chip
                class="gap no-trigger"
                tone="waiting"
                label="No screenshot shows its trigger"
              />
            }
          </div>
        }
      </li>
    </ng-template>
  `,
})
export class UiBuilderPage {
  private readonly selected = inject(SelectedProject);
  private readonly repositories = inject(RepositoriesStore);
  private readonly store = inject(RoutesBundleStore);
  private readonly entityMaps = inject(EntityMapStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The open project's slug, for the links to the entity and contracts pages (qits-1994). */
  protected readonly slug = this.selected.slug;
  protected readonly entityPages = outcomes('open-builder-entity', {
    listedEntity: exit('projects/:slug/repositories/:repo/entities/:entity'),
    pickedEntity: exit('projects/:slug/repositories/:repo/entities/:entity'),
    routeEntity: exit('projects/:slug/repositories/:repo/entities/:entity'),
  });

  /** The repository the URL names. */
  protected readonly repo = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('repo') ?? '')),
    { initialValue: '' },
  );

  /**
   * The URL's `route`, `state` and `viewport`: what is selected, as asked (see `selectedPath`,
   * `stateIndex`, `viewport`).
   */
  private readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        route: params.get('route'),
        state: params.get('state'),
        viewport: params.get('viewport'),
      })),
    ),
    { initialValue: { route: null, state: null, viewport: null } },
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

  /** The full paths whose children are folded away in the route tree (qits-1999). */
  private readonly folded = signal<ReadonlySet<string>>(new Set());

  protected toggleFold(fullPath: string): void {
    this.folded.update((set) => {
      const next = new Set(set);
      if (!next.delete(fullPath)) next.add(fullPath);
      return next;
    });
  }

  /**
   * The route tree without the rows under a folded one (qits-1999). A row is a
   * parent when the next row is deeper; the tree is depth first, so its children follow it.
   */
  protected readonly shownRows = computed(() => {
    const rows = this.rows();
    const folded = this.folded();
    const shown: (TreeRow & { parent: boolean; collapsed: boolean })[] = [];
    let hideDeeperThan: number | null = null;
    rows.forEach((row, i) => {
      if (hideDeeperThan !== null && row.depth > hideDeeperThan) return;
      hideDeeperThan = null;
      const parent = (rows[i + 1]?.depth ?? -1) > row.depth;
      const collapsed = parent && folded.has(row.fullPath);
      if (collapsed) hideDeeperThan = row.depth;
      shown.push({ ...row, parent, collapsed });
    });
    return shown;
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

  /** The selected route's states (`routeStates`, qits-2047): its freezes by name, DATA first. */
  protected readonly states = computed(() => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null ? routeStates(bundle.manifest, path) : [];
  });

  /**
   * The index of the URL's `state` among the route's states; when it names none, the first DATA
   * state's, else 0 (the first).
   */
  protected readonly stateIndex = computed(() => {
    const states = this.states();
    const named = states.findIndex((state) => state.name === this.query().state);
    if (named >= 0) return named;
    return Math.max(
      0,
      states.findIndex((state) => state.kind === 'DATA'),
    );
  });

  protected readonly kindLabels = KIND_LABELS;
  protected readonly viewportChoices = VIEWPORT_CHOICES;
  protected readonly frameBorder = FRAME_BORDER;

  /** Whether the viewport switch shows: some freeze of the bundle has a preset width (qits-2047). */
  protected readonly viewports = computed(() => {
    const bundle = this.loaded();
    return !!bundle && hasViewports(bundle.manifest);
  });

  /** The URL's `viewport` (qits-2047); DESKTOP when absent or unknown. */
  protected readonly viewport = computed(
    (): FreezeViewport =>
      VIEWPORT_CHOICES.find((choice) => choice.query === this.query().viewport)?.id ?? 'DESKTOP',
  );

  /** The freeze drawn: the selected state's at the chosen viewport (`stateFreeze`, qits-2047). */
  protected readonly freeze = computed((): Freeze | null => {
    const state = this.states()[this.stateIndex()];
    return state ? stateFreeze(state, this.viewport()) : null;
  });

  /** The window the drawn freeze was shot in (qits-2047); null for one at the test's own viewport. */
  protected readonly frameSize = computed(() => {
    const viewport = this.freeze()?.viewport;
    return viewport ? VIEWPORT_SIZES[viewport] : null;
  });

  /** The frame's box, measured for {@link frameScale} (qits-2047). */
  private readonly frameBox = viewChild<ElementRef<HTMLElement>>('frameBox');

  /** The frame box's width in px, kept current by a `ResizeObserver`; 0 until measured. */
  private readonly boxWidth = signal(0);

  /**
   * How far the sized frame is scaled down to fit the column (qits-2047): 1 when it fits or the box
   * is not measured (jsdom has no `ResizeObserver`), never more than 1.
   */
  protected readonly frameScale = computed(() => {
    const size = this.frameSize();
    const box = this.boxWidth();
    if (!size || box <= 0) return 1;
    return Math.min(1, box / (size.width + FRAME_BORDER));
  });

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

  protected readonly leftTabs: readonly { readonly id: LeftTab; readonly label: string }[] = [
    { id: 'routes', label: 'Routes' },
    { id: 'entities', label: 'Entities' },
    { id: 'outcomes', label: 'Outcomes' },
  ];

  protected readonly leftTab = signal<LeftTab>('routes');

  /** What the bundle says of outcomes (qits-2006), which decides the line shown instead of a list. */
  protected readonly outcomeStatus = computed((): OutcomeStatus => {
    const outcomes = this.loaded()?.manifest.outcomes;
    if (outcomes === undefined) return 'unrecorded';
    if (outcomes === 'invalid') return 'invalid';
    return outcomes.declared.length ? 'declared' : 'undeclared';
  });

  /** The selected route's page outcomes, joined (`routeOutcomes`, qits-2006). */
  protected readonly pageOutcomes = computed((): readonly JoinedOutcome[] => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null ? routeOutcomes(bundle.manifest, path) : [];
  });

  /** Each route's outcome mark in the tree (`routeOutcomeMarks`, qits-2045). */
  protected readonly outcomeMarks = computed(() => {
    const bundle = this.loaded();
    return bundle ? routeOutcomeMarks(bundle.manifest) : new Map<string, OutcomeMark>();
  });

  /** How many of the tree's pages declare outcomes (`outcomeProgress`, qits-2045). */
  protected readonly outcomeProgress = computed(() => {
    const bundle = this.loaded();
    return bundle ? outcomeProgress(bundle.manifest, this.rows()) : { declaring: 0, pages: 0 };
  });

  /** A mark's label: `5 outcomes`, with its gaps when it has any (`5 outcomes, 2 gaps`). */
  protected markLabel({ outcomes, gaps }: OutcomeMark): string {
    const label = `${outcomes} ${outcomes === 1 ? 'outcome' : 'outcomes'}`;
    return gaps ? `${label}, ${gaps} ${gaps === 1 ? 'gap' : 'gaps'}` : label;
  }

  /** The Outcomes tab's groups: the layouts' and app-wide outcomes (`sharedOutcomes`, qits-2006). */
  protected readonly sharedGroups = computed(() => {
    const bundle = this.loaded();
    return bundle ? sharedOutcomes(bundle.manifest, this.selectedPath()) : [];
  });

  /** How many shared outcomes the selected route is in the scope of (qits-2006). */
  protected readonly sharedInScope = computed(() => {
    const path = this.selectedPath();
    return this.sharedGroups()
      .flatMap((group) => group.outcomes)
      .filter((outcome) => inOutcomeScope(outcome.declared, path)).length;
  });

  /** The key of the highlighted outcome (qits-2006); null when none is. */
  protected readonly highlighted = signal<string | null>(null);

  /** The highlighted outcome, among the route's and the shared ones (qits-2006). */
  private readonly highlightedOutcome = computed(() => {
    const key = this.highlighted();
    if (key === null) return null;
    const all = [...this.pageOutcomes(), ...this.sharedGroups().flatMap((group) => group.outcomes)];
    return all.find((outcome) => outcome.key === key) ?? null;
  });

  /** The frame as its last load left it, where the highlight is drawn (qits-2006). */
  private frame: HTMLIFrameElement | null = null;

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

  /** Opens an entity a call touches in the Entities tab (qits-1999). */
  protected pickEntity(key: string): void {
    this.leftTab.set('entities');
    this.pickedEntity.set(key);
  }

  /** The provider's contracts site at its newest version, if it publishes one (qits-1999). */
  protected siteOf(provider: string): ContractsSite | null {
    const catalog = this.entityMaps.catalog();
    return catalog?.status === 'loaded'
      ? (catalog.sites.find((site) => site.repository === provider) ?? null)
      : null;
  }

  /** The domain entities one call touches, from the provider's entity map (qits-1999). */
  protected callEntities(call: FreezeRecord): readonly CallEntity[] {
    const site = this.siteOf(call.provider);
    const read = site ? this.entityMaps.mapRead(site) : null;
    if (read?.status !== 'loaded') return [];
    return read.map.entities
      .filter(
        (e) =>
          e.marking === 'domain' && e.operations.some((o) => o.operationId === call.operationId),
      )
      .map((e) => ({
        key: `${call.provider}#${e.entity}`,
        name: e.entity.split('.').at(-1) ?? e.entity,
        repository: call.provider,
        entity: e.entity,
      }));
  }

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
    effect((onCleanup) => {
      // Absent in jsdom (the plain specs); there the frame is drawn unscaled.
      const box = this.frameBox()?.nativeElement;
      if (!box || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.boxWidth.set(box.clientWidth));
      observer.observe(box);
      onCleanup(() => observer.disconnect());
    });
    const destroy = inject(DestroyRef);
    this.store.follow(() => this.repo() || undefined, destroy);
    this.entityMaps.follow(() => this.repo() || undefined, destroy);
    this.repositories.follow(() => this.selected.project()?.id, destroy);
  }

  /**
   * Selects the route at `fullPath` on its first state (its first DATA state when it has one), as a
   * new entry in the history; the viewport stays (qits-2047). It clears the highlighted outcome
   * (qits-2006).
   */
  protected select(fullPath: string): Promise<boolean> {
    this.linkNotice.set(null);
    this.highlighted.set(null);
    this.drawHighlight();
    return this.navigate({ route: fullPath, state: null });
  }

  /** Selects the route's state named `name`. */
  protected pickState(name: string): void {
    this.linkNotice.set(null);
    void this.navigate({ state: name });
  }

  /** Draws the selected state at the viewport `query` names (`phone`, `tablet`, `desktop`). */
  protected pickViewport(query: string): void {
    this.linkNotice.set(null);
    void this.navigate({ viewport: query });
  }

  private navigate(queryParams: {
    route?: string;
    state?: string | null;
    viewport?: string;
  }): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Opens `fullPath` in the Routes tab, from an entity's routes or an exit's target (qits-2006):
   * selected as a tree or frame click selects it (the URL's `route`), its folded ancestors unfolded
   * and its row scrolled into view.
   */
  protected openRoute(fullPath: string): void {
    this.leftTab.set('routes');
    this.unfold(fullPath);
    void this.select(fullPath).then(() => this.revealSelected());
  }

  /** Unfolds every folded row above `fullPath` in the route tree, so its row shows (qits-2006). */
  private unfold(fullPath: string): void {
    this.folded.update((set) => {
      const above = [...set].filter((path) => path === '' || fullPath.startsWith(`${path}/`));
      if (!above.length) return set;
      const next = new Set(set);
      for (const path of above) next.delete(path);
      return next;
    });
  }

  /**
   * Shows `freeze` (qits-2006): its state (by name) on the selected route, or its route on that
   * state, as a new entry in the history. The highlight stays: this is how it reaches the freeze
   * showing it. The viewport stays too, unless `atItsViewport` asks for the freeze's own width
   * (qits-2047): a trigger may show at one width only.
   */
  private showFreeze(freeze: Freeze, atItsViewport = false): void {
    this.linkNotice.set(null);
    const route = freeze.route ?? '';
    const viewport =
      atItsViewport && freeze.viewport && freeze.viewport !== this.viewport()
        ? { viewport: freeze.viewport.toLowerCase() }
        : {};
    if (route === this.selectedPath()) {
      void this.navigate({ state: freeze.name, ...viewport });
      return;
    }
    this.unfold(route);
    void this.navigate({ route, state: freeze.name, ...viewport }).then(() =>
      this.revealSelected(),
    );
  }

  /** Opens the state a stay's result was shot in, from its "Show result" (qits-2006). */
  protected showResult(freeze: Freeze): void {
    this.showFreeze(freeze);
  }

  /** Where a return or an external leads, as a line (`outcomeLeads`, qits-2044); else null. */
  protected leads(outcome: JoinedOutcome): string | null {
    return outcomeLeads(outcome.declared);
  }

  /** A reaching test's tooltip: its spec's file name and its full name (qits-2006). */
  protected testTitle(test: OutcomeTest): string {
    return `${test.spec.split('/').pop() ?? test.spec} › ${test.test}`;
  }

  /**
   * Highlights `outcome`'s trigger in the frame, or clears the highlight when it is the highlighted
   * one already (qits-2006). When the shown state is not one of the freezes that show its trigger,
   * the first of them is shown first (the one at the chosen viewport when there is one, else at its
   * own, qits-2047), and the frame's load draws the highlight; with none, nothing switches (the
   * row's gap chip says why).
   */
  protected toggleOutcome(outcome: JoinedOutcome): void {
    this.linkNotice.set(null);
    this.highlighted.set(this.highlighted() === outcome.key ? null : outcome.key);
    this.drawHighlight();
    if (this.highlighted() === null) return;
    const shown = this.freeze()?.file;
    const triggers = outcome.triggerFreezes;
    if (triggers.length && !triggers.some((freeze) => freeze.file === shown)) {
      const viewport = this.viewport();
      const here = triggers.find((freeze) => (freeze.viewport ?? viewport) === viewport);
      this.showFreeze(here ?? triggers[0], true);
    }
  }

  /**
   * Once the frame's document is in: holds its links (`holdLinks`), and draws the highlighted
   * outcome again (qits-2006), since every state switch loads a new `srcdoc`.
   */
  protected frameLoaded(event: Event): void {
    this.holdLinks(event);
    this.frame = event.target as HTMLIFrameElement;
    this.drawHighlight();
  }

  /**
   * Draws the highlighted outcome into the frame's document (qits-2006): every earlier mark
   * cleared, then one `<style data-qits-builder>` in its head, and the attribute `HIGHLIGHT` on the
   * first element whose `data-qits-outcome` holds the word `<interaction>:<outcome>`, scrolled to
   * the centre. The frame is same-origin (`allow-same-origin`), as for `holdLinks`; this page
   * writes into it, and nothing runs inside. A freeze that lists the trigger while its document has
   * no such element says so under the tabs (`linkNotice`).
   */
  private drawHighlight(): void {
    const doc = this.frame?.contentDocument;
    if (!doc) return;
    for (const marked of doc.querySelectorAll(`[${HIGHLIGHT}]`)) marked.removeAttribute(HIGHLIGHT);
    const outcome = this.highlightedOutcome();
    if (!outcome) return;
    if (!doc.querySelector('style[data-qits-builder]')) {
      const style = doc.createElement('style');
      style.setAttribute('data-qits-builder', '');
      style.textContent = HIGHLIGHT_CSS;
      (doc.head ?? doc.documentElement).append(style);
    }
    const element = doc.querySelector(`[data-qits-outcome~="${quoted(outcome.mark)}"]`);
    if (element) {
      element.setAttribute(HIGHLIGHT, '');
      element.scrollIntoView?.({ block: 'center' });
    } else if ((this.freeze()?.triggers ?? []).includes(outcome.mark)) {
      this.linkNotice.set(`This screenshot has no element for ${outcome.mark}.`);
    }
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
          this.unfold(target.fullPath);
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
