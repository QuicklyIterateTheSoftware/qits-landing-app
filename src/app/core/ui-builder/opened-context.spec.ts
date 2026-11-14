import { openedContext, type OpenedContextFields } from './opened-context';

/**
 * The block qits-2156 fixes (section C), pinned byte for byte: the ui-builder agent's briefing
 * reads exactly these lines, and copies their values into `qits pitches create`.
 */
const ASKED = { viewport: 'DESKTOP', colorScheme: 'LIGHT', network: null } as const;

const DATA_FREEZE: OpenedContextFields = {
  repository: 'qits-landing-app',
  route: 'projects/:slug/repositories',
  manifestVersion: '2026.1114.15822',
  freeze: {
    file: 'src/app/routes/projects/[slug]/repositories/loaded-phone-dark.html',
    kind: 'DATA',
    viewport: 'PHONE',
    colorScheme: 'DARK',
  },
  // The switches ask for other values: the drawn freeze's win.
  asked: ASKED,
  selection: {
    kind: 'mark',
    mark: {
      source: 'qits-projects-service#listProjectRepositories',
      item: 'id=r1',
      field: 'repository.name',
      derived: [],
    },
  },
};

describe('openedContext', () => {
  it('names a DATA freeze and a field mark, then a blank line and the text', () => {
    expect(openedContext(DATA_FREEZE, 'Pitch a calmer header.\nKeep the cards.')).toBe(
      [
        '<opened-context>',
        'repository: qits-landing-app',
        'route: projects/:slug/repositories',
        'manifestVersion: 2026.1114.15822',
        'screenshot: src/app/routes/projects/[slug]/repositories/loaded-phone-dark.html',
        'kind: DATA',
        'viewport: PHONE',
        'colorScheme: DARK',
        'connectivity: online',
        'selection: mark qitsField qits-projects-service#listProjectRepositories id=r1 repository.name',
        '</opened-context>',
        '',
        'Pitch a calmer header.',
        'Keep the cards.',
      ].join('\n'),
    );
  });

  it('without a freeze: none for the screenshot and kind, the switches for the rest', () => {
    const fields: OpenedContextFields = {
      repository: 'qits-landing-app',
      route: null,
      manifestVersion: null,
      freeze: null,
      asked: { viewport: 'TABLET', colorScheme: 'DARK', network: 'OFFLINE' },
      selection: null,
    };
    expect(openedContext(fields, 'What is on this page?')).toBe(
      [
        '<opened-context>',
        'repository: qits-landing-app',
        'route: none',
        'manifestVersion: none',
        'screenshot: none',
        'kind: none',
        'viewport: TABLET',
        'colorScheme: DARK',
        'connectivity: offline',
        'selection: none',
        '</opened-context>',
        '',
        'What is on this page?',
      ].join('\n'),
    );
  });

  it('reads a freeze’s missing kind, width and scheme as none, and its network as shot', () => {
    const block = openedContext(
      {
        ...DATA_FREEZE,
        freeze: {
          file: 'a.html',
          kind: null,
          viewport: null,
          colorScheme: null,
          connectivity: {
            network: 'OFFLINE',
            outbox: [],
            cacheResources: [],
            cached: [],
            queueMutations: [],
          },
        },
      },
      '',
    );
    expect(block.split('\n').slice(5, 9)).toEqual([
      'kind: none',
      'viewport: none',
      'colorScheme: none',
      'connectivity: offline',
    ]);
  });

  it('names an entity, an item mark and a list mark', () => {
    const selection = (fields: Partial<OpenedContextFields>) =>
      openedContext({ ...DATA_FREEZE, ...fields }, '').split('\n')[9];
    expect(selection({ selection: { kind: 'entity', name: 'Repository' } })).toBe(
      'selection: entity Repository',
    );
    const mark = { source: 'p#op', item: 'id=1', field: null, derived: [] };
    expect(selection({ selection: { kind: 'mark', mark } })).toBe(
      'selection: mark qitsEntity p#op id=1',
    );
    expect(selection({ selection: { kind: 'mark', mark: { ...mark, item: null } } })).toBe(
      'selection: mark qitsEntityList p#op',
    );
    expect(selection({ selection: { kind: 'mark', mark: { ...mark, derived: ['state'] } } })).toBe(
      'selection: mark qitsField p#op id=1',
    );
  });
});
