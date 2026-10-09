import { changesLede, gitlinkOf, hoistedFile } from './release-changes';

// Pure rules, so hand-built answers (ported from qits-projects-frontend's changes spec).

describe('release changes', () => {
  it('says how many files changed since which release, and how many are pins', () => {
    const files = [{ path: 'a' }, { path: 'components/x/y', submodule: { name: 'y' } }];
    expect(changesLede({ mergedSha: 'abc', baseTag: '2026.1.1', files })).toBe(
      '2 files changed since 2026.1.1, 1 of them a submodule pin.',
    );
    expect(changesLede({ mergedSha: 'abc', files: [{ path: 'a' }] })).toBe(
      '1 file changed — this repository has not released yet, so the fold is diffed against the empty tree.',
    );
    expect(changesLede({ files: [] })).toBe('0 files changed — nothing has been folded yet.');
    expect(changesLede(undefined)).toBe('');
  });

  it('finds the expandable pin a path is, or lies under', () => {
    const pins = new Map([
      ['components/a/a-service', {}],
      ['components/b/b-service', { detail: 'added, so there is only one pin' }],
    ]);
    expect(gitlinkOf('components/a/a-service', pins)).toBe('components/a/a-service');
    expect(gitlinkOf('components/a/a-service/src/x.ts', pins)).toBe('components/a/a-service');
    expect(gitlinkOf('components/b/b-service', pins)).toBeNull();
    expect(gitlinkOf('components/a/a-service-other', pins)).toBeNull();
    expect(gitlinkOf('', pins)).toBeNull();
  });

  it('splits a file inside an expanded pin into the pin and the file', () => {
    const expansions = new Map([['components/a/a', { files: [{ path: 'src/x.ts' }] }]]);
    expect(hoistedFile('components/a/a/src/x.ts', expansions)).toEqual({
      gitlink: 'components/a/a',
      file: 'src/x.ts',
    });
    expect(hoistedFile('components/a/a/src/y.ts', expansions)).toBeNull();
    expect(hoistedFile('README.md', expansions)).toBeNull();
  });
});
