import { routeFreezes, type RoutesManifest } from './routes-manifest';

/**
 * A service's entity map (qits-1945, published as `entities.json` in the docs site
 * `@contracts/<application>`), and the pure join the UI builder (qits-1950) draws from it and a
 * frontend's frozen routes: which domain entities each route touches, and which routes show each
 * entity. The map is a file the release publishes, not an API answer, so its type lives here and
 * {@link asEntityMap} checks its shape at run time.
 */

/**
 * One operation that answers a DTO carrying the entity. `path` has no app root. `dto` is the best
 * DTO reaching the entity through it (null when none, as a `deletes` row has), `kind` how the
 * operation hands that DTO out: `direct`, `returns`, `schema` or `body` (qits-1945).
 */
export interface EntityOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly dto: string | null;
  readonly kind: string | null;
  /**
   * Whether the operation answers one of the entity (`single`, a detail) or many (`collection`, a
   * list), as format 2 writes it (qits-2140); null in a format 1 map, or when the row gives none or
   * one this app does not know (qits-2144).
   */
  readonly cardinality: Cardinality | null;
}

/** How many of an entity an operation answers (qits-2140): one, or a list. */
export type Cardinality = 'single' | 'collection';

/** The formats of `entities.json` this app reads (qits-2144: format 2 adds `cardinality`). */
const FORMAT_VERSIONS: readonly unknown[] = [1, 2];

/** A row's `cardinality` when it is one this app knows, else null: it never rejects the map. */
const cardinalityOf = (value: unknown): Cardinality | null =>
  value === 'single' || value === 'collection' ? value : null;

/**
 * One type an operation hands out that carries the entity, with its most direct link: `kind` is
 * `direct`, `annotation`, `factory`, `mapper`, `assembler` or `via`; `via` names the carrier of a
 * `via` link; `site` the code unit the link was seen in.
 */
export interface EntityDto {
  readonly type: string;
  readonly kind: string;
  readonly via: string | null;
  readonly site: string | null;
}

/**
 * One persisted entity. The UI builder shows only `domain` entities; `technical` and `projection`
 * ones are counted and left out there, and shown on the entities pages (qits-1994).
 */
export interface MappedEntity {
  /** Its fully qualified class name. */
  readonly entity: string;
  readonly marking: string;
  /** Its table; null when the map names none. */
  readonly table: string | null;
  /** Why a `technical` entity is one; null otherwise. */
  readonly reason: string | null;
  /** What a `projection` entity projects, `<application>:<Entity>`; null otherwise. */
  readonly projectionOf: string | null;
  /** The ticket that tracks an unexposed entity (`qits-1234`); null when none. */
  readonly knownGap: string | null;
  readonly dtos: readonly EntityDto[];
  readonly operations: readonly EntityOperation[];
}

/** A service's `entities.json`: the fields the app reads (others are ignored). */
export interface EntityMap {
  readonly formatVersion: number;
  readonly application: string;
  readonly entities: readonly MappedEntity[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

/** `value` when it is a string, else null: an optional field of the map. */
const stringOrNull = (value: unknown): string | null => (isString(value) ? value : null);

const isOperation = (value: unknown): value is Record<string, unknown> =>
  isObject(value) &&
  isString(value['operationId']) &&
  isString(value['method']) &&
  isString(value['path']);

const isDto = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && isString(value['type']) && isString(value['kind']);

const isEntity = (value: unknown): value is Record<string, unknown> & { operations: unknown[] } =>
  isObject(value) &&
  isString(value['entity']) &&
  isString(value['marking']) &&
  Array.isArray(value['operations']) &&
  value['operations'].every(isOperation);

/**
 * `value` as an entity map when it has the map's shape (format 1 or 2, `application`, and each
 * entity's `entity`, `marking` and `operations`), else null. Format 2 (qits-2140) adds each
 * operation row's `cardinality` (and an optional `offline`, ignored here); a format 1 row reads as
 * `cardinality: null` (qits-2144). Only the fields above are kept; an optional one
 * that is missing or of another type is null (or `[]` for `dtos`, which keeps its well-formed rows).
 */
export function asEntityMap(value: unknown): EntityMap | null {
  if (!isObject(value)) return null;
  const { formatVersion, application, entities } = value;
  if (!FORMAT_VERSIONS.includes(formatVersion) || !isString(application)) return null;
  if (!Array.isArray(entities) || !entities.every(isEntity)) return null;
  return {
    formatVersion: formatVersion as number,
    application,
    entities: entities.map((entity) => ({
      entity: entity['entity'] as string,
      marking: entity['marking'] as string,
      table: stringOrNull(entity['table']),
      reason: stringOrNull(entity['reason']),
      projectionOf: stringOrNull(entity['projectionOf']),
      knownGap: stringOrNull(entity['knownGap']),
      dtos: (Array.isArray(entity['dtos']) ? entity['dtos'] : []).filter(isDto).map((dto) => ({
        type: dto['type'] as string,
        kind: dto['kind'] as string,
        via: stringOrNull(dto['via']),
        site: stringOrNull(dto['site']),
      })),
      operations: (entity.operations as Record<string, unknown>[]).map((op) => ({
        operationId: op['operationId'] as string,
        method: op['method'] as string,
        path: op['path'] as string,
        dto: stringOrNull(op['dto']),
        kind: stringOrNull(op['kind']),
        cardinality: cardinalityOf(op['cardinality']),
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
 * its freezes (`byRoute`, as `routeFreezes` reads it); a freeze without a route is not in `byRoute`,
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

/**
 * The cardinality of a call (qits-2144): that of its operation's rows (same operationId) in every
 * entity of the provider's map. Null when no row lists the operation, when no row gives one, or
 * when the rows disagree.
 */
export function callCardinality(map: EntityMap, operationId: string): Cardinality | null {
  const found = new Set(
    map.entities.flatMap((entity) =>
      entity.operations.filter((op) => op.operationId === operationId).map((op) => op.cardinality),
    ),
  );
  if (found.size !== 1) return null;
  return [...found][0];
}
