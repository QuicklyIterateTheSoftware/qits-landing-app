/**
 * A frontend's frozen routes (qits-1947, published as the docs site `@routes/<app>` by qits-1948):
 * the `manifest.json` of the bundle, read as file content, and the pure functions the UI builder
 * (qits-1951) draws from it. The manifest is a file the release publishes, not an API answer, so
 * its type lives here and {@link asManifest} checks its shape at run time.
 */

/** One route of the app's route tree, as `describeRoutes` wrote it. */
export interface ManifestRoute {
  /** The route's own path (`projects/:slug/work`, `''`, `**`). */
  readonly path: string;
  /** Its full path: its parents' paths joined, `''` skipped. */
  readonly fullPath: string;
  readonly redirectTo?: string;
  readonly children?: readonly ManifestRoute[];
  /**
   * Whether the route is an entry point (qits-2049): entered from outside the app (an idp's
   * redirect, an address another frontend links, a bookmark), declared with the route's
   * `data: { qitsEntry: true }`, so it needs no outcome leading to it. Absent in a bundle older
   * than entry points, and on every other route.
   */
  readonly entry?: boolean;
}

/** One call a freeze's test answered with a recording: which provider, operation and state. */
export interface FreezeRecord {
  readonly provider: string;
  readonly state: string;
  readonly operationId: string;
}

/**
 * The state a shot says it shows (qits-2046; `FreezeKind` in `@qits/angular/screenshots`, written
 * out here because that entry is the build plugin's and pulls in vite's types).
 */
export type FreezeKind = 'DATA' | 'NO_DATA' | 'PENDING' | 'ERROR';

/** A preset width a shot was taken at (qits-2046; `FreezeViewport` in `@qits/angular/screenshots`). */
export type FreezeViewport = 'PHONE' | 'TABLET' | 'DESKTOP';

/** The kinds in the order the builder shows a route's states (qits-2047): data first. */
export const FREEZE_KINDS: readonly FreezeKind[] = ['DATA', 'NO_DATA', 'PENDING', 'ERROR'];

/** The preset widths, narrowest first, as the library shoots them. */
export const FREEZE_VIEWPORTS: readonly FreezeViewport[] = ['PHONE', 'TABLET', 'DESKTOP'];

/** The window each preset width was shot in, in CSS px (`viewportSpecs` of `@qits/angular`). */
export const VIEWPORT_SIZES: Readonly<
  Record<FreezeViewport, { readonly width: number; readonly height: number }>
> = {
  PHONE: { width: 390, height: 844 },
  TABLET: { width: 1024, height: 768 },
  DESKTOP: { width: 1440, height: 900 },
};

/** One frozen screenshot: its HTML file in the bundle, its name, its route and its calls. */
export interface Freeze {
  /** The path of its HTML in the bundle. */
  readonly file: string;
  readonly name: string;
  /** The route pattern it was shot on; null for a shot outside a page spec. */
  readonly route: string | null;
  readonly records: readonly FreezeRecord[];
  /**
   * The outcomes whose trigger the shot shows (`<interaction>:<outcome>`, qits-2006): the
   * `data-qits-outcome` marks that were visible when it was shot, not every mark its HTML holds (a
   * closed menu's are serialized too). Absent in a bundle older than outcomes; read it as `[]`.
   */
  readonly triggers?: readonly string[];
  /**
   * The state the shot says it shows (qits-2046), null when it gave none or one this app does not
   * know. Absent in a bundle older than the field.
   */
  readonly kind?: FreezeKind | null;
  /**
   * The preset width it was shot at (qits-2046), null at the test's own viewport or for a width this
   * app does not know. Absent in a bundle older than the field. A route spec's shot is three
   * freezes of one `name`, one per width.
   */
  readonly viewport?: FreezeViewport | null;
}

/**
 * What an outcome does (qits-2006): `exit` leaves for another route (`to`), `stay` keeps the page
 * and shows its result (a refusal, a saved form). From qits-2044 on also `returnTo`, which goes back
 * to the page the interaction started from (a URL known only at run time, so no `to`), and
 * `external`, which leaves the app for the site `to` names (`idp`). Neither has a route target.
 */
export type OutcomeKind = 'exit' | 'stay' | 'returnTo' | 'external';

/** The package whose own declarations an app's manifest carries (qits-2044): `file` starts with it. */
const LIBRARY_PREFIX = '@qits/angular/';

/**
 * One outcome the app declares (qits-2006, from `@qits/angular`'s `screenshots/outcomes.mjs`). Its
 * scope: `global: false` is a page, for exactly `route`; `global: true` with a `route` is a layout,
 * for that route and its subtree; `route: null` (always global) is app-wide. The root is `''`.
 */
export interface DeclaredOutcome {
  readonly route: string | null;
  readonly interaction: string;
  readonly outcome: string;
  readonly kind: OutcomeKind;
  /**
   * The route pattern given to `exit(...)`, as written, no leading slash; the site an `external(...)`
   * leaves for (`idp`); null for a stay or a return.
   */
  readonly to: string | null;
  readonly global: boolean;
  /**
   * Whether an element on the page triggers it (qits-2044): `false` for one declared with
   * `{ triggered: false }` (a guard, a callback's result), which no screenshot is asked to show.
   * Absent in a bundle older than the option; read it as `true`.
   */
  readonly triggered?: boolean;
  /**
   * The source file that declares it: the app's own (`src/app/…`), or the library's, under
   * `@qits/angular/` (qits-2044), which the app imports and does not hold.
   */
  readonly file: string;
}

/** One outcome a test fired (qits-2006): in which spec and test, on which route, and its shot. */
export interface FiredOutcome {
  readonly spec: string;
  readonly test: string;
  /** The route pattern at fire time; null for the root route or a spec outside the route specs. */
  readonly route: string | null;
  readonly interaction: string;
  readonly outcome: string;
  readonly kind: OutcomeKind;
  /** The first freeze shot after the fire in the same test (a `freezes[].file`), or null. */
  readonly freeze: string | null;
}

/** The manifest's `outcomes` (qits-2006): what the app declares and what its tests fired. */
export interface ManifestOutcomes {
  readonly declared: readonly DeclaredOutcome[];
  readonly fired: readonly FiredOutcome[];
}

/** The bundle's `manifest.json`: the route tree, every freeze, and the freezes of each route. */
export interface RoutesManifest {
  readonly routes: readonly ManifestRoute[];
  readonly freezes: readonly Freeze[];
  /** Each route's full path, mapped to the files of its freezes. */
  readonly byRoute: Readonly<Record<string, readonly string[]>>;
  /**
   * The app's outcomes (qits-2006). Absent in a bundle frozen before outcomes were recorded;
   * `invalid` when the section (or a freeze's `triggers`) does not have its shape, which leaves the
   * routes readable.
   */
  readonly outcomes?: ManifestOutcomes | 'invalid';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

function isRoute(value: unknown): value is ManifestRoute {
  return (
    isObject(value) &&
    isString(value['path']) &&
    isString(value['fullPath']) &&
    (value['redirectTo'] === undefined || isString(value['redirectTo'])) &&
    (value['entry'] === undefined || typeof value['entry'] === 'boolean') &&
    (value['children'] === undefined ||
      (Array.isArray(value['children']) && value['children'].every(isRoute)))
  );
}

const isRecord = (value: unknown): value is FreezeRecord =>
  isObject(value) &&
  isString(value['provider']) &&
  isString(value['state']) &&
  isString(value['operationId']);

const isFreeze = (value: unknown): value is Freeze =>
  isObject(value) &&
  isString(value['file']) &&
  isString(value['name']) &&
  (value['route'] === null || isString(value['route'])) &&
  Array.isArray(value['records']) &&
  value['records'].every(isRecord);

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || isString(value);

const isStrings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isString);

const KINDS: readonly unknown[] = ['exit', 'stay', 'returnTo', 'external'] satisfies OutcomeKind[];

const isKind = (value: unknown): value is OutcomeKind => KINDS.includes(value);

const isDeclared = (value: unknown): value is DeclaredOutcome =>
  isObject(value) &&
  isStringOrNull(value['route']) &&
  isString(value['interaction']) &&
  isString(value['outcome']) &&
  isKind(value['kind']) &&
  isStringOrNull(value['to']) &&
  typeof value['global'] === 'boolean' &&
  (value['triggered'] === undefined || typeof value['triggered'] === 'boolean') &&
  isString(value['file']);

const isFired = (value: unknown): value is FiredOutcome =>
  isObject(value) &&
  isString(value['spec']) &&
  isString(value['test']) &&
  isStringOrNull(value['route']) &&
  isString(value['interaction']) &&
  isString(value['outcome']) &&
  isKind(value['kind']) &&
  isStringOrNull(value['freeze']);

/** `value` when it is one of `values`, else null: an unknown kind or width never fails the bundle. */
const known = <T>(values: readonly T[], value: unknown): T | null =>
  values.includes(value as T) ? (value as T) : null;

/**
 * Whether a freeze's `kind` and `viewport` (qits-2046) are absent, null or known: what
 * {@link asManifest} keeps as it is.
 */
function hasKnownShape(freeze: Freeze): boolean {
  const { kind, viewport } = freeze as { kind?: unknown; viewport?: unknown };
  return (
    (kind === undefined || known(FREEZE_KINDS, kind) === kind) &&
    (viewport === undefined || known(FREEZE_VIEWPORTS, viewport) === viewport)
  );
}

/** `freeze` with an unknown `kind` or `viewport` read as null; an absent one stays absent. */
function withKnownShape(freeze: Freeze): Freeze {
  if (hasKnownShape(freeze)) return freeze;
  const { kind, viewport } = freeze as { kind?: unknown; viewport?: unknown };
  return {
    ...freeze,
    ...(kind === undefined ? {} : { kind: known(FREEZE_KINDS, kind) }),
    ...(viewport === undefined ? {} : { viewport: known(FREEZE_VIEWPORTS, viewport) }),
  };
}

/** The `outcomes` section as read (qits-2006): absent, `invalid`, or with its shape. */
function readOutcomes(value: unknown): ManifestOutcomes | 'invalid' | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return 'invalid';
  const { declared, fired } = value;
  if (!Array.isArray(declared) || !declared.every(isDeclared)) return 'invalid';
  if (!Array.isArray(fired) || !fired.every(isFired)) return 'invalid';
  return { declared, fired };
}

/**
 * `value` as a manifest when it has the manifest's shape (the fields above; others are ignored),
 * else null. The bundle is read as JSON, not through a schema, so this is the only check it gets.
 *
 * The outcomes (qits-2006) never fail the manifest: a freeze without `triggers` is an older bundle's
 * and valid, and a malformed `outcomes` section or `triggers` list reads as `outcomes: 'invalid'`
 * (the malformed `triggers` dropped), so the routes still show.
 *
 * Neither do a freeze's `kind` and `viewport` (qits-2046): absent is an older bundle's, and a value
 * this app does not know reads as null.
 */
export function asManifest(value: unknown): RoutesManifest | null {
  if (!isObject(value)) return null;
  const { routes, freezes: listed, byRoute } = value;
  if (!Array.isArray(routes) || !routes.every(isRoute)) return null;
  if (!Array.isArray(listed) || !listed.every(isFreeze)) return null;
  let freezes: readonly Freeze[] = listed.every(hasKnownShape)
    ? listed
    : listed.map(withKnownShape);
  if (
    !isObject(byRoute) ||
    !Object.values(byRoute).every((files) => Array.isArray(files) && files.every(isString))
  ) {
    return null;
  }
  let outcomes = readOutcomes(value['outcomes']);
  if (!freezes.every((freeze) => freeze.triggers === undefined || isStrings(freeze.triggers))) {
    outcomes = 'invalid';
    freezes = freezes.map(({ triggers: _dropped, ...freeze }) => freeze);
  }
  return {
    routes,
    freezes,
    byRoute: byRoute as RoutesManifest['byRoute'],
    ...(outcomes === undefined ? {} : { outcomes }),
  };
}

/**
 * What a tree row is: a route that can be shown, a redirect, the wildcard (`**`), or a path
 * segment no route sits at (an intermediate directory).
 */
export type TreeRowKind = 'route' | 'redirect' | 'wildcard' | 'segment';

/** One row of the route tree, in tree order. */
export interface TreeRow {
  /** Its last path segment; `/` for the root. */
  readonly segment: string;
  /** The full path it stands for (`''` for the root). */
  readonly fullPath: string;
  /** 0 for the root. */
  readonly depth: number;
  readonly kind: TreeRowKind;
  /** Where a redirect goes. */
  readonly redirectTo?: string;
  /**
   * How many states the route has: its freezes by name ({@link routeStates}), so a shot at three
   * widths counts once; 0 when `byRoute` has none.
   */
  readonly states: number;
}

interface Node {
  readonly segment: string;
  readonly fullPath: string;
  /** Every route at this full path, with whether it is a layout (has children). */
  readonly routes: { readonly route: ManifestRoute; readonly layout: boolean }[];
  readonly children: Node[];
}

/**
 * The manifest's routes as a tree of path segments, flattened in tree order (the manifest's order,
 * depth first). Routes that share a full path (a layout and its `''` child) are one row, and the
 * child decides what it is: the layout `projects/:slug/work` with a `''` child redirecting to
 * `in-progress` is a redirect. A segment no route sits at (`projects/:slug`'s `work/detail`) is a
 * row of kind `segment`. `**` is a `wildcard` row.
 */
export function routeTree(manifest: RoutesManifest): readonly TreeRow[] {
  const root: Node = { segment: '/', fullPath: '', routes: [], children: [] };
  const place = (route: ManifestRoute) => {
    let node = root;
    const segments = route.fullPath ? route.fullPath.split('/') : [];
    segments.forEach((segment, i) => {
      let child = node.children.find((c) => c.segment === segment);
      if (!child) {
        child = {
          segment,
          fullPath: segments.slice(0, i + 1).join('/'),
          routes: [],
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    });
    node.routes.push({ route, layout: !!route.children?.length });
    for (const child of route.children ?? []) place(child);
  };
  for (const route of manifest.routes) place(route);

  const byFile = freezesByFile(manifest);
  const rows: TreeRow[] = [];
  const walk = (node: Node, depth: number) => {
    const states = new Set(freezesOf(manifest, byFile, node.fullPath).map((freeze) => freeze.name))
      .size;
    const shown = node.routes.find((r) => !r.layout)?.route ?? node.routes[0]?.route;
    if (!shown)
      rows.push({ segment: node.segment, fullPath: node.fullPath, depth, kind: 'segment', states });
    else if (node.segment === '**') {
      rows.push({
        segment: node.segment,
        fullPath: node.fullPath,
        depth,
        kind: 'wildcard',
        states,
      });
    } else if (shown.redirectTo !== undefined) {
      rows.push({
        segment: node.segment,
        fullPath: node.fullPath,
        depth,
        kind: 'redirect',
        redirectTo: shown.redirectTo,
        states,
      });
    } else {
      rows.push({ segment: node.segment, fullPath: node.fullPath, depth, kind: 'route', states });
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return rows;
}

/** The route the builder opens on: the first route in tree order with states, else the first route. */
export function initialRoute(rows: readonly TreeRow[]): string | null {
  const routes = rows.filter((row) => row.kind === 'route');
  return (routes.find((row) => row.states > 0) ?? routes[0])?.fullPath ?? null;
}

const freezesByFile = (manifest: RoutesManifest): ReadonlyMap<string, Freeze> =>
  new Map(manifest.freezes.map((freeze) => [freeze.file, freeze]));

/** The freezes `byRoute` names for `fullPath`, in its order; see {@link routeFreezes}. */
function freezesOf(
  manifest: RoutesManifest,
  byFile: ReadonlyMap<string, Freeze>,
  fullPath: string,
): Freeze[] {
  return (manifest.byRoute[fullPath] ?? []).map(
    (file): Freeze =>
      byFile.get(file) ?? {
        file,
        name: (file.split('/').pop() ?? file).replace(/\.html$/, ''),
        route: fullPath,
        records: [],
      },
  );
}

/**
 * The freezes of the route at `fullPath`, sorted by name. A file `byRoute` names that the freeze
 * list does not is shown by its file name, with no calls.
 */
export function routeFreezes(manifest: RoutesManifest, fullPath: string): readonly Freeze[] {
  return freezesOf(manifest, freezesByFile(manifest), fullPath).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * One state of a route (qits-2047): its freezes sharing one `name`, one per width a route spec
 * shot it at (qits-2046), or the one freeze of a shot at the test's own viewport.
 */
export interface FreezeState {
  readonly name: string;
  /** The first kind its freezes give; null when none gives one. */
  readonly kind: FreezeKind | null;
  /** Its freezes, in the route's order (`byRoute`'s). */
  readonly freezes: readonly Freeze[];
}

/** Where a kind sorts: {@link FREEZE_KINDS}' order, a state without one last. */
const kindRank = (kind: FreezeKind | null) =>
  kind === null ? FREEZE_KINDS.length : FREEZE_KINDS.indexOf(kind);

/**
 * The states of the route at `fullPath` (qits-2047): its freezes ({@link routeFreezes}) grouped by
 * name, sorted by kind (DATA, NO_DATA, PENDING, ERROR, then the states without one) and by name
 * within a kind. A bundle without kinds keeps the order by name.
 */
export function routeStates(manifest: RoutesManifest, fullPath: string): readonly FreezeState[] {
  const byName = new Map<string, Freeze[]>();
  for (const freeze of routeFreezes(manifest, fullPath)) {
    const group = byName.get(freeze.name) ?? [];
    group.push(freeze);
    byName.set(freeze.name, group);
  }
  return [...byName.entries()]
    .map(([name, freezes]): FreezeState => ({
      name,
      kind: freezes.find((freeze) => freeze.kind)?.kind ?? null,
      freezes,
    }))
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name));
}

/**
 * The freeze `state` draws at `viewport` (qits-2047): the one shot at that width, else the one shot
 * at the test's own viewport, else the DESKTOP one, else its first.
 */
export function stateFreeze(state: FreezeState, viewport: FreezeViewport): Freeze {
  const at = (width: FreezeViewport | null) =>
    state.freezes.find((freeze) => (freeze.viewport ?? null) === width);
  return at(viewport) ?? at(null) ?? at('DESKTOP') ?? state.freezes[0];
}

/** Whether any freeze of the bundle was shot at a preset width (qits-2047). */
export const hasViewports = (manifest: RoutesManifest): boolean =>
  manifest.freezes.some((freeze) => !!freeze.viewport);

/**
 * Every call the route's freezes answered, once each, sorted by provider, operationId and state.
 */
export function routeCalls(manifest: RoutesManifest, fullPath: string): readonly FreezeRecord[] {
  const calls = new Map<string, FreezeRecord>();
  for (const freeze of routeFreezes(manifest, fullPath)) {
    for (const record of freeze.records) {
      const { provider, operationId, state } = record;
      calls.set(JSON.stringify([provider, operationId, state]), { provider, operationId, state });
    }
  }
  return [...calls.values()].sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.operationId.localeCompare(b.operationId) ||
      a.state.localeCompare(b.state),
  );
}

/**
 * Where a link in a freeze leads (qits-1949): a route of the tree (`fullPath` as {@link routeTree}
 * has it, a redirect already followed), outside the app (another origin or scheme), nowhere in the
 * app (`path` matches no route, or only `**`), or the page it is on (a fragment or a query alone).
 */
export type LinkTarget =
  | { readonly kind: 'route'; readonly fullPath: string }
  | { readonly kind: 'outside' }
  | { readonly kind: 'unmatched'; readonly path: string }
  | { readonly kind: 'fragment' };

/** How many redirects {@link matchRoute} follows before it gives up on a loop. */
const MAX_REDIRECTS = 5;

/** A route a path ends on, the values its `:params` took, and the full path of its parent. */
interface Match {
  readonly route: ManifestRoute;
  readonly params: Readonly<Record<string, string>>;
  readonly parent: string;
}

const segmentsOf = (fullPath: string) => fullPath.split('/').filter((segment) => segment !== '');

/**
 * Binds `pattern`'s segments to the start of `path`'s: a literal matches itself, `:name` any one
 * segment, `**` the rest. The params and how many segments were consumed, or null.
 */
function bind(
  pattern: readonly string[],
  path: readonly string[],
): { params: Record<string, string>; consumed: number } | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const segment = pattern[i];
    if (segment === '**') return { params, consumed: path.length };
    if (i >= path.length) return null;
    if (segment.startsWith(':')) params[segment.slice(1)] = path[i];
    else if (segment !== path[i]) return null;
  }
  return { params, consumed: pattern.length };
}

/**
 * The first route `path` ends on, in Angular's order: config order, depth first. A layout takes
 * the path when its full path is a prefix and one of its children takes the whole of it; any other
 * route must take the whole path.
 */
function firstMatch(
  routes: readonly ManifestRoute[],
  path: readonly string[],
  parent: string,
): Match | null {
  for (const route of routes) {
    const bound = bind(segmentsOf(route.fullPath), path);
    if (!bound) continue;
    if (route.children?.length) {
      const inner = firstMatch(route.children, path, route.fullPath);
      if (inner) return { ...inner, params: { ...bound.params, ...inner.params } };
    } else if (bound.consumed === path.length) {
      return { route, params: bound.params, parent };
    }
  }
  return null;
}

/** `segment` decoded, or as it is when it is not valid percent-encoding. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Where the link `href` leads in the app `manifest` describes. `href` is the attribute as written
 * (`getAttribute('href')`), never the resolved `anchor.href`: a `srcdoc` frame resolves against the
 * builder's own URL. A scheme or `//` is `outside`; a fragment or a query alone (or nothing) stays
 * on the page, `fragment`. Otherwise the query and fragment are dropped, the path split on `/` and
 * each segment decoded, and the routes walked as Angular walks them (`firstMatch`); a path without
 * a leading `/` is read from the root, as the app writes every link absolute.
 *
 * A redirect is followed: an absolute `redirectTo` (`/…`) from the root, any other from the full
 * path of the redirecting route's parent (the `''` child of `projects/:slug/work` goes to
 * `projects/:slug/work/in-progress`), its `:params` replaced by the values the link gave them, and
 * the result matched again, up to {@link MAX_REDIRECTS} times. Matching `**`, nothing, or too many
 * redirects is `unmatched`.
 */
export function matchRoute(manifest: RoutesManifest, href: string): LinkTarget {
  const raw = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { kind: 'outside' };
  const pathPart = raw.replace(/[?#].*$/s, '');
  if (pathPart === '') return { kind: 'fragment' };
  let path = segmentsOf(pathPart).map(decoded);
  const shown = `/${path.join('/')}`;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const match = firstMatch(manifest.routes, path, '');
    if (!match || segmentsOf(match.route.fullPath).includes('**')) {
      return { kind: 'unmatched', path: shown };
    }
    const redirectTo = match.route.redirectTo;
    if (redirectTo === undefined) return { kind: 'route', fullPath: match.route.fullPath };
    const target = redirectTo.startsWith('/') ? redirectTo : `${match.parent}/${redirectTo}`;
    path = segmentsOf(target).map((segment) =>
      segment.startsWith(':') ? (match.params[segment.slice(1)] ?? segment) : segment,
    );
  }
  return { kind: 'unmatched', path: shown };
}

/**
 * Whether the route pattern `route` (a fired record's or a freeze's; null for the root or outside the
 * route specs) is in the scope of the declared `entry` (qits-2006). Mirrors `inScope` in
 * `@qits/angular`'s `screenshots/outcomes.mjs` exactly: app-wide takes every route; a page its own
 * route, and the root page also null; a layout its route and the routes below it, and the root
 * layout every route and null.
 */
export function inOutcomeScope(
  entry: Pick<DeclaredOutcome, 'route' | 'global'>,
  route: string | null,
): boolean {
  if (entry.route === null) return true;
  if (!entry.global) return route === entry.route || (entry.route === '' && route === null);
  if (route === null) return entry.route === '';
  return entry.route === '' || route === entry.route || route.startsWith(`${entry.route}/`);
}

/** A test that fired an outcome (qits-2006). */
export interface OutcomeTest {
  readonly spec: string;
  readonly test: string;
}

/** A declared outcome joined with what the tests and the freezes show of it (qits-2006). */
export interface JoinedOutcome {
  /** Unique among the manifest's declarations: its scope, kind and `interaction:outcome`. */
  readonly key: string;
  /** `<interaction>:<outcome>`, the word its trigger's `data-qits-outcome` mark holds. */
  readonly mark: string;
  readonly declared: DeclaredOutcome;
  /** The tests that fired it in its scope, once each, in the manifest's order. */
  readonly reachedBy: readonly OutcomeTest[];
  /** For a stay, the freeze shot after the first fire that has one; else null. */
  readonly result: Freeze | null;
  /** The freezes in its scope whose `triggers` name it: the selected route's first, then by name. */
  readonly triggerFreezes: readonly Freeze[];
  /**
   * For an exit, where `to` leads (`matchRoute`, a redirect followed); null for a stay, a return and
   * an external, which lead to no route of the tree (their line is {@link outcomeLeads}).
   */
  readonly target: LinkTarget | null;
  /**
   * Whether a screenshot is asked to show its trigger: false for a `triggered: false` declaration
   * (qits-2044), which then has no "no screenshot shows its trigger" gap.
   */
  readonly triggered: boolean;
  /** Whether `@qits/angular` declares it (qits-2044): its `file` is the library's, not the app's. */
  readonly library: boolean;
}

/**
 * Where an outcome that has no route target leads, as a line (qits-2044): a return "returns to the
 * page it started from", an external "leaves the app for <to>". Null for an exit (its target says
 * it) and a stay (it stays).
 */
export function outcomeLeads(declared: Pick<DeclaredOutcome, 'kind' | 'to'>): string | null {
  if (declared.kind === 'returnTo') return 'returns to the page it started from';
  if (declared.kind === 'external') return `leaves the app for ${declared.to ?? 'another site'}`;
  return null;
}

/** `entry` joined with the manifest's fired records and freezes; `selected` sorts its freezes first. */
function joinOutcome(
  manifest: RoutesManifest,
  outcomes: ManifestOutcomes,
  entry: DeclaredOutcome,
  selected: string | null,
): JoinedOutcome {
  const mark = `${entry.interaction}:${entry.outcome}`;
  const fired = outcomes.fired.filter(
    (record) =>
      record.interaction === entry.interaction &&
      record.outcome === entry.outcome &&
      inOutcomeScope(entry, record.route),
  );
  const reachedBy = new Map<string, OutcomeTest>();
  for (const { spec, test } of fired) reachedBy.set(JSON.stringify([spec, test]), { spec, test });
  const byFile = new Map(manifest.freezes.map((freeze) => [freeze.file, freeze]));
  const shot = entry.kind === 'stay' ? fired.find((record) => record.freeze !== null) : undefined;
  const triggerFreezes = manifest.freezes
    .filter(
      (freeze) => inOutcomeScope(entry, freeze.route) && (freeze.triggers ?? []).includes(mark),
    )
    .sort(
      (a, b) =>
        Number(b.route === selected) - Number(a.route === selected) || a.name.localeCompare(b.name),
    );
  return {
    key: JSON.stringify([entry.route, entry.global, entry.kind, mark]),
    mark,
    declared: entry,
    reachedBy: [...reachedBy.values()],
    result: (shot?.freeze && byFile.get(shot.freeze)) || null,
    triggerFreezes,
    target:
      entry.kind !== 'exit'
        ? null
        : entry.to === null
          ? { kind: 'unmatched', path: '/' }
          : matchRoute(manifest, `/${entry.to.replace(/^\/+/, '')}`),
    triggered: entry.triggered !== false,
    library: entry.file.startsWith(LIBRARY_PREFIX),
  };
}

const byInteraction = (a: DeclaredOutcome, b: DeclaredOutcome) =>
  a.interaction.localeCompare(b.interaction) || a.outcome.localeCompare(b.outcome);

/** The manifest's outcomes when it has a readable section (qits-2006), else null. */
const outcomesOf = (manifest: RoutesManifest): ManifestOutcomes | null =>
  manifest.outcomes === undefined || manifest.outcomes === 'invalid' ? null : manifest.outcomes;

/**
 * The page outcomes (`global: false`) of the route at `fullPath`, sorted by interaction then
 * outcome, each joined with the tests that reach it, its result, the freezes that show its trigger
 * and its exit's target (qits-2006). None when the manifest has no readable outcomes.
 */
export function routeOutcomes(
  manifest: RoutesManifest,
  fullPath: string,
): readonly JoinedOutcome[] {
  const outcomes = outcomesOf(manifest);
  if (!outcomes) return [];
  return outcomes.declared
    .filter((entry) => !entry.global && entry.route === fullPath)
    .sort(byInteraction)
    .map((entry) => joinOutcome(manifest, outcomes, entry, fullPath));
}

/** A route's mark in the tree (qits-2045): its page outcomes, and how many of them are gaps. */
export interface OutcomeMark {
  readonly outcomes: number;
  /**
   * The outcomes no test reaches, or no freeze shows the trigger of; a `triggered: false` one
   * (qits-2044) is never a trigger gap.
   */
  readonly gaps: number;
}

/**
 * Each route's {@link OutcomeMark}, keyed by full path (qits-2045): its page outcomes as
 * `routeOutcomes` joins them, a gap being one no test reaches or no freeze shows. Shared outcomes are
 * not counted. Empty when the manifest has no readable outcomes.
 */
export function routeOutcomeMarks(manifest: RoutesManifest): ReadonlyMap<string, OutcomeMark> {
  const outcomes = outcomesOf(manifest);
  const marks = new Map<string, OutcomeMark>();
  if (!outcomes) return marks;
  for (const entry of outcomes.declared) {
    if (entry.global || entry.route === null || marks.has(entry.route)) continue;
    const joined = routeOutcomes(manifest, entry.route);
    marks.set(entry.route, {
      outcomes: joined.length,
      gaps: joined.filter(
        (o) => o.reachedBy.length === 0 || (o.triggered && o.triggerFreezes.length === 0),
      ).length,
    });
  }
  return marks;
}

/**
 * How far the app is in declaring outcomes (qits-2045): of the tree's `route` rows (`pages`), how
 * many have a page outcome (`declaring`).
 */
export function outcomeProgress(
  manifest: RoutesManifest,
  rows: readonly TreeRow[],
): { readonly declaring: number; readonly pages: number } {
  const marks = routeOutcomeMarks(manifest);
  const pages = rows.filter((row) => row.kind === 'route');
  return {
    declaring: pages.filter((row) => (marks.get(row.fullPath)?.outcomes ?? 0) > 0).length,
    pages: pages.length,
  };
}

/** The shared outcomes of one scope (qits-2006): app-wide (`route: null`) or a layout's route. */
export interface SharedOutcomeGroup {
  readonly route: string | null;
  readonly outcomes: readonly JoinedOutcome[];
}

/**
 * The shared outcomes (`global: true`: a layout's and app-wide), joined as `routeOutcomes` joins a
 * page's, grouped by scope: app-wide first, then each layout route by path, each sorted by
 * interaction then outcome (qits-2006). `selected` (the selected route) sorts its own freezes first
 * among each outcome's `triggerFreezes`. None when the manifest has no readable outcomes.
 */
export function sharedOutcomes(
  manifest: RoutesManifest,
  selected: string | null = null,
): readonly SharedOutcomeGroup[] {
  const outcomes = outcomesOf(manifest);
  if (!outcomes) return [];
  const groups = new Map<string | null, DeclaredOutcome[]>();
  for (const entry of outcomes.declared) {
    if (!entry.global) continue;
    const group = groups.get(entry.route) ?? [];
    group.push(entry);
    groups.set(entry.route, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([route, entries]) => ({
      route,
      outcomes: entries
        .sort(byInteraction)
        .map((entry) => joinOutcome(manifest, outcomes, entry, selected)),
    }));
}

/**
 * A declared outcome as {@link routeOutcomes} joins it (qits-2049): with the tests that reach it and
 * the freezes that show its trigger, `selected` sorting its own freezes first. What the Outcomes
 * tab's sources hand the highlight. A manifest without readable outcomes joins it with nothing.
 */
export function joinedOutcome(
  manifest: RoutesManifest,
  entry: DeclaredOutcome,
  selected: string | null = null,
): JoinedOutcome {
  return joinOutcome(
    manifest,
    outcomesOf(manifest) ?? { declared: [], fired: [] },
    entry,
    selected,
  );
}

/** One route the reachability check looks at (qits-2049), with the exits that lead to it. */
export interface InboundRoute {
  readonly fullPath: string;
  /** Whether it is an entry point (`data: { qitsEntry: true }`), which needs no inbound exit. */
  readonly entry: boolean;
  /** The declared exits whose `to` is its full path, from any scope, in the manifest's order. */
  readonly inbound: readonly DeclaredOutcome[];
}

/** Whether a route row is unreachable (qits-2049): no exit leads to it and it is no entry point. */
export const unreachable = (row: InboundRoute): boolean => !row.inbound.length && !row.entry;

/**
 * Every route the reachability check of `@qits/angular`'s `outcomeGaps` looks at, with the exits
 * that lead to it (qits-2049). The routes checked are the manifest's (its `children` walked) that
 * have no children, no redirect and a path other than `**`: a parent's `''` child stands for the
 * parent. An inbound exit is a declared outcome of kind `exit` whose `to` is the route's full path
 * exactly, declared on a page, a layout or app-wide (the library's too); a stay, a return and an
 * external add none. Routes sharing a full path are one row, an entry when any of them is. The
 * unreachable ones ({@link unreachable}) come first, then the rest, each in the manifest's order.
 * With no readable outcomes every row has no inbound exit.
 */
export function inboundExits(manifest: RoutesManifest): readonly InboundRoute[] {
  const declared = outcomesOf(manifest)?.declared ?? [];
  const entries = new Map<string, boolean>();
  const walk = (routes: readonly ManifestRoute[]) => {
    for (const route of routes) {
      if (route.children?.length) walk(route.children);
      else if (route.redirectTo === undefined && route.path !== '**') {
        entries.set(route.fullPath, (entries.get(route.fullPath) ?? false) || route.entry === true);
      }
    }
  };
  walk(manifest.routes);
  const rows = [...entries].map(([fullPath, entry]): InboundRoute => ({
    fullPath,
    entry,
    inbound: declared.filter((d) => d.kind === 'exit' && d.to === fullPath),
  }));
  return [...rows.filter(unreachable), ...rows.filter((row) => !unreachable(row))];
}

/**
 * The outcomes that leave without a fixed target (qits-2049): the declared `returnTo` and
 * `external` ones, which lead to no route of the tree, so no route counts them as inbound. In the
 * manifest's order; none without readable outcomes.
 */
export function unfixedOutcomes(manifest: RoutesManifest): readonly DeclaredOutcome[] {
  return (outcomesOf(manifest)?.declared ?? []).filter(
    (d) => d.kind === 'returnTo' || d.kind === 'external',
  );
}

/** A CSS `url(...)` with its quote and reference. */
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/g;

/** An `src="…"` attribute (an image a freeze kept as one of its assets). */
const SRC_ATTRIBUTE = /\bsrc=(["'])([^"']*)\1/g;

/** The bundle path (`assets/<file>`) a relative reference points at, or undefined. */
function assetOf(reference: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('/')) return undefined;
  const match = /(?:^|\/)(assets\/.+)$/.exec(reference);
  return match?.[1];
}

/**
 * `html` (a freeze) with every relative reference to the bundle's `assets/<file>` replaced by that
 * asset's `data:` URL from `assets` (keyed by `assets/<file>`). A freeze names its fonts relative
 * to itself (`url("../../…/assets/inter-latin-400-normal.woff2")`); in a `srcdoc` frame that
 * resolves against this app, and the store wants a bearer the frame never sends, so the bytes go
 * in by value. A reference to an asset not in `assets` is left as it is.
 */
export function inlineAssets(html: string, assets: Readonly<Record<string, string>>): string {
  return html
    .replace(CSS_URL, (whole, _quote: string, reference: string) => {
      const data = assets[assetOf(reference) ?? ''];
      return data ? `url("${data}")` : whole;
    })
    .replace(SRC_ATTRIBUTE, (whole, quote: string, reference: string) => {
      const data = assets[assetOf(reference) ?? ''];
      return data ? `src=${quote}${data}${quote}` : whole;
    });
}
