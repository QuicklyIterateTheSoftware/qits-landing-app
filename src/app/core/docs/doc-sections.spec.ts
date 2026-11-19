import {
  DOC_SECTIONS,
  docBlocks,
  kindOf,
  projectRepositoryOf,
  publishedBy,
  sectionOf,
  shortNameOf,
} from './doc-sections';

describe('DOC_SECTIONS', () => {
  it('lists the docs app’s sections in its order, with its labels, segments and scopes', () => {
    expect(DOC_SECTIONS.map((s) => [s.label, s.route, s.scope])).toEqual([
      ['Storybook', 'storybook', undefined],
      ['API docs', 'apidocs', '@apidocs'],
      ['Userflows', 'userflows', '@userflows'],
      ['Guides', 'guides', '@guides'],
      ['Contracts', 'contracts', '@contracts'],
      ['Routes', 'routes', '@routes'],
      ['Changelogs', 'changelog', '@changelog'],
    ]);
    for (const section of DOC_SECTIONS) expect(section.description).not.toBe('');
  });
});

describe('kindOf', () => {
  it('reads the kind off a claimed scope', () => {
    expect(kindOf('@apidocs/qits-ci')).toBe('apidocs');
    expect(kindOf('@userflows/qits-events')).toBe('userflows');
    expect(kindOf('@guides/qits-platform')).toBe('guides');
    expect(kindOf('@contracts/qits-projects')).toBe('contracts');
    expect(kindOf('@routes/qits-landing')).toBe('routes');
    expect(kindOf('@changelog/qits-landing-app')).toBe('changelog');
  });

  it('gives Storybook every site no scoped section claims', () => {
    expect(kindOf('@qits/ui-components')).toBe('storybook');
    expect(kindOf('qits-storybook')).toBe('storybook');
    // A bare scope addresses no bundle of its kind.
    expect(kindOf('@userflows')).toBe('storybook');
    expect(kindOf('@apidocsx/qits-ci')).toBe('storybook');
  });
});

describe('shortNameOf', () => {
  it('drops the scope of a scoped name', () => {
    expect(shortNameOf('@qits/ui-components')).toBe('ui-components');
  });

  it('keeps a name published without a scope whole', () => {
    expect(shortNameOf('qits-cli')).toBe('qits-cli');
    expect(shortNameOf('@nothing')).toBe('@nothing');
  });
});

describe('sectionOf', () => {
  it('finds a section by its route segment, and nothing for any other value', () => {
    expect(sectionOf('apidocs')?.label).toBe('API docs');
    expect(sectionOf('changelog')?.label).toBe('Changelogs');
    expect(sectionOf('changelogs')).toBeUndefined();
    expect(sectionOf('')).toBeUndefined();
    expect(sectionOf(null)).toBeUndefined();
  });
});

describe('docBlocks', () => {
  const sites = [
    { name: '@routes/qits-landing' },
    { name: 'qits-storybook' },
    { name: '@apidocs/qits-ci' },
    { name: '@qits/ui-components' },
    { name: '@apidocs/qits-artifacts' },
    { name: '@changelog/qits-landing-app' },
  ];
  const shape = (blocks: ReturnType<typeof docBlocks>) =>
    blocks.map((b) => [b.section.kind, b.sites.map((s) => s.name)]);

  it('makes one block per section holding a site, in section order, sites by short name', () => {
    expect(shape(docBlocks(sites))).toEqual([
      ['storybook', ['qits-storybook', '@qits/ui-components']],
      ['apidocs', ['@apidocs/qits-artifacts', '@apidocs/qits-ci']],
      ['routes', ['@routes/qits-landing']],
      ['changelog', ['@changelog/qits-landing-app']],
    ]);
  });

  it('keeps one section alone', () => {
    expect(shape(docBlocks(sites, { only: 'apidocs' }))).toEqual([
      ['apidocs', ['@apidocs/qits-artifacts', '@apidocs/qits-ci']],
    ]);
  });

  it('keeps the sites whose name holds the query, ignoring case', () => {
    expect(shape(docBlocks(sites, { query: ' LANDING ' }))).toEqual([
      ['routes', ['@routes/qits-landing']],
      ['changelog', ['@changelog/qits-landing-app']],
    ]);
    expect(docBlocks(sites, { only: 'guides' })).toEqual([]);
    expect(docBlocks([])).toEqual([]);
  });
});

describe('publishedBy', () => {
  const sites = [
    { name: '@contracts/qits-ci', latestRepository: 'qits-ci-service' },
    { name: '@apidocs/qits-ci', latestRepository: 'qits-ci-service' },
    { name: '@changelog/qits-ci-frontend', latestRepository: 'qits-ci-frontend' },
    { name: 'qits-storybook' },
  ];

  it('keeps the sites whose newest version the repository published, never by name', () => {
    expect(publishedBy(sites, 'qits-ci-service').map((s) => s.name)).toEqual([
      '@contracts/qits-ci',
      '@apidocs/qits-ci',
    ]);
    expect(publishedBy(sites, 'qits-ci')).toEqual([]);
  });

  it('keeps nothing for a repository that published none, or no name', () => {
    expect(publishedBy(sites, 'qits-events-service')).toEqual([]);
    expect(publishedBy(sites, '')).toEqual([]);
  });
});

describe('projectRepositoryOf', () => {
  const project = new Set(['qits-ci-service', 'qits-ci-frontend']);

  it('names the project’s repository that published the newest version', () => {
    expect(projectRepositoryOf({ latestRepository: 'qits-ci-service' }, project)).toBe(
      'qits-ci-service',
    );
  });

  it('names none for another repository, or a site that names none', () => {
    expect(projectRepositoryOf({ latestRepository: 'qits-workspaces-frontend' }, project)).toBe(
      undefined,
    );
    expect(projectRepositoryOf({}, project)).toBeUndefined();
  });
});
