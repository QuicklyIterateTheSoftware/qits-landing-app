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
import { exit, outcomes, QitsExit, qitsResource, type QitsDomainEvent } from '@qits/angular';
import { map } from 'rxjs';
import { ThemePreferenceStore } from '$core/appearance/theme-preference';
import { SelectedProject } from '$core/projects/selected-project';
import { PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/repositories.store';
import { ContractsBundles } from '$core/contracts/contracts-bundles';
import { callCardinality, joinEntities, type EntityUsage } from '$core/ui-builder/entity-map';
import { ContractsCatalog, type ContractsSite } from '$core/ui-builder/contracts-catalog';
import type { GoldenIndex, GoldenOperation } from '$core/ui-builder/golden-masters';
import {
  itemIn,
  markOf,
  MARKED,
  parseItem,
  recordFor,
  sameMark,
  sourceOf,
  valueAt,
  type DataMark,
  type ElementMark,
  type MarkRead,
} from '$core/ui-builder/data-marks';
import { CallDetails, type CallEntity } from '$patterns/ui-builder/call-details/call-details';
import { RoutesBundles } from '$core/ui-builder/routes-bundles';
import {
  answeringRow,
  appWideCalls,
  callKey,
  colorSchemesOf,
  forwardExits,
  freezeCalls,
  freezeResults,
  FREEZE_VIEWPORTS,
  hasViewports,
  inboundExits,
  initialRoute,
  joinedOutcome,
  inOutcomeScope,
  matchRoute,
  outcomeLeads,
  outcomeProgress,
  routeOutcomeMarks,
  routeOutcomes,
  routeStates,
  routeTree,
  sharedOutcomes,
  stateFreeze,
  unfixedOutcomes,
  unreachable,
  VIEWPORT_SIZES,
  type Freeze,
  type FreezeColorScheme,
  type FreezeKind,
  type FreezeViewport,
  type FreezeRecord,
  type DeclaredOutcome,
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

/**
 * The data highlighted in the frame (qits-2144): every marked element of a call's read (`call`),
 * or the elements of exactly one mark (`mark`), picked in the frame (`picked`, the element's
 * resolved mark, which opens "Selected data") or chosen among a call's items.
 */
type DataSelection =
  | { readonly kind: 'call'; readonly source: string }
  | { readonly kind: 'mark'; readonly mark: DataMark; readonly picked: ElementMark | null };

/** A call's recorded answer, as read for "Selected data" (qits-2144). */
type GoldenRead =
  | { readonly status: 'loading' }
  | {
      readonly status: 'loaded';
      /** The recorded JSON body; null when there is none (no state, no file, not JSON). */
      readonly body: unknown;
    };

const LOADING_ANSWER: GoldenRead = { status: 'loading' };
const NO_ANSWER: GoldenRead = { status: 'loaded', body: null };

/** The operation `record` names in its state of a golden-masters index; null when it lists none. */
function recordedOperation(index: GoldenIndex, record: FreezeRecord): GoldenOperation | null {
  const state = index.states?.find((s) => s.name === record.state);
  return state?.operations.find((o) => o.operationId === record.operationId) ?? null;
}

/** A recorded value as "Selected data" shows it (qits-2144). */
interface ShownValue {
  readonly path: string;
  readonly text: string;
  /** False for a fallback ("not in the recorded answer", "Reading…"): drawn muted. */
  readonly found: boolean;
}

/** What "Selected data" shows of the mark picked in the frame (qits-2144). */
interface SelectedData {
  readonly mark: ElementMark;
  readonly read: MarkRead;
  /** The record the mark reads, when it is pinned to one (`marked` or `byItem`). */
  readonly record: FreezeRecord | null;
  readonly cardinality: string | null;
  readonly entities: readonly CallEntity[];
  readonly item: { readonly key: string; readonly value: string } | null;
  readonly field: ShownValue | null;
  readonly derived: readonly ShownValue[];
}

/** A call's marked items (qits-2144): the marks of one item of its read, in the freeze's order. */
interface ItemGroup {
  readonly item: string | null;
  readonly marks: readonly DataMark[];
}

/** What the calls panel and Pick data say of a screenshot without marks (qits-2144). */
const NO_MARKS =
  'This screenshot marks no data: every text is design copy as far as the builder knows.';

/** A call's words for its cardinality (qits-2144): a list or a detail read. */
const CARDINALITY_LABELS = { collection: 'list', single: 'detail' } as const;

/** A record's key among the calls listed or selected (qits-2144): provider, operation and state. */
const recordKey = ({ provider, operationId, state }: FreezeRecord) =>
  JSON.stringify([provider, operationId, state]);

/** The attribute the highlighted trigger carries in the frame (qits-2006). */
const HIGHLIGHT = 'data-qits-builder-highlight';

/**
 * The frame's highlight style, injected as `<style data-qits-builder>` (qits-2006): an outline in the
 * theme's `--color-accent` (qits-2086). The freeze's own value of the token wins, so the outline
 * follows the scheme the freeze was shot in; a freeze whose CSS does not define it (one frozen
 * before the theme) falls back to `accent`, this page's value of the token read at run time.
 */
const highlightCss = (accent: string) =>
  `[${HIGHLIGHT}] { outline: 3px solid var(--color-accent, ${accent || 'currentColor'}) !important; outline-offset: 2px !important; }`;

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

/** The scheme switch's buttons (qits-2086), as the library shoots them: LIGHT, then DARK. */
const SCHEME_CHOICES: readonly { readonly id: FreezeColorScheme; readonly label: string }[] = [
  { id: 'LIGHT', label: 'Light' },
  { id: 'DARK', label: 'Dark' },
];

/** The width the frame's border adds to its box (1px each side), kept out of the frozen width. */
const FRAME_BORDER = 2;

/** One source in the Outcomes tab (qits-2049): a declared outcome, joined, and where it is declared. */
interface OutcomeSource {
  /** The declaring route (`/x`), a layout (`/x and below`) or `App-wide`. */
  readonly scope: string;
  readonly outcome: JoinedOutcome;
}

/** A state of the selected route showing an outcome's trigger (qits-2080), as a link selects it. */
interface StateLink {
  /** The state's name, the URL's `state`. */
  readonly state: string;
  /** The URL's `viewport` (`phone`, …) of a freeze at a preset width; null keeps the chosen one. */
  readonly viewport: string | null;
  /** The viewport the state is drawn at once selected. */
  readonly at: FreezeViewport;
  /** Its name, and its width's label when it has one (`loaded · Phone`). */
  readonly label: string;
}

/** An outcome of the selected route the selected freeze does not show (qits-2080). */
interface UnseenOutcome {
  readonly outcome: JoinedOutcome;
  /** A state showing its trigger; null for an untriggered one, or when none of the route's does. */
  readonly shownIn: StateLink | null;
}

/** One route of the Outcomes tab (qits-2049): the exits that lead to it, as sources. */
interface InboundRow {
  readonly fullPath: string;
  readonly entry: boolean;
  readonly unreachable: boolean;
  readonly sources: readonly OutcomeSource[];
}

/** The segments of a route pattern (`''` and null have none), for nearness (qits-2049). */
const segmentsOf = (route: string | null): readonly string[] => (route ? route.split('/') : []);

/** How many leading segments two route patterns share (qits-2049). */
function shared(a: string | null, b: string | null): number {
  const [left, right] = [segmentsOf(a), segmentsOf(b)];
  let n = 0;
  while (n < left.length && n < right.length && left[n] === right[n]) n++;
  return n;
}

/**
 * Scrolls `doc`, a frame's document, so `element` sits mid-height in the frame (qits-2072); only
 * that document scrolls, never the page around the frame. Without a scrolling element nothing
 * moves.
 */
function centre(doc: Document, element: Element): void {
  const scroller = doc.scrollingElement;
  if (!scroller) return;
  const height = doc.defaultView?.innerHeight || doc.documentElement.clientHeight || 0;
  const box = element.getBoundingClientRect();
  const top = box.top + scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top - (height - box.height) / 2);
}

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
 * state's frozen page, and the calls that screenshot answered, each with its provider and provider
 * state. Everything comes from the frontend's published `@routes/` bundle (`RoutesBundles`,
 * qits-1947 and qits-1948); the page is a viewer and changes nothing.
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
 * - Colour schemes (qits-2086): when the bundle was frozen in schemes (`colorSchemesOf`: the
 *   manifest's `colorSchemes`, or a freeze's `colorScheme`), a Light / Dark switch beside the
 *   viewport switch picks the scheme the state is drawn in (`stateFreeze`: the freeze of that
 *   scheme at the width, else the width's first). Until one is picked it is the app's own
 *   (`ThemePreferenceStore.resolved`); a pick is kept for the visit, not in the URL. The frame
 *   paints no background of its own: a freeze paints its scheme's.
 * - Selection: the URL's query, `route` (the route's full path), `state` (the state's name) and
 *   `viewport` (`phone`, `tablet`, `desktop`), so Back walks back through tree, tab, switch and link
 *   clicks. A `route` that is not a route of the tree opens the first route with states; a `state`
 *   the route lacks its first DATA state, or its first state without one. Choosing a route clears
 *   `state` and keeps `viewport`, which is DESKTOP when absent or unknown.
 * - Forwards (qits-2076): a route that renders nothing (`rendersNothing`) has no row; its address
 *   folds into its parent's row (`routeTree`), which a `route` naming it selects (`answeringRow`),
 *   whose main panel says "Also answers /…", and whose states include the folded addresses'
 *   freezes. A route that only forwards (`forward`) is marked "↪" (labelled "Forwards") in the
 *   tree; its main panel lists "Forwards to:" above the states, each exit declared on its
 *   full path (`forwardExits`) with its target as an outcome row has it, a button selecting that
 *   route; its PENDING state is chipped "while it forwards", and it names no missing screenshot
 *   test. A bundle without the fields shows as before.
 * - The selected freeze (qits-2080): the right panel's Calls and states and Outcomes are the
 *   screenshot's, the selected state at the selected viewport (`freeze`), not the route's; they
 *   follow the URL's `state` and `viewport`, so the state list, the switch, Back and Forward move
 *   them. Entities, the left tabs and the tree's outcome marks stay the route's.
 * - Calls (right, qits-2080): the selected freeze's `records` (`freezeCalls`), filtered to the
 *   scope; none when no freeze is selected. The app-wide ones (`appWideCalls`: a provider
 *   operation the freezes of more than half of the routes with freezes record) follow its own in
 *   an "N app-wide calls" group, collapsed by default (a toggle with `aria-expanded`).
 * - Scope (owner rule in qits-1951): `<project slug>-landing-app` covers every service; any other
 *   frontend only its own component, by the `component` its repository declares (the project's
 *   repositories, `PROJECT_REPOSITORIES`), and the calls panel says how many calls it hid. A frontend
 *   whose component is not known yet (the list is loading, or the project does not list it) hides
 *   nothing and shows no chip.
 *
 * - Entities (qits-1950): the services' entity maps (`ContractsCatalog`: each `@contracts/` site
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
 *   on) whose trigger the selected freeze shows (its `triggers`, qits-2080), each with its kind,
 *   the tests that reach it, and a gap chip when no test reaches it or no screenshot shows its
 *   trigger. An exit's target is a button that selects that route as a frame
 *   link does, its folded ancestors unfolded; a target no route matches is named. A stay's "Show
 *   result" opens the freeze shot after it fired. A return and an external (qits-2044) have no
 *   target: their line says where they lead (`outcomeLeads`). A `triggered: false` outcome (a guard,
 *   a callback's result) has no "no screenshot shows its trigger" gap. An outcome `@qits/angular`
 *   declares (its `file` under `@qits/angular/`) says so, its file in the tooltip, and links no
 *   source. A bundle without the section, with an unreadable one, or an app that declares none says
 *   so in one line instead of the list; a route that declares none says how many of the tree's pages
 *   do (qits-2045, `outcomeProgress`).
 * - Shared outcomes (qits-2049): under the route's own outcomes, a "Shared" group, collapsed by
 *   default (a toggle with `aria-expanded`), holds the layouts' and app-wide outcomes whose scope
 *   takes the route (`sharedOutcomes`, filtered by `inOutcomeScope`) and whose trigger the selected
 *   freeze shows (qits-2080), by layout, then app-wide, with the same rows.
 * - Per screenshot (qits-2080): above the outcomes, "This screenshot shows the result of
 *   `<mark>`" for each outcome a test fired before shooting the selected freeze (`freezeResults`).
 *   Below them, collapsed by default, "N more outcomes of this route are not visible here": the
 *   route's page and shared outcomes the selected freeze does not show, each with a "Shown in
 *   <state> · <width>" button selecting a state of the route that does, as the state list and the
 *   switch select one (the URL's `state` and `viewport`; one at the chosen width first), or its gap
 *   line when none does or it is untriggered. A freeze without `triggers` (an older bundle) shows
 *   the whole route's outcomes, saying so; a route without freezes shows them without the line.
 * - The Outcomes tab (qits-2049; before it, the shared list of qits-2006): how each route is
 *   reached, the inverse of the right panel. `inboundExits` lists the routes the library's
 *   reachability check looks at (no children, no redirect, not `**`); a route no declared exit
 *   leads to (`to` its full path exactly, from any scope) and that is no entry point (`data: {
 *   qitsEntry: true }`) comes first, chipped "No outcome leads here", as the Entities tab chips "No
 *   route shows this"; an entry point is chipped "Entry point"; the rest show their inbound count.
 *   When any route is unreachable, a summary sits above the list, "N of M routes can't be reached:
 *   no outcome leads to it/them" (qits-2073, singular pronoun only at N = 1; plural "routes" either
 *   way); no route unreachable renders no summary at all. Expanding a row lists its sources: where
 *   each is declared (the route, "/x and below" for a layout, "App-wide") and its
 *   `interaction:outcome`.
 *   Clicking one toggles its trigger's highlight as an outcome click does, showing the freeze that
 *   shows the trigger on the route nearest the row's (`pickSource`), else the declaring route, else
 *   keeping the route. A last group, "Leaves without a fixed target" (`unfixedOutcomes`), lists the
 *   returns and externals with their source and where they lead, clicked the same way.
 * - Highlight (qits-2006): clicking an outcome (not its target or result) highlights its trigger in
 *   the frame, the element whose `data-qits-outcome` names it, and clicking it again clears it, as
 *   do choosing another route and selecting a freeze that does not show it (qits-2080). The shown
 *   state is switched to the first freeze that shows the trigger when it does not (reachable only
 *   where the panel shows the whole route's outcomes, qits-2080). The highlight is drawn from this
 *   page into the same-origin frame, a `<style data-qits-builder>` in its head and an attribute on
 *   the element (see `drawHighlight`), again after each load of a freeze's document; nothing runs
 *   inside the frame. A freeze that lists the trigger without the element is said so on the line
 *   above the frame, which is always there, so no notice moves the frame (qits-2072).
 * - Data marks (qits-2144): the selected freeze's `dataMarks` (qits-2141, `data-marks.ts`) say which
 *   read, item and attribute each marked part of the screenshot shows; everything else is design
 *   copy. Each call row chips its cardinality, `list` or `detail`, from its operation's rows in the
 *   provider's entity map (format 2, `callCardinality`). A call the screenshot marks has a toggle
 *   (◎) outlining every marked element of its read in the frame, the first centred, and a ▸ listing
 *   its marked items, each with its fields and derived marks; one of those outlines exactly its
 *   elements. A **Pick data** switch beside the viewport switch turns a click in the frame into a
 *   pick: cancelled, never a link, it selects the nearest element carrying a mark (`markOf`, by
 *   qits-2141's rule), outlines it, and opens "Selected data" above the calls: the read
 *   (`recordFor`: the record its source names, told apart by the item when the source is recorded
 *   in several states) as the call row's popover, its cardinality, "joined" when a list of another
 *   read is around it, the item, the field's recorded value and a derived mark's inputs with theirs
 *   (`ContractsBundles.recordedAnswer`, `itemIn`, `valueAt`), and the read's entities. What it cannot
 *   pin says so: "ambiguous" (every candidate listed), "found by item, not marked", "no read
 *   marked", "not in the recorded answer". The read's call row is marked as selected, the app-wide
 *   group opening for it. The data highlight and the outcome highlight are one selection: either
 *   clears the other, and another freeze that does not mark it clears it. A screenshot without
 *   `dataMarks` says it marks no data, and Pick data is disabled.
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
 * Staleness (qits-1270): `SCMRelease` of the repository → its bundle (`RoutesBundles.follow`):
 * only a release publishes a new version. A freeze is keyed by its version, so it never goes stale.
 * The same release, or one of a service a contracts site names, → the contracts sites
 * (`ContractsCatalog.follow`); a map is keyed by its version, so it never goes stale either.
 * The scope's repositories follow the wrapper's main branch (their resource's `refreshOn`).
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
          <span class="repo font-mono text-fg-soft">{{ repo() }}</span>
          @if (scopeLabel(); as label) {
            <ui-chip class="scope self-center" [label]="label" />
          }
        </div>
        <ui-spinner [state]="state()" class="min-h-48">
          @switch (bundle()?.status) {
            @case ('none') {
              <p class="none m-0 text-sm text-fg-soft">
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
                            ? 'bg-surface-inverse text-fg-on-inverse'
                            : 'bg-surface-muted text-fg-soft hover:bg-surface-active'
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
                              ? 'bg-surface-inverse text-fg-on-inverse'
                              : row.kind === 'route'
                                ? 'hover:bg-surface-subtle'
                                : 'text-fg-muted'
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
                            @if (row.forward) {
                              <span
                                class="forward-mark shrink-0 text-[0.6875rem] opacity-70"
                                role="img"
                                aria-label="Forwards"
                                title="Forwards"
                                >↪</span
                              >
                            }
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
                                    ? 'bg-warning-soft text-warning-strong'
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
                          <p class="m-0 text-fg-soft">Reading the entity maps…</p>
                        }
                        @case ('error') {
                          <p class="entities-error m-0 text-danger">
                            Could not read the entity maps.
                          </p>
                        }
                        @default {
                          <p class="entity-summary m-0 font-semibold">
                            {{ entityCounts().untouched }} of {{ entityCounts().total }} domain
                            entities have no route
                          </p>
                          @if (entityCounts().leftOut; as leftOut) {
                            <p class="left-out m-0 mt-0.5 text-xs text-fg-soft">
                              {{ leftOut }} technical or projection
                              {{ leftOut === 1 ? 'entity' : 'entities' }} left out.
                            </p>
                          }
                          @for (group of entityGroups(); track group.key) {
                            <h3 class="group m-0 mt-3 mb-1 text-xs font-semibold text-fg-soft">
                              {{ group.application }}
                            </h3>
                            @switch (group.status) {
                              @case ('none') {
                                <p class="no-map m-0 text-xs text-fg-soft">
                                  No entity map published
                                </p>
                              }
                              @case ('error') {
                                <p class="map-error m-0 text-xs text-danger">
                                  Could not read its entity map
                                </p>
                              }
                              @case ('loading') {
                                <p class="m-0 text-xs text-fg-soft">Reading…</p>
                              }
                              @default {
                                @for (entity of group.entities; track entity.key) {
                                  <div class="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      class="entity flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded py-0.5 pr-2 pl-2 text-left"
                                      [class]="
                                        entity.key === selectedEntity()?.key
                                          ? 'bg-surface-inverse text-fg-on-inverse'
                                          : 'hover:bg-surface-subtle'
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
                                        class="entity-link shrink-0 px-1 text-xs text-fg-soft no-underline hover:text-fg"
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
                                  <p class="m-0 text-xs text-fg-soft">No domain entity.</p>
                                }
                              }
                            }
                          }
                        }
                      }
                    </section>
                  } @else {
                    <section aria-label="Inbound outcomes" class="text-[0.8125rem]">
                      @if (outcomeStatus() === 'declared') {
                        @if (inboundCounts().unreachable > 0) {
                          <p class="inbound-summary m-0 font-semibold">
                            {{ inboundCounts().unreachable }} of {{ inboundCounts().total }} routes
                            can't be reached: no outcome leads to
                            {{ inboundCounts().unreachable === 1 ? 'it' : 'them' }}.
                          </p>
                        }
                        <ul class="m-0 mt-2 flex list-none flex-col gap-0.5 p-0">
                          @for (route of inboundRoutes(); track route.fullPath) {
                            <li class="inbound-route">
                              <button
                                type="button"
                                class="inbound flex w-full cursor-pointer items-center gap-1.5 rounded py-0.5 pr-2 pl-2 text-left hover:bg-surface-subtle"
                                [class.unreachable]="route.unreachable"
                                [attr.aria-expanded]="expandedInbound().has(route.fullPath)"
                                (click)="toggleInbound(route.fullPath)"
                              >
                                <span class="min-w-0 truncate font-mono"
                                  >/{{ route.fullPath }}</span
                                >
                                <span class="ml-auto flex shrink-0 items-center gap-1">
                                  @if (route.entry) {
                                    <ui-chip class="entry" label="Entry point" />
                                  }
                                  @if (route.unreachable) {
                                    <ui-chip
                                      class="no-inbound"
                                      tone="waiting"
                                      label="No outcome leads here"
                                    />
                                  }
                                  @if (route.sources.length) {
                                    <span
                                      class="inbound-count text-[0.6875rem] tabular-nums opacity-70"
                                      >{{ route.sources.length }}</span
                                    >
                                  }
                                </span>
                              </button>
                              @if (expandedInbound().has(route.fullPath)) {
                                <ul class="m-0 mb-1 ml-4 flex list-none flex-col gap-0.5 p-0">
                                  @for (source of route.sources; track source.outcome.key) {
                                    <ng-container
                                      [ngTemplateOutlet]="outcomeSource"
                                      [ngTemplateOutletContext]="{
                                        $implicit: source,
                                        target: route.fullPath,
                                      }"
                                    />
                                  } @empty {
                                    <li class="no-sources px-2 text-xs text-fg-soft">
                                      {{
                                        route.entry
                                          ? 'Entered from outside the app.'
                                          : 'No outcome leads here.'
                                      }}
                                    </li>
                                  }
                                </ul>
                              }
                            </li>
                          }
                        </ul>
                        <h3 class="outcome-group m-0 mt-3 mb-1 text-xs font-semibold text-fg-soft">
                          Leaves without a fixed target
                        </h3>
                        <ul class="unfixed m-0 flex list-none flex-col gap-0.5 p-0">
                          @for (source of unfixed(); track source.outcome.key) {
                            <ng-container
                              [ngTemplateOutlet]="outcomeSource"
                              [ngTemplateOutletContext]="{ $implicit: source, target: null }"
                            />
                          } @empty {
                            <li class="text-xs text-fg-soft">No return or external outcome.</li>
                          }
                        </ul>
                      } @else {
                        <ng-container [ngTemplateOutlet]="outcomesMissing" />
                      }
                    </section>
                  }
                </div>

                <section aria-label="Preview" class="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pb-6">
                  @if (selectedPath(); as path) {
                    <h2 class="m-0 mb-2 font-mono text-base">/{{ path }}</h2>
                    @if (selectedRow()?.alsoAnswers; as also) {
                      <p class="also-answers m-0 mb-2 text-xs text-fg-soft">
                        Also answers
                        @for (address of also; track address; let last = $last) {
                          <span class="font-mono">/{{ address }}</span
                          >{{ last ? '' : ', ' }}
                        }
                      </p>
                    }
                    @if (forward()) {
                      <section aria-label="Forwards to" class="forwards mb-3 text-[0.8125rem]">
                        <h3 class="m-0 mb-1 text-xs font-semibold text-fg-soft">Forwards to:</h3>
                        <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
                          @for (exit of forwards(); track exit.key) {
                            <li class="forward flex flex-wrap items-center gap-1">
                              <span
                                class="forward-outcome font-mono text-xs"
                                [title]="exit.declared.interaction + ':' + exit.declared.outcome"
                                >{{ exit.declared.outcome }}</span
                              >
                              <ng-container
                                [ngTemplateOutlet]="exitTarget"
                                [ngTemplateOutletContext]="{ $implicit: exit }"
                              />
                            </li>
                          } @empty {
                            <li class="text-xs text-fg-soft">No exit declared.</li>
                          }
                        </ul>
                      </section>
                    }
                    @if (states().length) {
                      <div role="tablist" aria-label="States" class="mb-2 flex flex-wrap gap-1">
                        @for (item of states(); track item.name; let i = $index) {
                          <button
                            type="button"
                            role="tab"
                            class="state cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                            [class]="
                              i === stateIndex()
                                ? 'bg-surface-inverse text-fg-on-inverse'
                                : 'bg-surface-muted text-fg-soft hover:bg-surface-active'
                            "
                            [attr.aria-selected]="i === stateIndex()"
                            (click)="pickState(item.name)"
                          >
                            {{ item.name }}
                            @if (item.kind; as kind) {
                              <ui-chip
                                class="kind ml-1"
                                [label]="kindLabel(kind)"
                                [tone]="kindLabels[kind].tone"
                              />
                            }
                          </button>
                        }
                      </div>
                      <div class="switches flex flex-wrap gap-x-3">
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
                                    ? 'bg-surface-inverse text-fg-on-inverse'
                                    : 'bg-surface-muted text-fg-soft hover:bg-surface-active'
                                "
                                [attr.aria-pressed]="choice.id === viewport()"
                                (click)="pickViewport(choice.query)"
                              >
                                {{ choice.label }}
                              </button>
                            }
                          </div>
                        }
                        @if (schemeChoices().length) {
                          <!-- Light / Dark (qits-2086): only for a bundle frozen in schemes. -->
                          <div
                            role="group"
                            aria-label="Colour scheme"
                            class="schemes mb-2 flex flex-wrap gap-1"
                          >
                            @for (choice of schemeChoices(); track choice.id) {
                              <button
                                type="button"
                                class="scheme cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                                [class]="
                                  choice.id === scheme()
                                    ? 'bg-surface-inverse text-fg-on-inverse'
                                    : 'bg-surface-muted text-fg-soft hover:bg-surface-active'
                                "
                                [attr.aria-pressed]="choice.id === scheme()"
                                (click)="pickScheme(choice.id)"
                              >
                                {{ choice.label }}
                              </button>
                            }
                          </div>
                        }
                        <!--
                            Pick data (qits-2144): a click in the frame selects the data it shows
                            instead of following a link. Off for a screenshot without marks.
                          -->
                        <div class="mb-2 flex gap-1">
                          <button
                            type="button"
                            class="pick-data cursor-pointer rounded px-2 py-0.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            [class]="
                              pickActive()
                                ? 'bg-surface-inverse text-fg-on-inverse'
                                : 'bg-surface-muted text-fg-soft enabled:hover:bg-surface-active'
                            "
                            [attr.aria-pressed]="pickActive()"
                            [disabled]="!hasMarks()"
                            [title]="
                              hasMarks()
                                ? 'Click a part of the screenshot to see the data it shows'
                                : noMarks
                            "
                            (click)="pickingData.set(!pickingData())"
                          >
                            Pick data
                          </button>
                        </div>
                      </div>
                      <!--
                        One line, always as tall, so a notice never moves the frame (qits-2072).
                      -->
                      <p class="notice-line m-0 mb-2 h-4 truncate text-xs text-fg-soft">
                        @if (linkNotice() ?? highlightNotice(); as notice) {
                          <span class="link-notice">{{ notice }}</span>
                        }
                      </p>
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
                                class="block origin-top-left box-content rounded-md border border-line"
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
                              class="block h-[32rem] w-full rounded-md border border-line"
                              sandbox="allow-same-origin"
                              [srcdoc]="html"
                              [title]="'Frozen state ' + (freeze()?.name ?? '')"
                              (load)="frameLoaded($event)"
                            ></iframe>
                          }
                        } @else {
                          <div
                            class="frame-placeholder flex h-[32rem] items-center justify-center rounded-md border border-line bg-surface text-sm text-fg-soft"
                          >
                            {{
                              freezeFailed()
                                ? 'Could not read this frozen state.'
                                : 'Reading the frozen state…'
                            }}
                          </div>
                        }
                      </div>
                    } @else if (!forward()) {
                      <p class="no-states m-0 text-sm text-fg-soft">
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
                    <h3 class="m-0 text-xs font-semibold text-fg-soft uppercase">Routes showing</h3>
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
                      <span class="text-xs text-fg-muted"> · {{ entity.application }}</span>
                    </p>
                    <ul class="m-0 flex list-none flex-col gap-1 p-0">
                      @for (route of entity.routes; track route.route) {
                        <li class="entity-route flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            class="cursor-pointer rounded px-1 text-left font-mono text-xs hover:bg-surface-subtle"
                            (click)="openRoute(route.route)"
                          >
                            /{{ route.route }}
                          </button>
                          @for (verb of route.verbs; track verb) {
                            <ui-chip class="verb" [label]="verb" />
                          }
                        </li>
                      } @empty {
                        <li class="text-fg-soft">No route shows this.</li>
                      }
                    </ul>
                  </aside>
                } @else {
                  <aside
                    aria-label="Calls"
                    class="text-[0.8125rem] xl:min-h-0 xl:overflow-y-auto xl:pb-6"
                  >
                    @if (selectedData(); as data) {
                      <ng-container
                        [ngTemplateOutlet]="selectedDataPanel"
                        [ngTemplateOutletContext]="{ $implicit: data }"
                      />
                    }
                    <h3 class="m-0 mb-1 text-xs font-semibold text-fg-soft uppercase">
                      Calls and states
                    </h3>
                    @if (freeze() && !hasMarks()) {
                      <p class="no-marks m-0 mb-1.5 text-xs text-fg-soft">{{ noMarks }}</p>
                    }
                    <ul class="own-calls m-0 flex list-none flex-col gap-1.5 p-0">
                      @for (call of calls().shown; track $index) {
                        <ng-container
                          [ngTemplateOutlet]="callRow"
                          [ngTemplateOutletContext]="{ $implicit: call }"
                        />
                      } @empty {
                        @if (calls().appWide.length) {
                          <li class="only-app-wide text-fg-soft">No call but the app-wide ones.</li>
                        } @else if (!calls().hidden) {
                          <li class="text-fg-soft">Its spec answers no request.</li>
                        }
                      }
                    </ul>
                    @if (calls().appWide.length; as count) {
                      <button
                        type="button"
                        class="app-wide-toggle mt-2 flex cursor-pointer items-center gap-1 rounded px-1 text-left text-xs font-semibold text-fg-soft hover:bg-surface-subtle hover:text-fg"
                        [attr.aria-expanded]="appWideOpen()"
                        (click)="appWideOpen.set(!appWideOpen())"
                      >
                        <span aria-hidden="true">{{ appWideOpen() ? '▾' : '▸' }}</span>
                        <span class="tabular-nums">{{ count }}</span>
                        <span>app-wide call{{ count === 1 ? '' : 's' }}</span>
                      </button>
                      @if (appWideOpen()) {
                        <ul class="app-wide-calls m-0 mt-1 flex list-none flex-col gap-1.5 p-0">
                          @for (call of calls().appWide; track $index) {
                            <ng-container
                              [ngTemplateOutlet]="callRow"
                              [ngTemplateOutletContext]="{ $implicit: call }"
                            />
                          }
                        </ul>
                      }
                    }
                    @if (calls().hidden; as hidden) {
                      <p class="hidden-calls m-0 mt-2 text-xs text-fg-soft">
                        Hid {{ hidden }} call{{ hidden === 1 ? '' : 's' }} to providers outside
                        {{ scopeComponent() }}.
                      </p>
                    }

                    <h3 class="m-0 mt-4 mb-1 text-xs font-semibold text-fg-soft uppercase">
                      Outcomes
                    </h3>
                    @if (outcomeStatus() === 'declared') {
                      @for (mark of shownResults(); track mark) {
                        <p class="shown-result m-0 mb-1 text-xs text-fg-soft">
                          This screenshot shows the result of
                          <span class="font-mono">{{ mark }}</span>
                        </p>
                      }
                      @if (predatesTriggers()) {
                        <p class="predates m-0 mb-1 text-xs text-fg-soft">
                          This bundle predates per-screenshot outcomes; showing the whole route.
                        </p>
                      }
                      <ul class="route-outcomes m-0 flex list-none flex-col gap-1.5 p-0">
                        @for (outcome of shownOutcomes(); track outcome.key) {
                          <ng-container
                            [ngTemplateOutlet]="outcomeRow"
                            [ngTemplateOutletContext]="{ $implicit: outcome }"
                          />
                        } @empty {
                          @if (pageOutcomes().length) {
                            <li class="none-shown text-fg-soft">
                              This screenshot shows no trigger of this route’s outcomes.
                            </li>
                          } @else {
                            <li class="no-outcomes text-fg-soft">
                              Not declared yet: {{ outcomeProgress().declaring }} of
                              {{ outcomeProgress().pages }} pages
                              {{ outcomeProgress().declaring === 1 ? 'declares' : 'declare' }}
                              outcomes.
                            </li>
                          }
                        }
                      </ul>
                      @if (shownShared().count; as count) {
                        <button
                          type="button"
                          class="shared-toggle mt-2 flex cursor-pointer items-center gap-1 rounded px-1 text-left text-xs font-semibold text-fg-soft hover:bg-surface-subtle hover:text-fg"
                          [attr.aria-expanded]="sharedOpen()"
                          (click)="sharedOpen.set(!sharedOpen())"
                        >
                          <span aria-hidden="true">{{ sharedOpen() ? '▾' : '▸' }}</span>
                          <span>Shared</span>
                          <span class="tabular-nums opacity-70">{{ count }}</span>
                        </button>
                        @if (sharedOpen()) {
                          @for (group of shownShared().groups; track group.route) {
                            <h4
                              class="shared-group m-0 mt-2 mb-1 px-1 text-xs font-semibold text-fg-soft"
                            >
                              {{ scopeOf(group.route, true) }}
                            </h4>
                            <ul class="shared-outcomes m-0 flex list-none flex-col gap-1.5 p-0">
                              @for (outcome of group.outcomes; track outcome.key) {
                                <ng-container
                                  [ngTemplateOutlet]="outcomeRow"
                                  [ngTemplateOutletContext]="{ $implicit: outcome }"
                                />
                              }
                            </ul>
                          }
                        }
                      }
                      @if (unseenOutcomes().length; as count) {
                        <button
                          type="button"
                          class="unseen-toggle mt-2 flex cursor-pointer items-start gap-1 rounded px-1 text-left text-xs font-semibold text-fg-soft hover:bg-surface-subtle hover:text-fg"
                          [attr.aria-expanded]="unseenOpen()"
                          (click)="unseenOpen.set(!unseenOpen())"
                        >
                          <span aria-hidden="true">{{ unseenOpen() ? '▾' : '▸' }}</span>
                          <span>
                            {{ count }} more
                            {{
                              count === 1
                                ? 'outcome of this route is not visible here'
                                : 'outcomes of this route are not visible here'
                            }}
                          </span>
                        </button>
                        @if (unseenOpen()) {
                          <ul class="unseen-outcomes m-0 mt-1 flex list-none flex-col gap-1.5 p-0">
                            @for (unseen of unseenOutcomes(); track unseen.outcome.key) {
                              <li class="unseen-outcome flex flex-col gap-0.5">
                                <span class="flex flex-wrap items-center gap-1 px-1">
                                  <span class="font-mono text-xs">{{ unseen.outcome.mark }}</span>
                                  <ui-chip
                                    class="kind ml-auto"
                                    [label]="unseen.outcome.declared.kind"
                                  />
                                </span>
                                @if (unseen.shownIn; as link) {
                                  <button
                                    type="button"
                                    class="shown-in cursor-pointer self-start rounded px-1 text-left text-xs text-fg-soft underline hover:bg-surface-subtle"
                                    [title]="
                                      'Open the state that shows the trigger of ' +
                                      unseen.outcome.mark
                                    "
                                    (click)="pickShownIn(link)"
                                  >
                                    Shown in {{ link.label }}
                                  </button>
                                } @else if (
                                  unseen.outcome.triggered && unseen.outcome.triggerFreezes.length
                                ) {
                                  <p class="not-on-route m-0 px-1 text-xs text-fg-soft">
                                    No screenshot of this route shows its trigger.
                                  </p>
                                }
                                <ng-container
                                  [ngTemplateOutlet]="outcomeGaps"
                                  [ngTemplateOutletContext]="{ $implicit: unseen.outcome }"
                                />
                              </li>
                            }
                          </ul>
                        }
                      }
                    } @else {
                      <ng-container [ngTemplateOutlet]="outcomesMissing" />
                    }

                    <h3 class="m-0 mt-4 mb-1 text-xs font-semibold text-fg-soft uppercase">
                      Entities
                    </h3>
                    @if (routeEntities(); as found) {
                      <ul class="m-0 flex list-none flex-col gap-1 p-0">
                        @for (entity of found.entities; track entity.key) {
                          <li class="route-entity flex flex-wrap items-center gap-1">
                            <span class="font-mono text-xs">{{ entity.name }}</span>
                            @if (slug(); as project) {
                              <a
                                class="entity-link text-xs text-fg-soft no-underline hover:text-fg"
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
                            <span class="text-xs text-fg-muted">{{ entity.application }}</span>
                            @for (verb of entity.verbs; track verb) {
                              <ui-chip class="verb" [label]="verb" />
                            }
                          </li>
                        } @empty {
                          <li class="no-entities text-fg-soft">
                            This route touches no mapped entity.
                          </li>
                        }
                      </ul>
                      @if (found.unmatched; as unmatched) {
                        <p class="unmatched m-0 mt-2 text-xs text-fg-soft">
                          {{ unmatched }} {{ unmatched === 1 ? 'call touches' : 'calls touch' }} no
                          mapped entity.
                        </p>
                      }
                    } @else if (entityState() === 'error') {
                      <p class="entities-error m-0 text-danger">Could not read the entity maps.</p>
                    } @else {
                      <p class="m-0 text-fg-soft">Reading the entity maps…</p>
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
          <p class="no-outcomes m-0 text-fg-soft">
            This bundle was frozen before outcomes were recorded.
          </p>
        }
        @case ('invalid') {
          <p class="no-outcomes outcomes-error m-0 text-danger">
            Could not read this bundle's outcomes.
          </p>
        }
        @case ('undeclared') {
          <p class="no-outcomes m-0 text-fg-soft">{{ repo() }} declares no outcomes yet.</p>
        }
      }
    </ng-template>

    <!--
      One source of an inbound exit, or an outcome without a fixed target, in the Outcomes tab
      (qits-2049): where it is declared and its interaction:outcome; a click shows its trigger.
    -->
    <ng-template #outcomeSource let-source let-target="target">
      <li class="outcome-source flex flex-col">
        <button
          type="button"
          class="source flex w-full cursor-pointer flex-wrap items-center gap-x-1.5 rounded px-2 py-0.5 text-left"
          [class]="
            source.outcome.key === highlighted()
              ? 'bg-surface-inverse text-fg-on-inverse'
              : 'hover:bg-surface-subtle'
          "
          [attr.aria-pressed]="source.outcome.key === highlighted()"
          [title]="
            'Highlight the trigger of ' +
            source.outcome.mark +
            ' (' +
            source.outcome.declared.file +
            ')'
          "
          (click)="pickSource(source.outcome, target)"
        >
          <span class="source-scope text-xs opacity-70">{{ source.scope }}</span>
          <span class="font-mono text-xs">{{ source.outcome.mark }}</span>
        </button>
        @if (target === null && leads(source.outcome); as line) {
          <p class="outcome-leads m-0 px-2 text-xs text-fg-soft">{{ line }}</p>
        }
      </li>
    </ng-template>

    <!--
      Where an exit leads (qits-2006): a button selecting its target route, or the target no route
      matches. An outcome row's and a forward's (qits-2076).
    -->
    <ng-template #exitTarget let-outcome>
      @if (outcome.target; as target) {
        @if (target.kind === 'route') {
          <button
            type="button"
            class="outcome-target cursor-pointer self-start rounded px-1 text-left font-mono text-xs hover:bg-surface-subtle"
            (click)="openRoute(target.fullPath)"
          >
            → /{{ target.fullPath }}
          </button>
        } @else {
          <p class="outcome-unmatched m-0 px-1 text-xs text-fg-soft">
            No route of this app matches /{{ outcome.declared.to ?? '' }}
          </p>
        }
      }
    </ng-template>

    <!-- One outcome of the right panel: the page's own, or a shared one (qits-2006, qits-2049). -->
    <ng-template #outcomeRow let-outcome>
      <li class="outcome flex flex-col gap-0.5">
        <button
          type="button"
          class="outcome-pick flex w-full cursor-pointer flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left"
          [class]="
            outcome.key === highlighted()
              ? 'bg-surface-inverse text-fg-on-inverse'
              : 'hover:bg-surface-subtle'
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
        @if (outcome.target) {
          <ng-container
            [ngTemplateOutlet]="exitTarget"
            [ngTemplateOutletContext]="{ $implicit: outcome }"
          />
        } @else if (leads(outcome); as line) {
          <p class="outcome-leads m-0 px-1 text-xs text-fg-soft">{{ line }}</p>
        }
        @if (outcome.library) {
          <p class="outcome-library m-0 px-1 text-xs text-fg-soft" [title]="outcome.declared.file">
            Declared by &#64;qits/angular
          </p>
        }
        @if (outcome.result; as result) {
          <button
            type="button"
            class="outcome-result cursor-pointer self-start rounded px-1 text-left text-xs text-fg-soft underline hover:bg-surface-subtle"
            [title]="'Open the state ' + result.name"
            (click)="showResult(result)"
          >
            Show result
          </button>
        }
        @for (test of outcome.reachedBy; track $index) {
          <p class="reached-by m-0 truncate px-1 text-xs text-fg-soft" [title]="testTitle(test)">
            {{ test.test }}
          </p>
        }
        <ng-container
          [ngTemplateOutlet]="outcomeGaps"
          [ngTemplateOutletContext]="{ $implicit: outcome }"
        />
      </li>
    </ng-template>

    <!--
      An outcome's gap line (qits-2006): no test reaches it, or no screenshot shows its trigger. An
      outcome row's, and one not visible in the selected screenshot's (qits-2080).
    -->
    <ng-template #outcomeGaps let-outcome>
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
    </ng-template>

    <!--
      One call of the selected screenshot: its own, or an app-wide one (qits-2080). Its cardinality,
      and, when the screenshot marks its read, a toggle highlighting all of it and its marked items,
      each field of which highlights alone (qits-2144).
    -->
    <ng-template #callRow let-call>
      @let marks = marksOf(call);
      <li
        class="call rounded"
        [class]="isSelectedCall(call) ? 'selected-call bg-accent-soft' : ''"
        [attr.aria-current]="isSelectedCall(call) ? 'true' : null"
      >
        <div class="flex items-center gap-1">
          <app-call-details
            class="min-w-0 flex-1"
            [call]="call"
            [site]="siteOf(call.provider)"
            [entities]="callEntities(call)"
            [project]="slug() ?? null"
            (entityPicked)="pickEntity($event)"
          />
          @if (cardinalityOf(call); as cardinality) {
            <ui-chip class="cardinality shrink-0" [label]="cardinality" />
          }
          @if (marks.length) {
            <button
              type="button"
              class="call-data shrink-0 cursor-pointer rounded px-1 text-xs"
              [class]="
                isCallHighlighted(call)
                  ? 'bg-surface-inverse text-fg-on-inverse'
                  : 'text-fg-soft hover:bg-surface-subtle hover:text-fg'
              "
              [attr.aria-pressed]="isCallHighlighted(call)"
              [attr.aria-label]="'Highlight the data of ' + call.operationId"
              [title]="'Highlight the data of ' + call.operationId"
              (click)="toggleCallData(call)"
            >
              ◎
            </button>
            <button
              type="button"
              class="call-items-toggle shrink-0 cursor-pointer rounded px-1 text-xs text-fg-soft hover:bg-surface-subtle hover:text-fg"
              [attr.aria-expanded]="isExpanded(call)"
              [attr.aria-label]="'Items of ' + call.operationId"
              [title]="'Items of ' + call.operationId"
              (click)="toggleItems(call)"
            >
              {{ isExpanded(call) ? '▾' : '▸' }}
            </button>
          }
        </div>
        @if (marks.length && isExpanded(call)) {
          <ul
            class="call-items m-0 mt-1 ml-2 flex list-none flex-col gap-1 border-l border-line p-0 pl-2"
          >
            @for (group of itemGroups(call); track group.item) {
              <li class="call-item text-xs">
                <span class="item-key block font-mono break-all text-fg-soft">{{
                  group.item ?? 'no item'
                }}</span>
                <span class="flex flex-wrap gap-1">
                  @for (mark of group.marks; track $index) {
                    <button
                      type="button"
                      class="data-mark cursor-pointer rounded px-1 font-mono"
                      [class]="
                        isMarkHighlighted(mark)
                          ? 'bg-surface-inverse text-fg-on-inverse'
                          : 'bg-surface-muted hover:bg-surface-active'
                      "
                      [attr.aria-pressed]="isMarkHighlighted(mark)"
                      (click)="toggleMark(mark)"
                    >
                      {{ dataMarkLabel(mark) }}
                    </button>
                  }
                </span>
              </li>
            }
          </ul>
        }
      </li>
    </ng-template>

    <!--
      What the mark picked in the frame shows (qits-2144): its read, the item, the field's recorded
      value, a derived mark's inputs, and the entities of the read.
    -->
    <ng-template #selectedDataPanel let-data>
      <section
        aria-label="Selected data"
        class="selected-data mb-4 flex flex-col gap-2 rounded-md border border-accent-line p-2 text-xs"
      >
        <div class="flex items-center gap-2">
          <h3 class="m-0 font-semibold text-fg-soft uppercase">Selected data</h3>
          <button
            type="button"
            class="clear-data ml-auto cursor-pointer rounded px-1 text-fg-soft hover:bg-surface-subtle hover:text-fg"
            aria-label="Clear the selected data"
            title="Clear the selected data"
            (click)="clearData()"
          >
            ✕
          </button>
        </div>
        @switch (data.read.kind) {
          @case ('loading') {
            <p class="read-loading m-0 text-fg-soft">Reading the recorded answers…</p>
          }
          @case ('none') {
            <p class="read-none m-0 text-fg-soft">
              No read marked: no single recorded answer of this screenshot holds it.
            </p>
          }
          @case ('ambiguous') {
            <div class="read-ambiguous">
              <ui-chip class="ambiguous" tone="waiting" label="ambiguous" />
              @if (data.read.records.length) {
                <p class="m-0 mt-1 text-fg-soft">
                  {{ data.mark.source }} is recorded in several states, and the item does not tell
                  which one it shows:
                </p>
                <ul class="m-0 mt-0.5 list-none p-0">
                  @for (record of data.read.records; track $index) {
                    <li class="candidate font-mono">{{ recordLabel(record) }}</li>
                  }
                </ul>
              } @else {
                <p class="m-0 mt-1 text-fg-soft">
                  No call of this screenshot answers {{ data.mark.source }}.
                </p>
              }
            </div>
          }
          @default {
            @if (data.record; as record) {
              <!--
                The read: its operation, provider and state, its popover linking the state's page
                and its entities' pages as every call row's does (open-call-contract).
              -->
              <div class="read">
                <app-call-details
                  [call]="record"
                  [site]="siteOf(record.provider)"
                  [entities]="data.entities"
                  [project]="slug() ?? null"
                  (entityPicked)="pickEntity($event)"
                />
              </div>
              @if (data.cardinality || data.mark.joinedFrom || data.read.kind === 'byItem') {
                <div class="flex flex-wrap gap-1">
                  @if (data.cardinality; as cardinality) {
                    <ui-chip class="cardinality" [label]="cardinality" />
                  }
                  @if (data.mark.joinedFrom; as list) {
                    <ui-chip class="joined" label="joined" [title]="'Joined into ' + list" />
                  }
                  @if (data.read.kind === 'byItem') {
                    <ui-chip class="by-item" tone="waiting" label="found by item, not marked" />
                  }
                </div>
              }
            }
          }
        }
        @if (data.item || data.field || data.derived.length) {
          <dl class="values m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            @if (data.item; as item) {
              <dt class="text-fg-muted">Item</dt>
              <dd class="item m-0 font-mono break-all">{{ item.key }} = {{ item.value }}</dd>
            }
            @if (data.field; as field) {
              <dt class="text-fg-muted">Field</dt>
              <dd class="field m-0 font-mono break-all">{{ field.path }}</dd>
              <dt class="text-fg-muted">Value</dt>
              <dd
                class="value m-0 break-all"
                [class]="field.found ? 'font-mono' : 'text-fg-soft italic'"
              >
                {{ field.text }}
              </dd>
            }
            @if (data.derived.length) {
              <dt class="text-fg-muted">Derived from</dt>
              <dd class="m-0">
                <ul class="m-0 list-none p-0">
                  @for (input of data.derived; track input.path) {
                    <li class="derived break-all">
                      <span class="font-mono">{{ input.path }}</span
                      >:
                      <span [class]="input.found ? 'font-mono' : 'text-fg-soft italic'">{{
                        input.text
                      }}</span>
                    </li>
                  }
                </ul>
              </dd>
            }
          </dl>
        } @else if (!data.mark.field && !data.mark.derived.length && data.mark.source) {
          <p class="m-0 text-fg-soft">The whole read: no item or field is marked here.</p>
        }
        @if (data.entities.length) {
          <div>
            <h4 class="m-0 mb-1 font-semibold text-fg-soft uppercase">Entities</h4>
            <div class="flex flex-wrap gap-1">
              @for (e of data.entities; track e.key) {
                <span class="inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    class="data-entity cursor-pointer rounded bg-surface-muted px-1.5 font-mono font-semibold hover:bg-surface-active"
                    (click)="pickEntity(e.key)"
                  >
                    {{ e.name }}
                  </button>
                </span>
              }
            </div>
          </div>
        }
      </section>
    </ng-template>
  `,
})
export class UiBuilderPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(RoutesBundles);
  private readonly entityMaps = inject(ContractsCatalog);
  private readonly contracts = inject(ContractsBundles);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly theme = inject(ThemePreferenceStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * The open project's repositories (`PROJECT_REPOSITORIES`, qits-2146), in the browser only, read
   * again after a commit to its wrapper's main branch.
   */
  private readonly repositories = qitsResource(
    PROJECT_REPOSITORIES,
    () => {
      const projectId = this.browser ? this.selected.project()?.id : undefined;
      return projectId ? { path: { projectId } } : undefined;
    },
    { refreshOn: { names: ['SCMPublishCommit'], when: (event) => this.commitsToWrapper(event) } },
  );

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

  /**
   * The row of the URL's `route` when a route row answers it (`answeringRow`: its own, or an
   * address a route rendering nothing folds into it, qits-2076), else the first route with states.
   */
  protected readonly selectedRow = computed((): TreeRow | null => {
    const picked = this.query().route;
    const rows = this.rows();
    const path = (picked === null ? undefined : answeringRow(rows, picked))?.fullPath;
    const shown = path ?? initialRoute(rows);
    return shown === null ? null : (answeringRow(rows, shown) ?? null);
  });

  /** The selected row's full path (see `selectedRow`). */
  protected readonly selectedPath = computed(() => this.selectedRow()?.fullPath ?? null);

  /** The addresses the selected row also answers (qits-2076), whose freezes and calls it shows too. */
  private readonly selectedAlso = computed(() => this.selectedRow()?.alsoAnswers ?? []);

  /**
   * The selected route's states (`routeStates`, qits-2047): its freezes by name, DATA first, with
   * those of the addresses it also answers (qits-2076).
   */
  protected readonly states = computed(() => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null ? routeStates(bundle.manifest, path, this.selectedAlso()) : [];
  });

  /** Whether the selected route only forwards (qits-2076, the manifest's `forward`). */
  protected readonly forward = computed(() => this.selectedRow()?.forward === true);

  /**
   * Where the selected forward goes (`forwardExits`, qits-2076): the exits declared on its full
   * path, each with its target; none for a route that is no forward.
   */
  protected readonly forwards = computed((): readonly JoinedOutcome[] => {
    const bundle = this.loaded();
    const path = this.selectedPath();
    return bundle && path !== null && this.forward() ? forwardExits(bundle.manifest, path) : [];
  });

  /**
   * A state kind's words on its tab (qits-2047); a forward's PENDING state is what you see while it
   * forwards (qits-2076).
   */
  protected kindLabel(kind: FreezeKind): string {
    return kind === 'PENDING' && this.forward() ? 'while it forwards' : KIND_LABELS[kind].label;
  }

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

  /**
   * The schemes the bundle was frozen in (qits-2086, `colorSchemesOf`), as the scheme switch's
   * buttons; none for a bundle frozen without schemes, which shows no switch.
   */
  protected readonly schemeChoices = computed(() => {
    const bundle = this.loaded();
    const schemes = bundle ? colorSchemesOf(bundle.manifest) : [];
    return SCHEME_CHOICES.filter((choice) => schemes.includes(choice.id));
  });

  /** The scheme the user picked on the switch (qits-2086); null until they pick one. */
  private readonly pickedScheme = signal<FreezeColorScheme | null>(null);

  /**
   * The scheme the freezes are drawn in (qits-2086): the one picked on the switch, else the app's
   * own (`ThemePreferenceStore.resolved`), so the frame matches the page around it until asked.
   */
  protected readonly scheme = computed(
    (): FreezeColorScheme =>
      this.pickedScheme() ?? (this.theme.resolved() === 'dark' ? 'DARK' : 'LIGHT'),
  );

  /**
   * The freeze drawn: the selected state's at the chosen viewport (`stateFreeze`, qits-2047), in the
   * chosen scheme when the shot has it (qits-2086).
   */
  protected readonly freeze = computed((): Freeze | null => {
    const state = this.states()[this.stateIndex()];
    return state ? stateFreeze(state, this.viewport(), this.scheme()) : null;
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

  /**
   * Why the shown freeze draws no highlight (qits-2072): it lists the trigger, and its document has
   * no element for it. Judged anew on every draw, and cleared whenever the shown freeze changes, so
   * a step back or forward never carries the previous step's notice; it shares the line above the
   * frame with `linkNotice`, which wins.
   */
  protected readonly highlightNotice = signal<string | null>(null);

  /** The shown freeze's file (its viewport is in it); what clears `highlightNotice` (qits-2072). */
  private readonly shownFile = computed(() => this.freeze()?.file ?? null);

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
    const entries = this.repositoryList()?.entries ?? [];
    return entries.find((entry) => entry.repository?.name === this.repo());
  });

  private readonly componentOf = computed(() => {
    const entries = this.repositoryList()?.entries ?? [];
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

  /** The bundle's app-wide calls (`appWideCalls`, qits-2080), by `callKey`: read once per bundle. */
  private readonly appWide = computed((): ReadonlySet<string> => {
    const bundle = this.loaded();
    return bundle ? appWideCalls(bundle.manifest) : new Set();
  });

  /**
   * The selected freeze's calls in scope (`freezeCalls`, qits-2080): its own (`shown`), its app-wide
   * ones (`appWide`), and how many the scope hid. None when no freeze is selected.
   */
  protected readonly calls = computed(() => {
    const freeze = this.freeze();
    const all: readonly FreezeRecord[] = freeze ? freezeCalls(freeze) : [];
    const scope = this.scope();
    const components = this.componentOf();
    const inScope =
      !scope || scope.all
        ? all
        : all.filter((call) => components.get(call.provider) === scope.component);
    const appWide = this.appWide();
    return {
      shown: inScope.filter((call) => !appWide.has(callKey(call))),
      appWide: inScope.filter((call) => appWide.has(callKey(call))),
      hidden: all.length - inScope.length,
    };
  });

  /** Whether the selected freeze's app-wide calls are open (qits-2080); collapsed until asked. */
  protected readonly appWideOpen = signal(false);

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

  /** The layouts' and app-wide outcomes, joined (`sharedOutcomes`, qits-2006). */
  private readonly sharedGroups = computed(() => {
    const bundle = this.loaded();
    return bundle ? sharedOutcomes(bundle.manifest, this.selectedPath()) : [];
  });

  /**
   * The right panel's "Shared" group (qits-2049): the shared outcomes whose scope takes the selected
   * route, by layout (by path), then app-wide; the scopes with none left out.
   */
  protected readonly scopedShared = computed(() => {
    const path = this.selectedPath();
    const groups = this.sharedGroups()
      .map((group) => ({
        route: group.route,
        outcomes: group.outcomes.filter((outcome) => inOutcomeScope(outcome.declared, path)),
      }))
      .filter((group) => group.outcomes.length);
    return {
      groups: [
        ...groups.filter((group) => group.route !== null),
        ...groups.filter((group) => group.route === null),
      ],
      count: groups.reduce((sum, group) => sum + group.outcomes.length, 0),
    };
  });

  /** Whether the right panel's "Shared" group is open (qits-2049); collapsed until asked. */
  protected readonly sharedOpen = signal(false);

  /**
   * The marks the selected freeze shows the triggers of (qits-2080), which scope the right panel's
   * outcomes; null when no freeze is selected or its bundle predates `triggers`, which shows the
   * whole route's.
   */
  private readonly shownTriggers = computed(
    (): readonly string[] | null => this.freeze()?.triggers ?? null,
  );

  /** Whether the selected freeze's bundle predates per-screenshot outcomes (qits-2080). */
  protected readonly predatesTriggers = computed(() => {
    const freeze = this.freeze();
    return !!freeze && freeze.triggers === undefined;
  });

  /** Whether `outcome`'s trigger is in the selected freeze (qits-2080); any is without triggers. */
  private readonly visible = computed((): ((outcome: JoinedOutcome) => boolean) => {
    const triggers = this.shownTriggers();
    return (outcome) => triggers === null || triggers.includes(outcome.mark);
  });

  /** The selected route's page outcomes whose trigger the selected freeze shows (qits-2080). */
  protected readonly shownOutcomes = computed(() => this.pageOutcomes().filter(this.visible()));

  /** The "Shared" group (`scopedShared`) narrowed to the selected freeze's triggers (qits-2080). */
  protected readonly shownShared = computed(() => {
    const visible = this.visible();
    const groups = this.scopedShared()
      .groups.map((group) => ({ route: group.route, outcomes: group.outcomes.filter(visible) }))
      .filter((group) => group.outcomes.length);
    return { groups, count: groups.reduce((sum, group) => sum + group.outcomes.length, 0) };
  });

  /**
   * The route's page and shared outcomes the selected freeze does not show the trigger of
   * (qits-2080), each with a state of this route that does (`shownIn`); none when the panel shows
   * the whole route's.
   */
  protected readonly unseenOutcomes = computed((): readonly UnseenOutcome[] => {
    if (this.shownTriggers() === null) return [];
    const visible = this.visible();
    return [...this.pageOutcomes(), ...this.scopedShared().groups.flatMap((g) => g.outcomes)]
      .filter((outcome) => !visible(outcome))
      .map((outcome) => ({ outcome, shownIn: this.shownIn(outcome) }));
  });

  /** Whether the "not visible here" group is open (qits-2080); collapsed until asked. */
  protected readonly unseenOpen = signal(false);

  /**
   * The state of the selected route that shows `outcome`'s trigger (qits-2080): of its
   * `triggerFreezes` that are this route's (or an address it also answers), one the state list and
   * the viewport switch draw (`stateFreeze`), at the chosen viewport when one is, else the first;
   * null for an untriggered outcome or when none is.
   */
  private shownIn(outcome: JoinedOutcome): StateLink | null {
    if (!outcome.triggered) return null;
    const states = this.states();
    const current = this.viewport();
    const links = outcome.triggerFreezes.flatMap((freeze): StateLink[] => {
      const state = states.find((s) => s.freezes.some((f) => f.file === freeze.file));
      const at = freeze.viewport ?? current;
      if (!state || stateFreeze(state, at, this.scheme()).file !== freeze.file) return [];
      const width = VIEWPORT_CHOICES.find((choice) => choice.id === freeze.viewport);
      return [
        {
          state: state.name,
          viewport: width?.query ?? null,
          at,
          label: width ? `${state.name} · ${width.label}` : state.name,
        },
      ];
    });
    return links.find((link) => link.at === current) ?? links[0] ?? null;
  }

  /**
   * Selects the state and viewport `link` names (qits-2080), through the URL as the state list and
   * the viewport switch do; a freeze at the test's own viewport keeps the chosen one.
   */
  protected pickShownIn(link: StateLink): void {
    this.linkNotice.set(null);
    void this.navigate({
      state: link.state,
      ...(link.viewport ? { viewport: link.viewport } : {}),
    });
  }

  /** The outcomes whose result the selected freeze shows (`freezeResults`, qits-2080). */
  protected readonly shownResults = computed((): readonly string[] => {
    const bundle = this.loaded();
    const freeze = this.freeze();
    return bundle && freeze ? freezeResults(bundle.manifest, freeze) : [];
  });

  /** Where a declaration is scoped, as a source says it (qits-2049). */
  protected scopeOf(route: string | null, global: boolean): string {
    if (route === null) return 'App-wide';
    return global ? `/${route} and below` : `/${route}`;
  }

  /** `declared` joined (`joinedOutcome`) with where it is declared, for the Outcomes tab (qits-2049). */
  private source(declared: DeclaredOutcome): OutcomeSource {
    const bundle = this.loaded();
    return {
      scope: this.scopeOf(declared.route, declared.global),
      outcome: joinedOutcome(bundle!.manifest, declared),
    };
  }

  /** The Outcomes tab's routes (`inboundExits`, qits-2049): unreachable first, each with its sources. */
  protected readonly inboundRoutes = computed((): readonly InboundRow[] => {
    const bundle = this.loaded();
    if (!bundle) return [];
    return inboundExits(bundle.manifest).map((route) => ({
      fullPath: route.fullPath,
      entry: route.entry,
      unreachable: unreachable(route),
      sources: route.inbound.map((declared) => this.source(declared)),
    }));
  });

  /** The Outcomes tab's summary (qits-2049): how many of the checked routes nothing leads to. */
  protected readonly inboundCounts = computed(() => {
    const routes = this.inboundRoutes();
    return { unreachable: routes.filter((r) => r.unreachable).length, total: routes.length };
  });

  /** The outcomes that leave without a fixed target (`unfixedOutcomes`, qits-2049), as sources. */
  protected readonly unfixed = computed((): readonly OutcomeSource[] => {
    const bundle = this.loaded();
    return bundle ? unfixedOutcomes(bundle.manifest).map((d) => this.source(d)) : [];
  });

  /** The Outcomes tab's expanded routes (qits-2049), by full path. */
  protected readonly expandedInbound = signal<ReadonlySet<string>>(new Set());

  protected toggleInbound(fullPath: string): void {
    this.expandedInbound.update((set) => {
      const next = new Set(set);
      if (!next.delete(fullPath)) next.add(fullPath);
      return next;
    });
  }

  /** The key of the highlighted outcome (qits-2006); null when none is. */
  protected readonly highlighted = signal<string | null>(null);

  /**
   * The highlighted outcome, among the route's, the shared ones (qits-2006) and the Outcomes tab's
   * sources (qits-2049), which may be another route's page outcomes.
   */
  private readonly highlightedOutcome = computed(() => {
    const key = this.highlighted();
    if (key === null) return null;
    const all = [
      ...this.pageOutcomes(),
      ...this.sharedGroups().flatMap((group) => group.outcomes),
      ...this.inboundRoutes().flatMap((route) => route.sources.map((source) => source.outcome)),
      ...this.unfixed().map((source) => source.outcome),
    ];
    return all.find((outcome) => outcome.key === key) ?? null;
  });

  /**
   * The frame as its last load left it, where the highlight is drawn (qits-2006); a new element
   * when the frame is drawn anew (a first read of a freeze), reassigned by every load.
   */
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
    return this.repositories.hasValue() || this.repositories.status() === 'error';
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

  /** The selected freeze's data marks (qits-2144); none for a freeze without `dataMarks`. */
  protected readonly freezeMarks = computed(
    (): readonly DataMark[] => this.freeze()?.dataMarks ?? [],
  );

  /** Whether the selected freeze marks any data (qits-2144); Pick data needs it. */
  protected readonly hasMarks = computed(() => this.freezeMarks().length > 0);

  protected readonly noMarks = NO_MARKS;

  /** The selected freeze's marks by source (qits-2144), for the call rows. */
  private readonly marksBySource = computed(() => {
    const bySource = new Map<string, DataMark[]>();
    for (const mark of this.freezeMarks()) {
      if (mark.source === null) continue;
      const marks = bySource.get(mark.source) ?? [];
      marks.push(mark);
      bySource.set(mark.source, marks);
    }
    return bySource;
  });

  /** The data highlighted in the frame (qits-2144); one selection with `highlighted`. */
  protected readonly dataSelection = signal<DataSelection | null>(null);

  /** Whether Pick data was switched on (qits-2144); it acts only while the freeze has marks. */
  protected readonly pickingData = signal(false);

  /** Whether a click in the frame picks data instead of following links (qits-2144). */
  protected readonly pickActive = computed(() => this.pickingData() && this.hasMarks());

  /** The calls whose marked items are listed (qits-2144), by `recordKey`. */
  protected readonly expandedCalls = signal<ReadonlySet<string>>(new Set());

  /** `sourceOf` for the template: a call's `<provider>#<operationId>` (qits-2144). */
  protected readonly sourceOf = sourceOf;

  /** A call's marks in the selected freeze (qits-2144). */
  protected marksOf(call: FreezeRecord): readonly DataMark[] {
    return this.marksBySource().get(sourceOf(call)) ?? [];
  }

  /**
   * A call's marks grouped by item (qits-2144), in the freeze's order; the mark of the list itself
   * (no item, field or derived path) is left out. Items whose read cannot be pinned (one source
   * recorded in several states) list under each of its calls.
   */
  protected itemGroups(call: FreezeRecord): readonly ItemGroup[] {
    const groups = new Map<string | null, DataMark[]>();
    for (const mark of this.marksOf(call)) {
      if (mark.item === null && mark.field === null && !mark.derived.length) continue;
      const marks = groups.get(mark.item) ?? [];
      marks.push(mark);
      groups.set(mark.item, marks);
    }
    return [...groups].map(([item, marks]) => ({ item, marks }));
  }

  /** A mark's words in a call's items (qits-2144): its field, its derived paths, or the item. */
  protected dataMarkLabel(mark: DataMark): string {
    if (mark.field !== null) return mark.field;
    if (mark.derived.length) return `derived: ${mark.derived.join(', ')}`;
    return 'the item';
  }

  /**
   * A call's cardinality (qits-2144): `list` or `detail`, from its operation's rows in the
   * provider's entity map (`callCardinality`); null when the map gives none.
   */
  protected cardinalityOf(call: Pick<FreezeRecord, 'provider' | 'operationId'>): string | null {
    const site = this.siteOf(call.provider);
    const read = site ? this.entityMaps.mapRead(site) : null;
    if (read?.status !== 'loaded') return null;
    const cardinality = callCardinality(read.map, call.operationId);
    return cardinality ? CARDINALITY_LABELS[cardinality] : null;
  }

  protected isExpanded(call: FreezeRecord): boolean {
    return this.expandedCalls().has(recordKey(call));
  }

  protected toggleItems(call: FreezeRecord): void {
    const key = recordKey(call);
    this.expandedCalls.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** Whether a call's data is highlighted (qits-2144): its whole read. */
  protected isCallHighlighted(call: FreezeRecord): boolean {
    const selection = this.dataSelection();
    return selection?.kind === 'call' && selection.source === sourceOf(call);
  }

  /** Whether exactly `mark` is highlighted (qits-2144), picked or chosen. */
  protected isMarkHighlighted(mark: DataMark): boolean {
    const selection = this.dataSelection();
    return selection?.kind === 'mark' && sameMark(selection.mark, mark);
  }

  /** Highlights every marked element of a call's read, or clears it when it is already (qits-2144). */
  protected toggleCallData(call: FreezeRecord): void {
    this.selectData(this.isCallHighlighted(call) ? null : { kind: 'call', source: sourceOf(call) });
  }

  /** Highlights exactly the elements of `mark`, or clears it when it is already (qits-2144). */
  protected toggleMark(mark: DataMark): void {
    this.selectData(this.isMarkHighlighted(mark) ? null : { kind: 'mark', mark, picked: null });
  }

  protected clearData(): void {
    this.selectData(null);
  }

  /**
   * Sets the data selection (qits-2144); it and the outcome highlight are one selection, so any
   * data selected clears the highlighted outcome. Drawn into the frame at once.
   */
  private selectData(selection: DataSelection | null): void {
    this.linkNotice.set(null);
    if (selection) this.highlighted.set(null);
    this.dataSelection.set(selection);
    this.drawHighlight();
  }

  /** Picks the marked element of a click in the frame (qits-2144): its resolved mark. */
  private pickElement(element: Element): void {
    const picked = markOf(element);
    const { source, item, field, derived } = picked;
    this.selectData({ kind: 'mark', mark: { source, item, field, derived }, picked });
  }

  /** The records whose answers decide what a picked mark reads (qits-2144). */
  private answerCandidates(freeze: Freeze, mark: ElementMark): readonly FreezeRecord[] {
    if (mark.source !== null) return freeze.records.filter((r) => sourceOf(r) === mark.source);
    return mark.item === null ? [] : freeze.records;
  }

  /**
   * A record's recorded answer (qits-2144), for `recordFor`: undefined while it is read (or the
   * contracts catalog is), null when there is none.
   */
  private readonly answerOf = (record: FreezeRecord): unknown => {
    if (this.entityMaps.catalog()?.status === 'error') return null;
    const read = this.answerRead(record);
    return read?.status === 'loaded' ? read.body : undefined;
  };

  /**
   * A record's recorded answer (qits-2144) from its provider's contracts site, as `ContractsBundles`
   * reads it (qits-2146; the index's state and operation, then the recorded response): undefined
   * until the catalog and the index are read and the read is asked for, null when there is none (a
   * provider without a site, a state or operation the index lacks, an unreadable index, a body that
   * is not JSON).
   */
  private answerRead(record: FreezeRecord): GoldenRead | undefined {
    if (this.entityMaps.catalog()?.status !== 'loaded') return undefined;
    const site = this.siteOf(record.provider);
    if (!site) return NO_ANSWER;
    const index = this.contracts.indexRead(site);
    if (!index) return undefined;
    if (index.status === 'loading') return LOADING_ANSWER;
    const op = index.status === 'loaded' ? recordedOperation(index.index, record) : null;
    return op ? this.contracts.recordedAnswer(site, op) : NO_ANSWER;
  }

  /**
   * Starts the reads a record's recorded answer needs (qits-2144), each once: its provider site's
   * index, then the recorded response the index names. Called again as the index arrives.
   */
  private readAnswer(record: FreezeRecord): void {
    const site = untracked(() => this.siteOf(record.provider));
    if (!site) return;
    const index = untracked(() => this.contracts.indexRead(site));
    if (!index) {
      this.contracts.readIndex(site);
      return;
    }
    const op = index.status === 'loaded' ? recordedOperation(index.index, record) : null;
    if (op && !untracked(() => this.contracts.recordedAnswer(site, op))) {
      this.contracts.readRecording(site, op);
    }
  }

  /**
   * What "Selected data" shows (qits-2144): the read the picked mark resolves to (`recordFor`), its
   * cardinality and entities, the item, and the field's and derived paths' recorded values
   * (`itemIn`, `valueAt`), with the honest fallbacks while the read is ambiguous, unmarked or read.
   */
  protected readonly selectedData = computed((): SelectedData | null => {
    const selection = this.dataSelection();
    const freeze = this.freeze();
    if (selection?.kind !== 'mark' || !selection.picked || !freeze) return null;
    const mark = selection.picked;
    const read = recordFor(freeze, mark, this.answerOf);
    const record = read.kind === 'marked' || read.kind === 'byItem' ? read.record : null;
    const answer = record ? this.answerRead(record) : undefined;
    const body = answer?.status === 'loaded' ? answer.body : undefined;
    const object =
      body === undefined || body === null ? body : mark.item ? itemIn(body, mark) : body;
    const shown = (path: string): ShownValue => {
      if (record === null) {
        const text = read.kind === 'loading' ? 'Reading…' : 'no single recorded answer';
        return { path, text, found: false };
      }
      if (body === undefined) return { path, text: 'Reading…', found: false };
      if (body === null) return { path, text: 'no recorded answer', found: false };
      if (object === undefined) return { path, text: 'not in the recorded answer', found: false };
      return { path, ...valueAt(object, path) };
    };
    return {
      mark,
      read,
      record,
      cardinality: record ? this.cardinalityOf(record) : null,
      entities: record ? this.callEntities(record) : [],
      item: mark.item === null ? null : parseItem(mark.item),
      field: mark.field === null ? null : shown(mark.field),
      derived: mark.derived.map(shown),
    };
  });

  /**
   * The calls "Selected data" names (qits-2144): its pinned record, or every candidate of an
   * ambiguous read. Their rows are marked as selected.
   */
  private readonly selectedCalls = computed((): ReadonlySet<string> => {
    const data = this.selectedData();
    if (!data) return new Set();
    const records =
      data.read.kind === 'ambiguous' ? data.read.records : data.record ? [data.record] : [];
    return new Set(records.map(recordKey));
  });

  protected isSelectedCall(call: FreezeRecord): boolean {
    return this.selectedCalls().has(recordKey(call));
  }

  /** The words of an ambiguous read's candidate (qits-2144). */
  protected recordLabel(record: FreezeRecord): string {
    return `${record.operationId} · ${record.provider} · “${record.state}”`;
  }

  /**
   * The elements of `doc` the data selection highlights (qits-2144): every element carrying a mark
   * whose resolved source is the call's, or whose resolved mark is the selected one.
   */
  private dataElements(doc: Document, selection: DataSelection): readonly Element[] {
    return [...doc.querySelectorAll(MARKED)].filter((element) => {
      const mark = markOf(element);
      return selection.kind === 'call'
        ? mark.source === selection.source
        : sameMark(mark, selection.mark);
    });
  }

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const repo = this.repo();
      if (browser && repo) untracked(() => this.store.load(repo));
    });
    effect(() => {
      const bundle = this.loaded();
      const freeze = this.freeze();
      if (browser && bundle && freeze) {
        untracked(() => this.store.freeze(bundle, freeze.file));
      }
    });
    effect(() => {
      if (browser && this.loaded()) untracked(() => this.entityMaps.load());
    });
    effect(() => {
      // Another freeze is shown: its srcdoc load judges it again (qits-2072).
      this.shownFile();
      untracked(() => this.highlightNotice.set(null));
    });
    effect(() => {
      // Another freeze is selected (qits-2080): a highlight whose trigger it does not show goes.
      const triggers = this.shownTriggers();
      untracked(() => {
        const mark = this.highlightedOutcome()?.mark;
        if (triggers !== null && mark !== undefined && !triggers.includes(mark)) {
          this.highlighted.set(null);
        }
      });
    });
    effect(() => {
      // Another freeze is selected (qits-2144): data it does not mark is no longer selected.
      const marks = this.freezeMarks();
      untracked(() => {
        const selection = this.dataSelection();
        const kept =
          selection === null ||
          (selection.kind === 'call'
            ? marks.some((mark) => mark.source === selection.source)
            : marks.some((mark) => sameMark(mark, selection.mark)));
        if (!kept) this.dataSelection.set(null);
      });
    });
    effect(() => {
      // Picked data (qits-2144): read the answers that decide its read, once the sites are known.
      const selection = this.dataSelection();
      const freeze = this.freeze();
      if (!browser || selection?.kind !== 'mark' || !selection.picked || !freeze) return;
      if (this.entityMaps.catalog()?.status !== 'loaded') return;
      const records = this.answerCandidates(freeze, selection.picked);
      // Tracks each index read, so the recorded response is asked for once the index names it.
      records.forEach((record) => {
        const site = this.siteOf(record.provider);
        if (site) this.contracts.indexRead(site);
      });
      untracked(() => records.forEach((record) => this.readAnswer(record)));
    });
    effect(() => {
      // A selected call in the collapsed app-wide group opens it (qits-2144).
      const selected = this.selectedCalls();
      const appWide = this.calls().appWide;
      if (appWide.some((call) => selected.has(recordKey(call)))) {
        untracked(() => this.appWideOpen.set(true));
      }
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
  }

  /** The open project's repositories, once read. */
  private repositoryList() {
    return this.repositories.hasValue() ? this.repositories.value() : undefined;
  }

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryList());
  }

  /**
   * Selects the route at `fullPath` on its first state (its first DATA state when it has one), as a
   * new entry in the history; the viewport stays (qits-2047). It clears the highlighted outcome
   * (qits-2006) and the selected data (qits-2144).
   */
  protected select(fullPath: string): Promise<boolean> {
    this.linkNotice.set(null);
    this.highlighted.set(null);
    this.dataSelection.set(null);
    this.drawHighlight();
    return this.navigate({ route: fullPath, state: null });
  }

  /** Selects the route's state named `name`. */
  protected pickState(name: string): void {
    this.linkNotice.set(null);
    void this.navigate({ state: name });
  }

  /**
   * Draws the selected state in `scheme` (qits-2086), from now on whatever the app's own scheme is.
   * Not in the URL: the scheme is how the page is looked at, not what is selected.
   */
  protected pickScheme(scheme: FreezeColorScheme): void {
    this.linkNotice.set(null);
    this.pickedScheme.set(scheme);
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
   * own, qits-2047), and the frame's load draws the highlight, never the document still shown
   * (qits-2072); with none, nothing switches (the row's gap chip says why).
   */
  protected toggleOutcome(outcome: JoinedOutcome): void {
    this.linkNotice.set(null);
    this.dataSelection.set(null);
    this.highlighted.set(this.highlighted() === outcome.key ? null : outcome.key);
    if (this.highlighted() !== null) {
      const shown = this.freeze()?.file;
      const triggers = outcome.triggerFreezes;
      if (triggers.length && !triggers.some((freeze) => freeze.file === shown)) {
        const viewport = this.viewport();
        const scheme = this.scheme();
        const atWidth = triggers.filter((freeze) => (freeze.viewport ?? viewport) === viewport);
        const here =
          atWidth.find((freeze) => (freeze.colorScheme ?? scheme) === scheme) ?? atWidth[0];
        this.showFreeze(here ?? triggers[0], true);
        return;
      }
    }
    this.drawHighlight();
  }

  /**
   * Shows the trigger of a source in the Outcomes tab (qits-2049), or clears its highlight when it
   * is the highlighted one already. Of the freezes in its scope that show the trigger, the shown one
   * is kept (qits-2072); else the one whose route is nearest `target` (the route the row is about;
   * the selected route for an outcome without a fixed target) is shown, the selected route's and
   * then one at the chosen viewport first among equals; with none, its declaring route is selected
   * when a route row answers it (a page, a layout that is one, or the row a route rendering nothing
   * folds into, qits-2076), else the route stays. The
   * highlight is set as `toggleOutcome` sets it: drawn now when the shown freeze stays, else by the
   * frame's load once the freeze is in (qits-2072). The tab stays open.
   */
  protected pickSource(outcome: JoinedOutcome, target: string | null): void {
    const bundle = this.loaded();
    if (!bundle) return;
    this.linkNotice.set(null);
    if (this.highlighted() === outcome.key) {
      this.highlighted.set(null);
      this.drawHighlight();
      return;
    }
    const selected = this.selectedPath();
    const near = target ?? selected;
    const viewport = this.viewport();
    const scheme = this.scheme();
    const shown = this.freeze()?.file;
    const freeze = [...joinedOutcome(bundle.manifest, outcome.declared, selected).triggerFreezes]
      .map((candidate, order) => ({ candidate, order }))
      .sort(
        (a, b) =>
          Number(b.candidate.file === shown) - Number(a.candidate.file === shown) ||
          shared(b.candidate.route, near) - shared(a.candidate.route, near) ||
          Number(b.candidate.route === near) - Number(a.candidate.route === near) ||
          Number((b.candidate.viewport ?? viewport) === viewport) -
            Number((a.candidate.viewport ?? viewport) === viewport) ||
          Number((b.candidate.colorScheme ?? scheme) === scheme) -
            Number((a.candidate.colorScheme ?? scheme) === scheme) ||
          a.order - b.order,
      )[0]?.candidate;
    this.dataSelection.set(null);
    if (freeze) {
      this.highlighted.set(outcome.key);
      if (freeze.file !== shown) this.showFreeze(freeze, true);
      else this.drawHighlight();
      return;
    }
    const declaring = outcome.declared.route;
    const row = declaring === null ? undefined : answeringRow(this.rows(), declaring);
    const selecting = row !== undefined && row.fullPath !== selected;
    if (selecting) {
      this.unfold(row.fullPath);
      void this.select(row.fullPath);
    }
    this.highlighted.set(outcome.key);
    if (!selecting) this.drawHighlight();
  }

  /**
   * Once the frame's document is in: holds its links (`holdLinks`), and draws the highlighted
   * outcome again (qits-2006), since every state switch loads a new `srcdoc`. A frame drawn anew
   * loads its initial `about:blank` first, before its `srcdoc` is set (Chromium fires that load on
   * insertion); that document is no freeze's, so nothing is drawn or judged in it (qits-2072).
   */
  protected frameLoaded(event: Event): void {
    this.holdLinks(event);
    this.frame = event.target as HTMLIFrameElement;
    this.drawHighlight();
  }

  /**
   * This page's `--color-accent` as the theme resolves it now (qits-2086), the highlight's fallback
   * for a freeze whose CSS does not define the token; empty without the theme.
   */
  private hostAccent(): string {
    const root = this.host.nativeElement.ownerDocument.documentElement;
    return getComputedStyle(root).getPropertyValue('--color-accent').trim();
  }

  /** The frame's document when it is the shown freeze's (an `about:srcdoc` one, qits-2072). */
  private frameDocument(): Document | null {
    const doc = this.frame?.contentDocument;
    return doc?.URL === 'about:srcdoc' ? doc : null;
  }

  /**
   * Draws the highlighted outcome into the frame's document (qits-2006): every earlier mark
   * cleared, then one `<style data-qits-builder>` in its head, and the attribute `HIGHLIGHT` on the
   * first element whose `data-qits-outcome` holds the word `<interaction>:<outcome>`, scrolled to
   * the middle of the frame. Only the frame's own document scrolls, never `scrollIntoView`, which
   * scrolls this page's scroll containers too (qits-2072). The frame is same-origin
   * (`allow-same-origin`), as for `holdLinks`; this page writes into it, and nothing runs inside.
   * Every draw judges `highlightNotice` anew (qits-2072): a freeze that lists the trigger while its
   * document has no such element says so above the frame; any other draw clears it.
   *
   * The selected data (qits-2144) is drawn the same way, the one selection with the outcome: every
   * element `dataElements` finds carries the attribute, the first one centred; a frame with none
   * says so on the same line.
   */
  private drawHighlight(): void {
    const doc = this.frameDocument();
    if (!doc) return;
    for (const marked of doc.querySelectorAll(`[${HIGHLIGHT}]`)) marked.removeAttribute(HIGHLIGHT);
    const outcome = this.highlightedOutcome();
    const data = this.dataSelection();
    if (!outcome && !data) {
      this.highlightNotice.set(null);
      return;
    }
    if (!doc.querySelector('style[data-qits-builder]')) {
      const style = doc.createElement('style');
      style.setAttribute('data-qits-builder', '');
      style.textContent = highlightCss(this.hostAccent());
      (doc.head ?? doc.documentElement).append(style);
    }
    if (data) {
      const elements = this.dataElements(doc, data);
      for (const element of elements) element.setAttribute(HIGHLIGHT, '');
      if (elements.length) centre(doc, elements[0]);
      this.highlightNotice.set(
        elements.length ? null : 'This screenshot has no element for the selected data.',
      );
      return;
    }
    if (!outcome) return;
    const element = doc.querySelector(`[data-qits-outcome~="${quoted(outcome.mark)}"]`);
    if (element) {
      element.setAttribute(HIGHLIGHT, '');
      centre(doc, element);
    }
    this.highlightNotice.set(
      !element && (this.freeze()?.triggers ?? []).includes(outcome.mark)
        ? `This screenshot has no element for ${outcome.mark}.`
        : null,
    );
  }

  /**
   * Turns link clicks inside the frame into click-through between routes (qits-1949), once its
   * document is in. Every click on a link is cancelled, so the frame never navigates; its written
   * `href` (never `anchor.href`, resolved against this page) goes through `matchRoute`. A route of
   * the app is selected as a tree click would, and its row scrolled into view; a link outside the
   * app or to no route of it leaves the route as it is and says so above the frame (`linkNotice`); a
   * fragment does nothing. The frame is same-origin (`allow-same-origin`), so this page can reach
   * its document; the listener is this page's, the frame runs nothing of its own.
   *
   * While Pick data is on (qits-2144), a click selects data instead: it is cancelled, follows no
   * link, and picks the nearest element carrying a mark of its own (`MARKED`, the element itself
   * first); a click on no marked element says so above the frame.
   */
  protected holdLinks(event: Event): void {
    const frame = event.target as HTMLIFrameElement;
    frame.contentDocument?.addEventListener('click', (click) => {
      if (this.pickActive()) {
        click.preventDefault();
        const marked = (click.target as Element | null)?.closest?.(MARKED);
        if (marked) this.pickElement(marked);
        else this.linkNotice.set('No data marked here: design copy, as far as the builder knows.');
        return;
      }
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
