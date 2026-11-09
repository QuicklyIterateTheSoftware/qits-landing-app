import { routeFreezes, type RoutesManifest } from './routes-manifest';

/**
 * A service's entity map (qits-1945, published as `entities.json` in the docs site
 * `@contracts/<application>`), and the pure join the UI builder (qits-1950) draws from it and a
 * frontend's frozen routes: which domain entities each route touches, and which routes show each
 * entity. The map is a file the release publishes, not an API answer, so its type lives here and
 * {@link asEntityMap} checks its shape at run time.
 */

/** One operation that answers a DTO carrying the entity. `path` has no app root. */
export interface EntityOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
}

/**
 * One persisted entity. Only `domain` entities are shown; `technical` and `projection` ones are
 * counted and left out.
 */
export interface MappedEntity {
  /** Its fully qualified class name. */
  readonly entity: string;
  readonly marking: string;
  readonly operations: readonly EntityOperation[];
}

/** A service's `entities.json`: the fields the builder reads (others are ignored). */
export interface EntityMap {
  readonly formatVersion: number;
  readonly application: string;
  readonly entities: readonly MappedEntity[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isOperation = (value: unknown): value is EntityOperation =>
  isObject(value) &&
  isString(value['operationId']) &&
  isString(value['method']) &&
  isString(value['path']);

const isEntity = (value: unknown): value is MappedEntity =>
  isObject(value) &&
  isString(value['entity']) &&
  isString(value['marking']) &&
  Array.isArray(value['operations']) &&
  value['operations'].every(isOperation);

/**
 * `value` as an entity map when it has the map's shape (format 1, the fields above), else null.
 * Only the fields the builder reads are kept.
 */
export function asEntityMap(value: unknown): EntityMap | null {
  if (!isObject(value)) return null;
  const { formatVersion, application, entities } = value;
  if (formatVersion !== 1 || !isString(application)) return null;
  if (!Array.isArray(entities) || !entities.every(isEntity)) return null;
  return {
    formatVersion,
    application,
    entities: entities.map(({ entity, marking, operations }) => ({
      entity,
      marking,
      operations: operations.map(({ operationId, method, path }) => ({
        operationId,
        method,
        path,
      })),
    })),
  };
}

/** What a call does to an entity: `list`, `view`, `create`, `change`, `delete`, or its method. */
export type Verb = string;

/** The display order of the verbs; any other verb comes after them, by name. */
export const VERB_ORDER: readonly Verb[] = ['list', 'view', 'create', 'change', 'delete'];

/**
 * The verb of an operation, from its method and the shape of its path: a `GET` whose last segment
 * is a `{param}` views one, any other `GET` lists; `POST` creates; `PUT` and `PATCH` change;
 * `DELETE` deletes; any other method is itself, lower-cased.
 */
export function verbOf(method: string, path: string): Verb {
  const upper = method.toUpperCase();
  if (upper === 'GET') {
    const last = path.split('?')[0].split('/').filter(Boolean).at(-1) ?? '';
    return /^\{[^}]+\}$/.test(last) ? 'view' : 'list';
  }
  if (upper === 'POST') return 'create';
  if (upper === 'PUT' || upper === 'PATCH') return 'change';
  if (upper === 'DELETE') return 'delete';
  return method.toLowerCase();
}

/** `verbs`, each once, in {@link VERB_ORDER}, then any other by name. */
export function sortVerbs(verbs: Iterable<Verb>): readonly Verb[] {
  const rank = (verb: Verb) => {
    const at = VERB_ORDER.indexOf(verb);
    return at < 0 ? VERB_ORDER.length : at;
  };
  return [...new Set(verbs)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** One published map, with the repository its site's newest version names. */
export interface EntitySource {
  /** The site's `git.repository.name` (`qits-projects-service`): what a freeze record names. */
  readonly repository: string;
  readonly map: EntityMap;
}

/** One domain entity, as the panels name it. */
export interface EntityRef {
  /** `<repository>#<entity>`: unique across the maps. */
  readonly key: string;
  readonly repository: string;
  readonly application: string;
  /** Its fully qualified class name. */
  readonly entity: string;
  /** Its simple class name. */
  readonly name: string;
}

/** A domain entity a route touches, with the distinct verbs its calls there apply. */
export interface RouteEntity extends EntityRef {
  readonly verbs: readonly Verb[];
}

/** A route that touches an entity, with the verbs its calls there apply. */
export interface EntityRoute {
  readonly route: string;
  readonly verbs: readonly Verb[];
}

/** A domain entity with every route that touches it (none: untouched). */
export interface EntityUsage extends EntityRef {
  readonly routes: readonly EntityRoute[];
}

/** The join of a manifest and the maps. */
export interface EntityJoin {
  /** Each route's domain entities, sorted by application then name; a route touching none is absent. */
  readonly byRoute: Readonly<Record<string, readonly RouteEntity[]>>;
  /**
   * Each route's count of distinct calls (provider and operation) that resolve to no entity: an
   * operation no map lists, or a provider without a map. A route with none is absent.
   */
  readonly unmatched: Readonly<Record<string, number>>;
  /** Every domain entity of the maps, sorted by application then name, with its routes. */
  readonly entities: readonly EntityUsage[];
  /** The domain entities no route touches, in the same order. */
  readonly untouched: readonly EntityUsage[];
  /** How many `technical` and `projection` entities the maps hold, left out of both panels. */
  readonly leftOut: number;
}

const simpleName = (entity: string) => entity.split('.').at(-1) ?? entity;

const byApplicationThenName = (a: EntityRef, b: EntityRef) =>
  a.application.localeCompare(b.application) ||
  a.name.localeCompare(b.name) ||
  a.entity.localeCompare(b.entity);

const operationKey = (repository: string, operationId: string) =>
  `${repository}\u0000${operationId}`;

/**
 * Joins the manifest's route-bound freezes with the maps, on (record's provider, operationId) =
 * (site's `git.repository.name`, operation's `operationId`). A route's entities are the union over
 * its freezes (`byRoute`, as `routeCalls` makes it); a freeze without a route is not in `byRoute`,
 * so it is ignored. Only `domain` entities count. A record whose provider `inScope` refuses is
 * skipped, neither matched nor counted.
 */
export function joinEntities(
  manifest: RoutesManifest,
  sources: readonly EntitySource[],
  inScope: (provider: string) => boolean = () => true,
): EntityJoin {
  const refs = new Map<string, EntityRef>();
  /** Every operation key, to every entity (any marking) it lists, with its verb. */
  const index = new Map<string, { ref: EntityRef | null; verb: Verb }[]>();
  let leftOut = 0;
  for (const { repository, map } of sources) {
    for (const entity of map.entities) {
      const domain = entity.marking === 'domain';
      let ref: EntityRef | null = null;
      if (domain) {
        ref = {
          key: `${repository}#${entity.entity}`,
          repository,
          application: map.application,
          entity: entity.entity,
          name: simpleName(entity.entity),
        };
        refs.set(ref.key, ref);
      } else {
        leftOut++;
      }
      for (const op of entity.operations) {
        const key = operationKey(repository, op.operationId);
        const hits = index.get(key) ?? [];
        hits.push({ ref, verb: verbOf(op.method, op.path) });
        index.set(key, hits);
      }
    }
  }

  const byRoute: Record<string, RouteEntity[]> = {};
  const unmatched: Record<string, number> = {};
  /** Each entity's routes, each with its verbs. */
  const routesOf = new Map<string, Map<string, Set<Verb>>>();
  for (const route of Object.keys(manifest.byRoute)) {
    const verbsOf = new Map<string, Set<Verb>>();
    const calls = new Set<string>();
    for (const freeze of routeFreezes(manifest, route)) {
      for (const record of freeze.records) {
        if (!inScope(record.provider)) continue;
        calls.add(operationKey(record.provider, record.operationId));
      }
    }
    let misses = 0;
    for (const call of calls) {
      const hits = index.get(call);
      if (!hits?.length) {
        misses++;
        continue;
      }
      for (const { ref, verb } of hits) {
        if (!ref) continue;
        const verbs = verbsOf.get(ref.key) ?? new Set<Verb>();
        verbs.add(verb);
        verbsOf.set(ref.key, verbs);
      }
    }
    if (misses) unmatched[route] = misses;
    if (verbsOf.size) {
      byRoute[route] = [...verbsOf]
        .map(([key, verbs]) => ({ ...refs.get(key)!, verbs: sortVerbs(verbs) }))
        .sort(byApplicationThenName);
    }
    for (const [key, verbs] of verbsOf) {
      const routes = routesOf.get(key) ?? new Map<string, Set<Verb>>();
      routes.set(route, verbs);
      routesOf.set(key, routes);
    }
  }

  const entities = [...refs.values()]
    .map((ref): EntityUsage => ({
      ...ref,
      routes: [...(routesOf.get(ref.key) ?? [])]
        .map(([route, verbs]) => ({ route, verbs: sortVerbs(verbs) }))
        .sort((a, b) => a.route.localeCompare(b.route)),
    }))
    .sort(byApplicationThenName);
  return {
    byRoute,
    unmatched,
    entities,
    untouched: entities.filter((e) => e.routes.length === 0),
    leftOut,
  };
}
