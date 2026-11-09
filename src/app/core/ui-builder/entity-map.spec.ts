import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE,
  isArtifactsRecorded,
} from '../../../testing/golden-masters';
import {
  asEntityMap,
  joinEntities,
  sortVerbs,
  verbOf,
  type EntityMap,
  type EntitySource,
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

/**
 * A map shaped like the one qits-artifacts records in `a published contracts bundle with an entity
 * map`: Project and Repository reached by the manifest's calls, WorkEntity reached by none, and a
 * technical LegacyPlacement on a call the manifest makes.
 */
const MAP: EntityMap = {
  formatVersion: 1,
  application: 'qits-projects',
  entities: [
    {
      entity: 'eu.wohlben.qits.projects.WorkEntity',
      marking: 'domain',
      operations: [
        { operationId: 'getWork', method: 'GET', path: '/work/{qualifiedId}' },
        { operationId: 'deleteWork', method: 'DELETE', path: '/work/{qualifiedId}' },
      ],
    },
    {
      entity: 'eu.wohlben.qits.projects.Project',
      marking: 'domain',
      operations: [
        { operationId: 'listProjects', method: 'GET', path: '/projects' },
        { operationId: 'getProject', method: 'GET', path: '/projects/{projectId}' },
      ],
    },
    {
      entity: 'eu.wohlben.qits.projects.Repository',
      marking: 'domain',
      operations: [
        {
          operationId: 'listProjectRepositories',
          method: 'GET',
          path: '/projects/{projectId}/repositories',
        },
      ],
    },
    {
      entity: 'eu.wohlben.qits.projects.LegacyPlacement',
      marking: 'technical',
      operations: [{ operationId: 'listProjects', method: 'GET', path: '/projects' }],
    },
  ],
};

const SOURCES: readonly EntitySource[] = [{ repository: PROJECTS, map: MAP }];

describe('asEntityMap', () => {
  it('takes a map with the map’s shape, keeping only what the builder reads', () => {
    const published = {
      ...MAP,
      entities: MAP.entities.map((e) => ({
        ...e,
        table: 'x',
        reason: null,
        projectionOf: null,
        knownGap: false,
        dtos: ['X'],
        operations: e.operations.map((o) => ({ ...o, dto: 'X', kind: 'read' })),
      })),
    };
    expect(asEntityMap(published)).toEqual(MAP);
  });

  it('refuses anything else', () => {
    expect(asEntityMap(null)).toBeNull();
    expect(asEntityMap([])).toBeNull();
    expect(asEntityMap({ ...MAP, formatVersion: 2 })).toBeNull();
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

  it.skipIf(!isArtifactsRecorded(CONTRACTS, 'getDocsFile'))('takes the recorded map', () => {
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
      entities: [
        ...MAP.entities,
        { entity: 'a.ProjectRow', marking: 'projection', operations: [] },
      ],
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
        {
          entity: 'a.Project',
          marking: 'domain',
          operations: [
            { operationId: 'listProjectRepositories', method: 'DELETE', path: '/x/{y}' },
            { operationId: 'listProjects', method: 'GET', path: '/projects/{id}' },
          ],
        },
      ],
    };
    const join = joinEntities(RECORDED, [{ repository: PROJECTS, map }]);
    expect(join.byRoute[REPOSITORIES].map((e) => e.verbs)).toEqual([['view', 'delete']]);
  });
});
