import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE,
} from '../../../testing/golden-masters';
import {
  asEntityMap,
  callCardinality,
  joinEntities,
  sortVerbs,
  verbOf,
  type EntityMap,
  type EntitySource,
  type MappedEntity,
} from './entity-map';
import type { RoutesManifest } from './routes-manifest';

/**
 * The recorded bundle's manifest: `projects/:slug/repositories` has two freezes, which call
 * qits-projects-service's `listProjects` and `listProjectRepositories`; `projects` has none.
 */
const RECORDED = masters.body<RoutesManifest>('a published routes bundle', 'getDocsFile');

const REPOSITORIES = 'projects/:slug/repositories';
const PROJECTS = 'qits-projects-service';
const CONTRACTS = ENTITY_MAP_STATE;

/** An entity of `marking` with `operations` (no DTO or kind) and none of the optional fields. */
const entity = (
  fqn: string,
  marking: string,
  operations: readonly { operationId: string; method: string; path: string }[],
): MappedEntity => ({
  entity: fqn,
  marking,
  table: null,
  reason: null,
  projectionOf: null,
  knownGap: null,
  dtos: [],
  operations: operations.map((op) => ({ ...op, dto: null, kind: null, cardinality: null })),
});

/**
 * A map shaped like the one qits-artifacts records in `a published contracts bundle with an entity
 * map`: Project and Repository reached by the manifest's calls, WorkEntity reached by none, and a
 * technical LegacyPlacement on a call the manifest makes.
 */
const MAP: EntityMap = {
  formatVersion: 1,
  application: 'qits-projects',
  entities: [
    entity('eu.wohlben.qits.projects.WorkEntity', 'domain', [
      { operationId: 'getWork', method: 'GET', path: '/work/{qualifiedId}' },
      { operationId: 'deleteWork', method: 'DELETE', path: '/work/{qualifiedId}' },
    ]),
    entity('eu.wohlben.qits.projects.Project', 'domain', [
      { operationId: 'listProjects', method: 'GET', path: '/projects' },
      { operationId: 'getProject', method: 'GET', path: '/projects/{projectId}' },
    ]),
    entity('eu.wohlben.qits.projects.Repository', 'domain', [
      {
        operationId: 'listProjectRepositories',
        method: 'GET',
        path: '/projects/{projectId}/repositories',
      },
    ]),
    entity('eu.wohlben.qits.projects.LegacyPlacement', 'technical', [
      { operationId: 'listProjects', method: 'GET', path: '/projects' },
    ]),
  ],
};

const SOURCES: readonly EntitySource[] = [{ repository: PROJECTS, map: MAP }];

describe('callCardinality (qits-2144)', () => {
  const op = (operationId: string, cardinality: 'single' | 'collection' | null) => ({
    operationId,
    method: 'GET',
    path: '/x',
    dto: null,
    kind: null,
    cardinality,
  });
  const map = (...rows: ReturnType<typeof op>[][]): EntityMap => ({
    ...MAP,
    formatVersion: 2,
    entities: rows.map((operations, i) => ({ ...entity(`E${i}`, 'domain', []), operations })),
  });

  it('is the cardinality the operation’s rows agree on, in any entity', () => {
    const agreeing = map([op('listAgents', 'collection')], [op('listAgents', 'collection')]);
    expect(callCardinality(agreeing, 'listAgents')).toBe('collection');
    expect(callCardinality(map([op('getAgent', 'single')]), 'getAgent')).toBe('single');
  });

  it('is null when the rows disagree, give none, or no row lists the operation', () => {
    expect(
      callCardinality(
        map([op('listAgents', 'collection')], [op('listAgents', 'single')]),
        'listAgents',
      ),
    ).toBeNull();
    expect(callCardinality(map([op('listAgents', null)]), 'listAgents')).toBeNull();
    expect(callCardinality(map([op('listAgents', 'collection')]), 'getAgent')).toBeNull();
  });
});

describe('asEntityMap', () => {
  it('takes a map with the map’s shape, keeping the fields the app reads', () => {
    const published = {
      ...MAP,
      entities: MAP.entities.map((e) => ({
        ...e,
        table: 'x',
        reason: null,
        projectionOf: 'qits-other:Thing',
        knownGap: 'qits-1',
        extra: true,
        dtos: [
          { type: 'a.XDto', kind: 'via', via: 'a.Carrier', site: 'X.of(Carrier)' },
          'not a dto',
        ],
        operations: e.operations.map((o) => ({ ...o, dto: 'a.XDto', kind: 'returns', extra: 1 })),
      })),
    };
    expect(asEntityMap(published)).toEqual({
      ...MAP,
      entities: MAP.entities.map((e) => ({
        ...e,
        table: 'x',
        projectionOf: 'qits-other:Thing',
        knownGap: 'qits-1',
        dtos: [{ type: 'a.XDto', kind: 'via', via: 'a.Carrier', site: 'X.of(Carrier)' }],
        operations: e.operations.map((o) => ({ ...o, dto: 'a.XDto', kind: 'returns' })),
      })),
    });
  });

  it('reads a missing or mistyped optional field as null, or no DTOs', () => {
    const published = {
      ...MAP,
      entities: MAP.entities.map(({ entity: fqn, marking, operations }) => ({
        entity: fqn,
        marking,
        knownGap: false,
        dtos: {},
        operations: operations.map(({ operationId, method, path }) => ({
          operationId,
          method,
          path,
        })),
      })),
    };
    expect(asEntityMap(published)).toEqual(MAP);
  });

  it('refuses anything else', () => {
    expect(asEntityMap(null)).toBeNull();
    expect(asEntityMap([])).toBeNull();
    expect(asEntityMap({ ...MAP, formatVersion: 3 })).toBeNull();
    expect(asEntityMap({ ...MAP, application: 1 })).toBeNull();
    expect(asEntityMap({ ...MAP, entities: {} })).toBeNull();
    expect(asEntityMap({ ...MAP, entities: [{ entity: 'X', marking: 'domain' }] })).toBeNull();
    expect(
      asEntityMap({
        ...MAP,
        entities: [{ entity: 'X', marking: 'domain', operations: [{ operationId: 'a' }] }],
      }),
    ).toBeNull();
  });

  it('takes format 2 with each operation’s cardinality (qits-2144)', () => {
    const published = {
      ...MAP,
      formatVersion: 2,
      entities: MAP.entities.map((e) => ({
        ...e,
        operations: e.operations.map((o) => ({
          ...o,
          cardinality: o.path.endsWith('}') ? 'single' : 'collection',
          offline: true,
        })),
      })),
    };
    const read = asEntityMap(published)!;
    expect(read.formatVersion).toBe(2);
    expect(read.entities[1].operations.map((o) => [o.operationId, o.cardinality])).toEqual([
      ['listProjects', 'collection'],
      ['getProject', 'single'],
    ]);
    expect(read.entities[1].operations[0]).not.toHaveProperty('offline');
  });

  it('reads format 1, or a missing or unknown cardinality, as null (qits-2144)', () => {
    expect(asEntityMap(MAP)!.entities[0].operations[0].cardinality).toBeNull();
    const unknown = {
      ...MAP,
      formatVersion: 2,
      entities: MAP.entities.map((e) => ({
        ...e,
        operations: e.operations.map((o, i) => (i ? { ...o, cardinality: 'many' } : o)),
      })),
    };
    expect(asEntityMap(unknown)).toEqual({ ...MAP, formatVersion: 2 });
  });

  it('takes the recorded map', () => {
    expect(asEntityMap(masters.body(CONTRACTS, 'getDocsFile'))).not.toBeNull();
  });
});

describe('verbOf', () => {
  it('derives the verb from the method and the path’s shape', () => {
    expect(verbOf('GET', '/projects')).toBe('list');
    expect(verbOf('GET', '/projects/{projectId}')).toBe('view');
    expect(verbOf('GET', '/projects/{projectId}/repositories')).toBe('list');
    expect(verbOf('get', '/work/{qualifiedId}/')).toBe('view');
    expect(verbOf('POST', '/projects')).toBe('create');
    expect(verbOf('PUT', '/projects/{projectId}')).toBe('change');
    expect(verbOf('PATCH', '/work/{qualifiedId}')).toBe('change');
    expect(verbOf('DELETE', '/work/{qualifiedId}')).toBe('delete');
    expect(verbOf('HEAD', '/daemons/{daemon}')).toBe('head');
  });

  it('orders verbs list, view, create, change, delete, then the rest', () => {
    expect(sortVerbs(['head', 'delete', 'view', 'list', 'change', 'create', 'view'])).toEqual([
      'list',
      'view',
      'create',
      'change',
      'delete',
      'head',
    ]);
  });
});

describe('joinEntities', () => {
  it('lists each route’s domain entities with their verbs, by application then name', () => {
    const join = joinEntities(RECORDED, SOURCES);
    expect(join.byRoute).toEqual({
      [REPOSITORIES]: [
        {
          key: `${PROJECTS}#eu.wohlben.qits.projects.Project`,
          repository: PROJECTS,
          application: 'qits-projects',
          entity: 'eu.wohlben.qits.projects.Project',
          name: 'Project',
          verbs: ['list'],
        },
        {
          key: `${PROJECTS}#eu.wohlben.qits.projects.Repository`,
          repository: PROJECTS,
          application: 'qits-projects',
          entity: 'eu.wohlben.qits.projects.Repository',
          name: 'Repository',
          verbs: ['list'],
        },
      ],
    });
    expect(join.unmatched).toEqual({});
  });

  it('lists each entity’s routes, and the entities no route touches', () => {
    const join = joinEntities(RECORDED, SOURCES);
    expect(join.entities.map((e) => [e.name, e.routes])).toEqual([
      ['Project', [{ route: REPOSITORIES, verbs: ['list'] }]],
      ['Repository', [{ route: REPOSITORIES, verbs: ['list'] }]],
      ['WorkEntity', []],
    ]);
    expect(join.untouched.map((e) => e.name)).toEqual(['WorkEntity']);
  });

  it('leaves technical and projection entities out, and counts them', () => {
    const map: EntityMap = {
      ...MAP,
      entities: [...MAP.entities, entity('a.ProjectRow', 'projection', [])],
    };
    const join = joinEntities(RECORDED, [{ repository: PROJECTS, map }]);
    expect(join.leftOut).toBe(2);
    expect(join.entities.map((e) => e.name)).not.toContain('LegacyPlacement');
    expect(join.entities.map((e) => e.name)).not.toContain('ProjectRow');
    expect(join.byRoute[REPOSITORIES].map((e) => e.name)).toEqual(['Project', 'Repository']);
  });

  it('counts the calls that resolve to no entity', () => {
    // The map without Repository: `listProjectRepositories` resolves to nothing.
    const map: EntityMap = {
      ...MAP,
      entities: MAP.entities.filter((e) => !e.entity.endsWith('.Repository')),
    };
    expect(joinEntities(RECORDED, [{ repository: PROJECTS, map }]).unmatched).toEqual({
      [REPOSITORIES]: 1,
    });
    // No map for the provider: both calls resolve to nothing.
    expect(joinEntities(RECORDED, []).unmatched).toEqual({ [REPOSITORIES]: 2 });
  });

  it('matches by provider as well as operationId', () => {
    const join = joinEntities(RECORDED, [{ repository: 'qits-other-service', map: MAP }]);
    expect(join.byRoute).toEqual({});
    expect(join.untouched).toHaveLength(3);
  });

  it('skips the records of providers out of scope', () => {
    const join = joinEntities(RECORDED, SOURCES, () => false);
    expect(join.byRoute).toEqual({});
    expect(join.unmatched).toEqual({});
  });

  it('shows each distinct verb once, in order, when several calls reach an entity', () => {
    const map: EntityMap = {
      ...MAP,
      entities: [
        entity('a.Project', 'domain', [
          { operationId: 'listProjectRepositories', method: 'DELETE', path: '/x/{y}' },
          { operationId: 'listProjects', method: 'GET', path: '/projects/{id}' },
        ]),
      ],
    };
    const join = joinEntities(RECORDED, [{ repository: PROJECTS, map }]);
    expect(join.byRoute[REPOSITORIES].map((e) => e.verbs)).toEqual([['view', 'delete']]);
  });
});
