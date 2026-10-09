import {
  branchGraph,
  fixedLaneLayout,
  foldChain,
  hasParents,
  type BranchCommit,
} from './branch-graph';

// Pure layout, so hand-built commits in the shape of request dd113f4c: a chain of 23 fold merges
// on release/r1, each merging the newest maintenance/dependencies tip into the previous fold; 25
// bumps on maintenance/dependencies; two ticket branches of one commit each, merged at the first
// fold. Newest first, as git log answers.

function dd113f4c(): BranchCommit[] {
  const commits: BranchCommit[] = [];
  for (let k = 23; k >= 1; k--) {
    commits.push({
      hash: `f${k}`,
      parents: k === 1 ? ['base', 'b3', 't1', 't2'] : [`f${k - 1}`, `b${k + 2}`],
    });
    commits.push({ hash: `b${k + 2}`, parents: [`b${k + 1}`] });
  }
  commits.push({ hash: 'b2', parents: ['b1'] });
  commits.push({ hash: 'b1', parents: ['main-old'] });
  commits.push({ hash: 't2', parents: ['main-old'] });
  commits.push({ hash: 't1', parents: ['main-old'] });
  return commits;
}

const SOURCES = [
  { name: 'maintenance/dependencies', tipSha: 'b25', priority: 'LOWEST' },
  { name: 'ticket/a', tipSha: 't1', priority: 'MEDIUM' },
  { name: 'main', tipSha: 'main-tip', priority: 'MEDIUM' },
  { name: 'ticket/b', tipSha: 't2', priority: 'MEDIUM' },
];

const graphOf = (showEarlierFolds = false) =>
  branchGraph({
    commits: dd113f4c(),
    mergedSha: 'f23',
    backingBranch: 'release/r1',
    sources: SOURCES,
    showEarlierFolds,
  });

describe('branch graph', () => {
  it('needs parents on every commit', () => {
    expect(hasParents([{ parents: ['a'] }, { parents: [] }])).toBe(true);
    expect(hasParents([{ parents: ['a'] }, {}])).toBe(false);
    expect(hasParents([])).toBe(false);
  });

  it('follows the first-parent chain of fold merges from the newest fold', () => {
    const chain = foldChain(dd113f4c(), 'f23');
    expect(chain).toHaveLength(23);
    expect([chain[0], chain[22]]).toEqual(['f23', 'f1']);
  });

  it('prefers the service’s fold marker over the shape when it sends one', () => {
    const commits = [
      { hash: 'f2', parents: ['f1', 'x'], fold: true },
      { hash: 'f1', parents: ['f0', 'y'], fold: false },
    ];
    expect(foldChain(commits, 'f2')).toEqual(['f2']);
  });

  it('gives the backing branch the first lane, then main, then the sources in order', () => {
    expect(graphOf().lanes.map((lane) => lane.label)).toEqual([
      'release/r1',
      'main',
      'maintenance/dependencies',
      'ticket/a',
      'ticket/b',
    ]);
  });

  it('shows the newest fold and counts the 22 earlier ones', () => {
    const graph = graphOf();
    expect(graph.shown).toHaveLength(28);
    expect(graph.shown[0]).toBe('f23');
    expect(graph.shown.filter((hash) => hash.startsWith('f'))).toEqual(['f23']);
    expect([graph.earlierFolds, graph.hiddenFolds]).toEqual([22, 22]);
  });

  it('puts each commit in the lane of the source that reaches it', () => {
    const graph = graphOf();
    const lane = (hash: string) => graph.rows.find((row) => row.hash === hash)?.lane;
    expect(['b25', 'b13', 'b1'].map(lane)).toEqual([2, 2, 2]);
    expect([lane('t1'), lane('t2')]).toEqual([3, 4]);
    expect(lane('f23')).toBe(0);
  });

  it('merges every source lane in the list into the newest fold', () => {
    const [fold, tip] = graphOf().rows;
    expect(fold.edges).toEqual([
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 0, to: 4 },
    ]);
    // The ticket lanes run down past the bumps to their one commit each.
    expect(tip.passing).toEqual([3, 4]);
    expect(tip.incoming).toBe(true);
  });

  it('shows every fold on request, each merging its maintenance tip into the previous fold', () => {
    const graph = graphOf(true);
    expect(graph.rows).toHaveLength(50);
    expect(graph.hiddenFolds).toBe(0);
    const f23 = graph.rows[0];
    expect(f23.edges).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 2 },
    ]);
    const f1 = graph.rows.find((row) => row.hash === 'f1')!;
    expect(f1.edges).toEqual([
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 0, to: 4 },
    ]);
  });

  it('puts a commit no source reaches in a last lane, "other"', () => {
    const graph = branchGraph({
      commits: [
        { hash: 'f', parents: ['p', 'a'] },
        { hash: 'a', parents: [] },
        { hash: 'stray', parents: [] },
      ],
      mergedSha: 'f',
      backingBranch: 'release/r2',
      sources: [{ name: 'feature', tipSha: 'a' }],
    });
    expect(graph.lanes.map((lane) => lane.label)).toEqual(['release/r2', 'feature', 'other']);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 2]);
  });

  it('gives a commit two sources reach in as many steps to the higher priority', () => {
    const graph = branchGraph({
      commits: [
        { hash: 'f', parents: ['p', 'x', 'y'] },
        { hash: 'x', parents: ['shared'] },
        { hash: 'y', parents: ['shared'] },
        { hash: 'shared', parents: [] },
      ],
      mergedSha: 'f',
      backingBranch: 'release/r3',
      sources: [
        { name: 'low', tipSha: 'x', priority: 'LOW' },
        { name: 'high', tipSha: 'y', priority: 'HIGH' },
      ],
    });
    expect(graph.rows.find((row) => row.hash === 'shared')?.lane).toBe(2);
  });

  it('draws a line through a lane to a parent further down, and nothing to one not shown', () => {
    const graph = fixedLaneLayout(
      [
        { hash: 'a', lane: 0, parents: ['c', 'gone'] },
        { hash: 'b', lane: 1, parents: [] },
        { hash: 'c', lane: 0, parents: [] },
      ],
      2,
    );
    expect(graph.rows.map((row) => [row.edges, row.passing, row.incoming, row.below])).toEqual([
      [[{ from: 0, to: 0 }], [], false, [0]],
      [[], [0], false, [0]],
      [[], [], true, []],
    ]);
  });
});
