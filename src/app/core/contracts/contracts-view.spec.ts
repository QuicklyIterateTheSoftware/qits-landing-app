import { asEntityMap, type EntityMap } from '$core/ui-builder/entity-map';
import type { ContractsSite, EntityMapRead } from '$core/ui-builder/entity-map.store';
import { asGoldenIndex, type GoldenIndex } from '$core/ui-builder/golden-masters.store';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
  projectsGoldenIndex,
} from '../../../testing/golden-masters';
import {
  bundleOf,
  byKind,
  dependencyRows,
  dependencySites,
  docsUrl,
  DTO_KINDS,
  entityGroups,
  filterRows,
  keyValues,
  kindNote,
  OPERATION_KINDS,
  projectionLink,
  projectionTarget,
  providerSite,
  simpleName,
  sortedDtos,
  stateRows,
  statesRecording,
} from './contracts-view';

const PROJECTS: ContractsSite = {
  site: '@contracts/qits-projects',
  version: '2100.1.0',
  repository: 'qits-projects-service',
};
const CI: ContractsSite = {
  site: '@contracts/qits-ci',
  version: '2026.1.1',
  repository: 'qits-ci-service',
};

/** qits-projects' published index, as its golden-masters package carries it. */
const RECORDED: GoldenIndex = asGoldenIndex(projectsGoldenIndex())!;

/** The recorded entity map: Project, Repository, WorkEntity (domain), LegacyPlacement (technical). */
const MAP: EntityMap = asEntityMap(masters.body(CONTRACTS, 'getDocsFile'))!;

describe('bundleOf', () => {
  it('finds the site whose newest version names the repository', () => {
    const catalog = { status: 'loaded', sites: [CI, PROJECTS], unreadable: [] } as const;
    expect(bundleOf(catalog, 'qits-projects-service')).toEqual({
      status: 'loaded',
      site: PROJECTS,
    });
  });

  it('says none, unreadable, loading or error', () => {
    expect(bundleOf(null, 'x')).toEqual({ status: 'loading' });
    expect(bundleOf({ status: 'loading' }, 'x')).toEqual({ status: 'loading' });
    expect(bundleOf({ status: 'error' }, 'x')).toEqual({ status: 'error' });
    expect(bundleOf({ status: 'loaded', sites: [CI], unreadable: [] }, 'x')).toEqual({
      status: 'none',
    });
    expect(
      bundleOf({ status: 'loaded', sites: [CI], unreadable: ['@contracts/qits-y'] }, 'x'),
    ).toEqual({ status: 'unreadable', sites: ['@contracts/qits-y'] });
  });
});

describe('docsUrl', () => {
  it('links the bundle in qits-docs’ reader at its version', () => {
    expect(docsUrl('https://docs.example', PROJECTS)).toBe(
      'https://docs.example/read/@contracts/qits-projects/-/2100.1.0',
    );
    expect(docsUrl('', PROJECTS)).toBeNull();
  });
});

describe('stateRows and filterRows', () => {
  it('lists every recorded state with its operations', () => {
    const rows = stateRows(RECORDED);
    expect(rows).toHaveLength(RECORDED.states!.length);
    const exists = rows.find((r) => r.slug === 'a-project-exists')!;
    expect(exists.name).toBe('a project exists');
    expect(exists.operationCount).toBe(
      RECORDED.states!.find((s) => s.slug === 'a-project-exists')!.operations.length,
    );
    expect(exists.operationIds).toContain('deleteProject');
  });

  it('filters by name, ignoring case and blanks', () => {
    const rows = stateRows(RECORDED);
    expect(filterRows(rows, '')).toBe(rows);
    const found = filterRows(rows, '  A PROJECT EXISTS ');
    expect(found.map((r) => r.name)).toContain('a project exists');
    expect(found.every((r) => r.name.toLowerCase().includes('a project exists'))).toBe(true);
    expect(filterRows(rows, 'no state is named like this')).toEqual([]);
  });
});

describe('dependencyRows', () => {
  // Every recorded state depends on nothing; these are constructed for the two shapes the index
  // format allows: a state of the same provider (a string) and one of another ({ provider, state }).
  const own: GoldenIndex = {
    provider: 'qits-ci',
    states: [
      {
        name: 'a commit with a run in flight',
        slug: 'a-commit-with-a-run-in-flight',
        dependsOn: [
          'a commit exists',
          'a state nobody lists',
          { provider: 'qits-projects', state: 'a project exists' },
          { provider: 'qits-projects', state: 'a state qits-projects does not list' },
          { provider: 'qits-unpublished', state: 'anything' },
        ],
        operations: [],
      },
      { name: 'a commit exists', slug: 'a-commit-exists', operations: [] },
    ],
  };
  const state = own.states![0];

  it('links a state of the same bundle, and one of another bundle its index lists', () => {
    const rows = dependencyRows(state.dependsOn, { site: CI, index: own }, [CI, PROJECTS], (s) =>
      s === PROJECTS ? RECORDED : null,
    );
    expect(rows).toEqual([
      {
        label: 'a commit exists',
        link: { repository: 'qits-ci-service', slug: 'a-commit-exists' },
      },
      { label: 'a state nobody lists', link: null },
      {
        label: 'qits-projects: a project exists',
        link: { repository: 'qits-projects-service', slug: 'a-project-exists' },
      },
      { label: 'qits-projects: a state qits-projects does not list', link: null },
      { label: 'qits-unpublished: anything', link: null },
    ]);
  });

  it('leaves another provider’s state as text while its index is unread', () => {
    const rows = dependencyRows(
      [{ provider: 'qits-projects', state: 'a project exists' }],
      { site: CI, index: own },
      [CI, PROJECTS],
      () => null,
    );
    expect(rows).toEqual([{ label: 'qits-projects: a project exists', link: null }]);
  });

  it('has no rows for no dependencies', () => {
    expect(dependencyRows(undefined, { site: CI, index: own }, [], () => null)).toEqual([]);
    expect(dependencyRows([], { site: CI, index: own }, [], () => null)).toEqual([]);
  });

  it('names the other bundles whose indexes the links need, once each', () => {
    expect(dependencySites(state.dependsOn, [CI, PROJECTS])).toEqual([PROJECTS]);
  });
});

describe('providerSite', () => {
  it('finds a provider’s site by application or by repository', () => {
    expect(providerSite([CI, PROJECTS], 'qits-projects')).toBe(PROJECTS);
    expect(providerSite([CI, PROJECTS], 'qits-ci-service')).toBe(CI);
    expect(providerSite([CI], 'qits-projects')).toBeNull();
  });
});

describe('keyValues', () => {
  it('shows a string as it is and anything else as JSON', () => {
    expect(keyValues({ a: 'x', b: 2, c: { d: true } })).toEqual([
      { key: 'a', value: 'x' },
      { key: 'b', value: '2' },
      { key: 'c', value: '{"d":true}' },
    ]);
    expect(keyValues(undefined)).toEqual([]);
  });
});

describe('entityGroups', () => {
  it('groups the recorded map by marking, domain first, each by simple name', () => {
    expect(
      entityGroups(MAP).map((g) => [g.marking, g.entities.map((e) => simpleName(e.entity))]),
    ).toEqual([
      ['domain', ['Project', 'Repository', 'WorkEntity']],
      ['technical', ['LegacyPlacement']],
    ]);
  });

  it('puts projections after technical entities, and any other marking last', () => {
    const map: EntityMap = {
      ...MAP,
      entities: [
        { ...MAP.entities[0], entity: 'a.Odd', marking: 'odd' },
        { ...MAP.entities[0], entity: 'a.Row', marking: 'projection' },
        ...MAP.entities,
      ],
    };
    expect(entityGroups(map).map((g) => g.marking)).toEqual([
      'domain',
      'technical',
      'projection',
      'odd',
    ]);
  });
});

describe('projectionTarget and projectionLink', () => {
  it('reads `<application>:<Entity>`', () => {
    expect(projectionTarget('qits-projects:Project')).toEqual({
      application: 'qits-projects',
      name: 'Project',
    });
    expect(projectionTarget(null)).toBeNull();
    expect(projectionTarget('Project')).toBeNull();
  });

  it('links the entity of that simple name in the application’s map', () => {
    const loaded: EntityMapRead = { status: 'loaded', map: MAP };
    const mapOf = (s: ContractsSite) => (s === PROJECTS ? loaded : undefined);
    expect(projectionLink('qits-projects:Project', [CI, PROJECTS], mapOf)).toEqual({
      repository: 'qits-projects-service',
      entity: 'eu.wohlben.qits.entities.domain.Project',
    });
    expect(projectionLink('qits-projects:Nothing', [CI, PROJECTS], mapOf)).toBeNull();
    expect(projectionLink('qits-other:Project', [CI, PROJECTS], mapOf)).toBeNull();
    expect(projectionLink('qits-projects:Project', [CI, PROJECTS], () => undefined)).toBeNull();
    // A map of another application under that site's name is not the application's.
    expect(
      projectionLink('qits-projects:Project', [PROJECTS], () => ({
        status: 'loaded',
        map: { ...MAP, application: 'qits-other' },
      })),
    ).toBeNull();
  });
});

describe('link kinds', () => {
  it('explains each kind of the map’s format, and none other', () => {
    expect(DTO_KINDS.map((k) => k.kind)).toEqual([
      'direct',
      'annotation',
      'factory',
      'mapper',
      'assembler',
      'via',
    ]);
    expect(OPERATION_KINDS.map((k) => k.kind)).toEqual(['direct', 'returns', 'schema', 'body']);
    expect(kindNote(DTO_KINDS, 'mapper')).toContain('parameter');
    expect(kindNote(OPERATION_KINDS, 'deletes')).toBeNull();
    expect(kindNote(OPERATION_KINDS, null)).toBeNull();
  });

  it('orders the most direct first, an unknown kind last', () => {
    const dtos = sortedDtos([
      { type: 'b', kind: 'via', via: 'c', site: null },
      { type: 'z', kind: 'direct', via: null, site: null },
      { type: 'a', kind: 'via', via: 'c', site: null },
    ]);
    expect(dtos.map((d) => d.type)).toEqual(['z', 'a', 'b']);
    const ops = byKind(
      [
        { id: 'x', kind: 'deletes' },
        { id: 'y', kind: 'body' },
        { id: 'w', kind: 'returns' },
      ],
      OPERATION_KINDS,
      (o) => o.id,
    );
    expect(ops.map((o) => o.id)).toEqual(['w', 'y', 'x']);
  });
});

describe('statesRecording', () => {
  it('finds the recorded states that record an operation', () => {
    const states = statesRecording(RECORDED, 'listProjects');
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((s) => s.operations.some((op) => op.operationId === 'listProjects'))).toBe(
      true,
    );
    expect(statesRecording(RECORDED, 'noSuchOperation')).toEqual([]);
  });
});
