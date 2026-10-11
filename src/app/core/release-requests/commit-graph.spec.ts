import { inferLanes, layoutGraph, sourceLabels } from './commit-graph';

// Pure layout, so hand-built commits.

describe('commit graph', () => {
  it('keeps a straight history in one lane', () => {
    const graph = layoutGraph([
      { hash: 'c', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: ['root-outside'] },
    ]);
    expect(graph.width).toBe(1);
    expect(graph.rows.map((row) => [row.lane, row.incoming, row.edges])).toEqual([
      [0, false, [{ from: 0, to: 0 }]],
      [0, true, [{ from: 0, to: 0 }]],
      [0, true, []],
    ]);
  });

  it('opens a lane per merged branch and closes it where the branch began', () => {
    // m merges x (main) and f2 (a feature); f2 → f1 → x.
    const graph = layoutGraph([
      { hash: 'm', parents: ['x', 'f2'] },
      { hash: 'f2', parents: ['f1'] },
      { hash: 'f1', parents: ['x'] },
      { hash: 'x', parents: [] },
    ]);
    expect(graph.width).toBe(2);
    const [m, f2, f1, x] = graph.rows;
    expect(m.edges).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
    ]);
    expect([f2.lane, f2.passing]).toEqual([1, [0]]);
    expect(f1.lane).toBe(1);
    expect([x.lane, x.converging]).toEqual([0, [1]]);
    expect(x.below).toEqual([]);
  });

  it('reuses a freed lane for the next line that needs one', () => {
    const graph = layoutGraph([
      { hash: 'a', parents: [] },
      { hash: 'b', parents: [] },
    ]);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0]);
    expect(graph.width).toBe(1);
  });

  it('guesses lanes without parents: the fold’s merges, then one lane per author', () => {
    const lanes = inferLanes(
      [
        { hash: 'm2', author: 'qits-projects', message: 'Release request r1: bump' },
        { hash: 'b2', author: 'maint', message: 'bump(dependencies): 5' },
        { hash: 't1', author: 'agent', message: 'fix: x' },
        { hash: 'm1', author: 'qits-projects', message: 'Release request r1: bump' },
        { hash: 'b1', author: 'maint', message: 'bump(dependencies): 4' },
      ],
      'release/r1',
    );
    expect(lanes.commits).toEqual([
      { hash: 'm2', parents: ['m1'] },
      { hash: 'b2', parents: ['b1'] },
      { hash: 't1', parents: [] },
      { hash: 'm1', parents: [] },
      { hash: 'b1', parents: [] },
    ]);
    expect([...lanes.labels]).toEqual(
      expect.arrayContaining([
        ['m2', 'release/r1'],
        ['b2', 'by maint'],
        ['t1', 'by agent'],
      ]),
    );
    expect(layoutGraph(lanes.commits).rows.map((row) => row.lane)).toEqual([0, 1, 2, 0, 1]);
  });

  it('names the lanes of an octopus fold by its sources, in order', () => {
    const labels = sourceLabels({ hash: 'f', parents: ['p0', 'p1', 'p2'] }, 'release/r1', [
      'main',
      'ticket/x',
    ]);
    expect([...labels]).toEqual([
      ['f', 'release/r1'],
      ['p1', 'main'],
      ['p2', 'ticket/x'],
    ]);
    expect([...sourceLabels(undefined, 'release/r1', [])]).toEqual([]);
  });
});
