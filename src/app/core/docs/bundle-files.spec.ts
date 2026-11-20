import {
  bundlePathOf,
  categoriesOf,
  markdownParts,
  openapiPathOf,
  pagesInCategory,
  storyPages,
  storyTitle,
} from './bundle-files';

// Pure rules, so hand-built file lists (ported from qits-docs-frontend's bundle-files and
// markdown-bundle specs); the list is the shape `a published markdown docs bundle` records.

const FILES = [
  'README.md',
  'alpha/first-story/screenshot.png',
  'alpha/first-story/user-story.md',
  'beta/second-story/user-story.md',
  'third-story/user-story.md',
];

describe('storyPages', () => {
  it('reads every .md as a page, categorized, uncategorized or at the root', () => {
    expect(storyPages(FILES)).toEqual([
      { path: 'README.md', category: '', story: 'README' },
      { path: 'alpha/first-story/user-story.md', category: 'alpha', story: 'first-story' },
      { path: 'beta/second-story/user-story.md', category: 'beta', story: 'second-story' },
      { path: 'third-story/user-story.md', category: '', story: 'third-story' },
    ]);
  });

  it('reads a changelog as one page', () => {
    expect(storyPages(['CHANGELOG.md'])).toEqual([
      { path: 'CHANGELOG.md', category: '', story: 'CHANGELOG' },
    ]);
  });
});

describe('categoriesOf and pagesInCategory', () => {
  const pages = storyPages(FILES);

  it('lists each category once, in path order, and none for a flat bundle', () => {
    expect(categoriesOf(pages)).toEqual(['alpha', 'beta']);
    expect(categoriesOf(storyPages(['CHANGELOG.md']))).toEqual([]);
  });

  it('narrows to a category, or to the uncategorized pages', () => {
    expect(pagesInCategory(pages, 'beta').map((p) => p.story)).toEqual(['second-story']);
    expect(pagesInCategory(pages, '').map((p) => p.story)).toEqual(['README', 'third-story']);
  });
});

describe('storyTitle', () => {
  it('reads the first-level heading, else the fallback', () => {
    expect(storyTitle('intro\n# First story \n## Not this', 'first-story')).toBe('First story');
    expect(storyTitle('## Only a second level', 'first-story')).toBe('first-story');
  });
});

describe('openapiPathOf', () => {
  it('finds openapi.* wherever it sits, else the first spec-shaped file', () => {
    expect(openapiPathOf(['openapi.yml'])).toBe('openapi.yml');
    expect(openapiPathOf(['a.json', 'v1/openapi.yaml'])).toBe('v1/openapi.yaml');
    expect(openapiPathOf(['README.md', 'spec.json'])).toBe('spec.json');
    expect(openapiPathOf(['README.md'])).toBeUndefined();
  });
});

describe('bundlePathOf', () => {
  const page = 'alpha/first-story/user-story.md';

  it('resolves a relative reference beside the page', () => {
    expect(bundlePathOf(page, 'screenshot.png')).toBe('alpha/first-story/screenshot.png');
    expect(bundlePathOf(page, './shots/a.png?x=1#y')).toBe('alpha/first-story/shots/a.png');
    expect(bundlePathOf(page, '../shared.png')).toBe('alpha/shared.png');
    expect(bundlePathOf('README.md', 'logo.svg')).toBe('logo.svg');
  });

  it('leaves an absolute reference, and one climbing out of the bundle', () => {
    expect(bundlePathOf(page, 'https://example.test/a.png')).toBeUndefined();
    expect(bundlePathOf(page, 'data:image/png;base64,AA')).toBeUndefined();
    expect(bundlePathOf(page, '//cdn.test/a.png')).toBeUndefined();
    expect(bundlePathOf(page, '/a.png')).toBeUndefined();
    expect(bundlePathOf(page, '#top')).toBeUndefined();
    expect(bundlePathOf('README.md', '../a.png')).toBeUndefined();
    expect(bundlePathOf(page, '')).toBeUndefined();
  });
});

describe('markdownParts', () => {
  it('splits the text around each mermaid fence', () => {
    const markdown = [
      '# First story',
      '',
      '```mermaid',
      'graph LR',
      '  a --> b',
      '```',
      '',
      '![screenshot](screenshot.png)',
    ].join('\n');
    expect(markdownParts(markdown)).toEqual([
      { kind: 'markdown', text: '# First story\n' },
      { kind: 'mermaid', definition: 'graph LR\n  a --> b' },
      { kind: 'markdown', text: '\n![screenshot](screenshot.png)' },
    ]);
  });

  it('keeps other fences, a tilde fence and an unclosed one as they are', () => {
    expect(markdownParts('```ts\nconst a = 1;\n```')).toEqual([
      { kind: 'markdown', text: '```ts\nconst a = 1;\n```' },
    ]);
    expect(markdownParts('~~~mermaid\ngraph TD\n~~~~')).toEqual([
      { kind: 'mermaid', definition: 'graph TD' },
    ]);
    expect(markdownParts('```mermaid\ngraph TD\n~~~')).toEqual([
      { kind: 'markdown', text: '```mermaid\ngraph TD\n~~~' },
    ]);
  });

  it('makes nothing of a blank page', () => {
    expect(markdownParts('')).toEqual([]);
    expect(markdownParts('\n\n')).toEqual([]);
  });
});
