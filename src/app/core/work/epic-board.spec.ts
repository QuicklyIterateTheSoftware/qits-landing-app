import type { WorkEntry } from './work.consumes';
import { epicBoardCounts, epicBoardRows, hasEpicBoard } from './epic-board';
import { WorkGraph } from './work-tree';

/** Inline entries: the layout is a pure function of the tree. (The pattern's specs use golden masters.) */
let made = 0;
const entry = (id: string, archetype: string, status?: string, parent?: string): WorkEntry => ({
  id,
  qualifiedId: `qits-${++made}`,
  title: id,
  archetype: archetype as WorkEntry['archetype'],
  status: status as WorkEntry['status'],
  parent,
});

describe('epicBoardRows', () => {
  const entries = [
    entry('epic', 'EPIC', 'IMPLEMENTING'),
    entry('f1', 'FEATURE', 'IMPLEMENTING', 'epic'),
    ...['REPORTED', 'REFINED', 'IMPLEMENTING', 'IMPLEMENTED', 'VERIFYING', 'VERIFIED', 'DONE'].map(
      (status) => entry(status, 'TASK', status, 'f1'),
    ),
    entry('dropped', 'TASK', 'DROPPED', 'f1'),
    entry('bare', 'TASK', undefined, 'f1'),
    entry('f2', 'FEATURE', 'DONE', 'epic'),
    entry('under-done', 'TASK', 'IMPLEMENTING', 'f2'),
    entry('f3', 'FEATURE', 'DROPPED', 'epic'),
    entry('under-dropped', 'TASK', 'REFINED', 'f3'),
  ];
  const graph = new WorkGraph(entries);
  const rows = epicBoardRows(graph.nodeOf(entries[0]));
  const shape = rows.map((row) => ({
    row: row.node.entry.id,
    cards: row.cards.map((c) => `${c.node.entry.id}@${c.column}${c.done ? '~' : ''}`),
  }));

  it('puts each task in its column, VERIFIED and DONE (muted) in Verified, and leaves REPORTED and DROPPED out', () => {
    expect(shape[0]).toEqual({
      row: 'f1',
      cards: [
        'REFINED@0',
        'IMPLEMENTING@1',
        'IMPLEMENTED@2',
        'VERIFYING@3',
        'VERIFIED@4',
        'DONE@4~',
        'bare@1',
      ],
    });
  });

  it('takes a DONE feature’s tasks along, and drops a DROPPED feature’s row', () => {
    expect(shape.slice(1)).toEqual([{ row: 'f2', cards: ['under-done@4~'] }]);
  });

  it('counts the cards per column', () => {
    expect(epicBoardCounts(rows)).toEqual([1, 2, 1, 1, 3]);
  });
});

describe('hasEpicBoard', () => {
  it('holds for the board’s statuses only', () => {
    const statuses = [
      'REPORTED',
      'REFINED',
      'IMPLEMENTING',
      'IMPLEMENTED',
      'VERIFYING',
      'VERIFIED',
      'DONE',
      'DROPPED',
    ];
    expect(statuses.filter((status) => hasEpicBoard(entry('e', 'EPIC', status)))).toEqual([
      'REFINED',
      'IMPLEMENTING',
      'IMPLEMENTED',
      'VERIFYING',
    ]);
  });
});
