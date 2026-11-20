import {
  branchOf,
  defaultVersion,
  distinctBranches,
  versionLabel,
  versionsOnBranch,
} from './doc-versions';

// Pure rules, so hand-built version lists (ported from qits-docs-frontend's reader and doc-kind specs).

const on = (version: string, branch?: string) => ({
  version,
  metadata: branch ? { 'git.branch.name': branch } : {},
});

const VERSIONS = [
  on('c', 'feature/x'),
  on('b', 'main'),
  on('old'),
  on('a', 'main'),
  on('d', 'feature/x'),
];

describe('versionLabel', () => {
  it('shortens a commit sha and keeps a calver', () => {
    expect(versionLabel('9f8e7d6c5b4a39281706f5e4d3c2b1a098765432')).toBe('9f8e7d6c5b4a');
    expect(versionLabel('2026.1120.25645')).toBe('2026.1120.25645');
    expect(versionLabel('9F8E7D6C5B4A39281706F5E4D3C2B1A098765432')).toHaveLength(40);
  });
});

describe('branchOf and distinctBranches', () => {
  it('reads the branch a release wrote, and none for a version without one', () => {
    expect(branchOf(on('a', 'main'))).toBe('main');
    expect(branchOf(on('a'))).toBeUndefined();
    expect(branchOf({ version: 'a' })).toBeUndefined();
    expect(branchOf({ version: 'a', metadata: { 'git.branch.name': 7 } })).toBeUndefined();
  });

  it('lists each branch once, newest first, unbranched skipped', () => {
    expect(distinctBranches(VERSIONS)).toEqual(['feature/x', 'main']);
    expect(distinctBranches([])).toEqual([]);
  });
});

describe('versionsOnBranch', () => {
  it('keeps the branch’s versions and the unbranched ones, in order', () => {
    expect(versionsOnBranch(VERSIONS, 'main').map((v) => v.version)).toEqual(['b', 'old', 'a']);
  });

  it('keeps every version without a branch', () => {
    expect(versionsOnBranch(VERSIONS, undefined)).toEqual(VERSIONS);
  });
});

describe('defaultVersion', () => {
  it('reads the newest of main, else the newest, else nothing', () => {
    expect(defaultVersion(VERSIONS)).toBe('b');
    expect(defaultVersion([on('c', 'feature/x'), on('d')])).toBe('c');
    expect(defaultVersion([])).toBeUndefined();
  });
});
