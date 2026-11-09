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
}

/** One call a freeze's test answered with a recording: which provider, operation and state. */
export interface FreezeRecord {
  readonly provider: string;
  readonly state: string;
  readonly operationId: string;
}

/** One frozen screenshot: its HTML file in the bundle, its name, its route and its calls. */
export interface Freeze {
  /** The path of its HTML in the bundle. */
  readonly file: string;
  readonly name: string;
  /** The route pattern it was shot on; null for a shot outside a page spec. */
  readonly route: string | null;
  readonly records: readonly FreezeRecord[];
}

/** The bundle's `manifest.json`: the route tree, every freeze, and the freezes of each route. */
export interface RoutesManifest {
  readonly routes: readonly ManifestRoute[];
  readonly freezes: readonly Freeze[];
  /** Each route's full path, mapped to the files of its freezes. */
  readonly byRoute: Readonly<Record<string, readonly string[]>>;
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

/**
 * `value` as a manifest when it has the manifest's shape (the fields above; others are ignored),
 * else null. The bundle is read as JSON, not through a schema, so this is the only check it gets.
 */
export function asManifest(value: unknown): RoutesManifest | null {
  if (!isObject(value)) return null;
  const { routes, freezes, byRoute } = value;
  if (!Array.isArray(routes) || !routes.every(isRoute)) return null;
  if (!Array.isArray(freezes) || !freezes.every(isFreeze)) return null;
  if (
    !isObject(byRoute) ||
    !Object.values(byRoute).every((files) => Array.isArray(files) && files.every(isString))
  ) {
    return null;
  }
  return { routes, freezes, byRoute: byRoute as RoutesManifest['byRoute'] };
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
  /** How many freezes the route has (`byRoute[fullPath].length`, 0 when absent). */
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

  const rows: TreeRow[] = [];
  const walk = (node: Node, depth: number) => {
    const states = manifest.byRoute[node.fullPath]?.length ?? 0;
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

/**
 * The freezes of the route at `fullPath`, sorted by name. A file `byRoute` names that the freeze
 * list does not is shown by its file name, with no calls.
 */
export function routeFreezes(manifest: RoutesManifest, fullPath: string): readonly Freeze[] {
  const byFile = new Map(manifest.freezes.map((freeze) => [freeze.file, freeze]));
  return (manifest.byRoute[fullPath] ?? [])
    .map(
      (file): Freeze =>
        byFile.get(file) ?? {
          file,
          name: (file.split('/').pop() ?? file).replace(/\.html$/, ''),
          route: fullPath,
          records: [],
        },
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
