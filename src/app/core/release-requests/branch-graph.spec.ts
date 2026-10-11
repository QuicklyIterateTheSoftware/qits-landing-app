import {
  branchGraph,
  fixedLaneLayout,
  foldChain,
  guessedGraph,
  hasParents,
  type BranchCommit,
} from './branch-graph';

// Pure layout, so hand-built commits in the shape of request dd113f4c: a chain of 23 fold merges
// on release/r1, each merging the newest maintenance/dependencies tip into the previous fold; 25
// bumps on maintenance/dependencies; two ticket branches of one commit each, merged at the first
// fold; main's tip is the base, outside the list. Newest first, as git log answers.

function dd113f4c(): BranchCommit[] {
  const commits: BranchCommit[] = [];
  for (let k = 23; k >= 1; k--) {
    commits.push({
      hash: `f${k}`,
      parents: k === 1 ? ['base', 'b3', 't1', 't2'] : [`f${k - 1}`, `b${k + 2}`],
      fold: true,
    });
    commits.push({ hash: `b${k + 2}`, parents: [`b${k + 1}`], fold: false });
  }
  commits.push({ hash: 'b2', parents: ['b1'], fold: false });
  commits.push({ hash: 'b1', parents: ['main-old'], fold: false });
  commits.push({ hash: 't2', parents: ['main-old'], fold: false });
  commits.push({ hash: 't1', parents: ['main-old'], fold: false });
  return commits;
}

const SOURCES = [
  { name: 'main', tipSha: 'main-tip' },
  { name: 'maintenance/dependencies', tipSha: 'b25' },
  { name: 'ticket/a', tipSha: 't1' },
  { name: 'ticket/b', tipSha: 't2' },
];

const graphOf = (showEarlierFolds = false, sources = SOURCES) =>
  branchGraph({
    commits: dd113f4c(),
    mergedSha: 'f23',
    backingBranch: 'release/r1',
    sources,
    showEarlierFolds,
  });

const sorted = <T>(list: readonly T[]) => [...list].sort((a, b) => (`${a}` < `${b}` ? -1 : 1));

describe('branch graph', () => {
  it('needs parents on every commit', () => {
    expect(hasParents([{ parents: ['a'] }, { parents: [] }])).toBe(true);
    expect(hasParents([{ parents: ['a'] }, {}])).toBe(false);
    expect(hasParents([])).toBe(false);
  });

  it('follows the chain of fold merges from the newest fold, by the service’s marker', () => {
    const chain = foldChain(dd113f4c(), 'f23');
    expect([chain.length, chain[0], chain[22]]).toEqual([23, 'f23', 'f1']);
    expect(
      foldChain(
        [
          { hash: 'f2', parents: ['f1', 'x'], fold: true },
          { hash: 'f1', parents: ['f0', 'y'], fold: false },
        ],
        'f2',
      ),
    ).toEqual(['f2']);
  });

  it('gives lanes to the backing branch and the sources that own commits; main has none', () => {
    const graph = graphOf();
    expect(graph.lanes.map((lane) => lane.label)).toEqual([
      'release/r1',
      'maintenance/dependencies',
      'ticket/a',
      'ticket/b',
    ]);
    expect(graph.emptySources).toEqual(['main']);
  });

  it('shows the newest fold and counts the 22 earlier ones', () => {
    const graph = graphOf();
    expect(graph.shown).toHaveLength(28);
    expect(graph.shown.filter((hash) => hash.startsWith('f'))).toEqual(['f23']);
    expect([graph.earlierFolds, graph.hiddenFolds]).toEqual([22, 22]);
  });

  it('puts each commit in the lane of the first source whose tip reaches it', () => {
    const graph = graphOf();
    const lane = (hash: string) => graph.rows.find((row) => row.hash === hash)?.lane;
    expect(['f23', 'b25', 'b13', 'b1', 't1', 't2'].map(lane)).toEqual([0, 1, 1, 1, 2, 3]);
  });

  it('pulls every source lane into the newest fold', () => {
    const [fold] = graphOf().rows;
    expect(sorted(fold.edges.map((edge) => `${edge.from}→${edge.to}`))).toEqual([
      '0→1',
      '0→2',
      '0→3',
    ]);
    expect(graphOf().notYetFolded.size).toBe(0);
  });

  it('shows every fold on request, each merging its tip into the previous fold', () => {
    const graph = graphOf(true);
    expect([graph.rows.length, graph.hiddenFolds]).toEqual([50, 0]);
    expect(graph.rows[0].edges).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
    ]);
    const f1 = graph.rows.find((row) => row.hash === 'f1')!;
    expect(sorted(f1.edges.map((edge) => edge.to))).toEqual([1, 2, 3]);
  });

  it('says a tip pushed after the newest fold is not yet folded', () => {
    const commits = [{ hash: 'b26', parents: ['b25'], fold: false }, ...dd113f4c()];
    const graph = branchGraph({
      commits,
      mergedSha: 'f23',
      backingBranch: 'release/r1',
      sources: SOURCES.map((s) => (s.tipSha === 'b25' ? { ...s, tipSha: 'b26' } : s)),
    });
    expect([...graph.notYetFolded]).toEqual(['b26']);
    expect(graph.rows.find((row) => row.hash === 'b26')?.lane).toBe(1);
  });

  it('gives a commit two sources reach to the earlier source', () => {
    const graph = branchGraph({
      commits: [
        { hash: 'f', parents: ['x', 'y'], fold: true },
        { hash: 'x', parents: ['shared'], fold: false },
        { hash: 'y', parents: ['shared'], fold: false },
        { hash: 'shared', parents: [], fold: false },
      ],
      mergedSha: 'f',
      backingBranch: 'release/r3',
      sources: [
        { name: 'first', tipSha: 'x' },
        { name: 'second', tipSha: 'y' },
      ],
    });
    expect(graph.rows.find((row) => row.hash === 'shared')?.lane).toBe(1);
  });

  it('puts a commit no source reaches in a last lane, "other"', () => {
    const graph = branchGraph({
      commits: [
        { hash: 'f', parents: ['p', 'a'], fold: true },
        { hash: 'a', parents: [], fold: false },
        { hash: 'stray', parents: [], fold: false },
      ],
      mergedSha: 'f',
      backingBranch: 'release/r2',
      sources: [{ name: 'feature', tipSha: 'a' }],
    });
    expect(graph.lanes.map((lane) => lane.label)).toEqual(['release/r2', 'feature', 'other']);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 1, 2]);
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

describe('guessed graph', () => {
  it('lists the commits in one lane under the backing branch; every source is laneless', () => {
    const graph = guessedGraph({
      commits: [{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }],
      backingBranch: 'release/r1',
      sources: [{ name: 'main' }, { name: 'maintenance/dependencies' }],
    });
    expect(graph.lanes.map((lane) => lane.label)).toEqual(['release/r1']);
    expect(graph.emptySources).toEqual(['main', 'maintenance/dependencies']);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0]);
  });
});
