import { changeRows, changesLede, gitlinkOf, hoistedFile } from './release-changes';

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

  it('nests an expanded pin’s files directly after its row, relative to the submodule', () => {
    const files = [
      { path: 'a.txt', changeType: 'MODIFIED' },
      {
        path: 'components/x/x-service',
        changeType: 'MODIFIED',
        submodule: { name: 'x-service' },
      },
      { path: 'b.txt', changeType: 'ADDED' },
      {
        path: 'components/y/y-service',
        changeType: 'MODIFIED',
        submodule: { name: 'y-service' },
      },
      { path: 'c.txt', changeType: 'ADDED' },
    ];
    // Only x-service's pin was asked for; y-service's has not come back (or was never asked for).
    const expansions = new Map([
      [
        'components/x/x-service',
        {
          files: [
            { path: 'README.md', changeType: 'MODIFIED' },
            { path: 'src/new.ts', oldPath: 'src/old.ts', changeType: 'RENAMED' },
          ],
        },
      ],
    ]);

    expect(changeRows(files, expansions)).toEqual([
      files[0],
      files[1],
      {
        path: 'components/x/x-service/README.md',
        oldPath: undefined,
        label: 'README.md',
        oldLabel: undefined,
        changeType: 'MODIFIED',
        depth: 1,
      },
      {
        path: 'components/x/x-service/src/new.ts',
        oldPath: 'components/x/x-service/src/old.ts',
        label: 'src/new.ts',
        oldLabel: 'src/old.ts',
        changeType: 'RENAMED',
        depth: 1,
      },
      files[2],
      files[3],
      files[4],
    ]);
  });
});
