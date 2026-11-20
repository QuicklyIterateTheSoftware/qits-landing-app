import { parseReadPath, readCommands } from './doc-url';

// Pure rules, so hand-built addresses (ported from qits-docs-frontend's doc-url spec).

describe('parseReadPath', () => {
  it('reads a scoped site split over segments, with and without a version', () => {
    expect(parseReadPath(['read', '@userflows', 'qits-events'])).toEqual({
      site: '@userflows/qits-events',
    });
    expect(parseReadPath(['read', '@userflows', 'qits-events', '-', 'abc'])).toEqual({
      site: '@userflows/qits-events',
      version: 'abc',
    });
  });

  it('reads a site whose `/` rode escaped, as one segment', () => {
    expect(parseReadPath(['read', '@apidocs/qits-ci', '-', '2026.1.1'])).toEqual({
      site: '@apidocs/qits-ci',
      version: '2026.1.1',
    });
  });

  it('drops the leading read only, so a site may hold the word', () => {
    expect(parseReadPath(['@guides', 'read'])).toEqual({ site: '@guides/read' });
    expect(parseReadPath(['read', 'read'])).toEqual({ site: 'read' });
  });

  it('reads an unscoped site, and nothing as an empty site', () => {
    expect(parseReadPath(['read', 'qits-storybook'])).toEqual({ site: 'qits-storybook' });
    expect(parseReadPath(['read'])).toEqual({ site: '' });
    expect(parseReadPath([])).toEqual({ site: '' });
  });
});

describe('readCommands', () => {
  it('splits the name into segments and appends the version', () => {
    expect(
      readCommands('@userflows/qits-events', 'abc', ['/', 'projects', 'qits', 'docs']),
    ).toEqual(['/', 'projects', 'qits', 'docs', 'read', '@userflows', 'qits-events', '-', 'abc']);
    expect(readCommands('qits-storybook')).toEqual(['/', 'read', 'qits-storybook']);
  });

  it('is the inverse of parseReadPath', () => {
    const commands = readCommands('@apidocs/qits-ci', '2026.1.1', []);
    expect(parseReadPath(commands)).toEqual({ site: '@apidocs/qits-ci', version: '2026.1.1' });
  });
});
