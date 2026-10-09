import { releaseTabOf, releaseTabs } from './release-tabs';

describe('release request tabs', () => {
  it('reads the tab from ?tab=, and anything else as the overview', () => {
    expect(['commits', 'runs', 'changes', 'overview'].map(releaseTabOf)).toEqual([
      'commits',
      'runs',
      'changes',
      'overview',
    ]);
    expect([null, undefined, '', 'gates'].map(releaseTabOf)).toEqual([
      'overview',
      'overview',
      'overview',
      'overview',
    ]);
  });

  it('counts the commits and the runs where they are known', () => {
    expect(releaseTabs({ commits: 51, runs: 12 }).map((tab) => [tab.label, tab.count])).toEqual([
      ['Overview', undefined],
      ['Commits', 51],
      ['Builds', 12],
      ['Changes', undefined],
    ]);
    expect(releaseTabs({}).every((tab) => tab.count === undefined)).toBe(true);
  });
});
