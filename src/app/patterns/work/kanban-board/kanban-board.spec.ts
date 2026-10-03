import type { WorkNode } from '$core/work/work-tree';
import { columnCounts, withLeaving } from './kanban-board';

/** A bare node: only its id matters here. */
const node = (id: string): WorkNode => ({
  entry: { id, qualifiedId: id, title: id, archetype: 'EPIC' },
  children: [],
  context: false,
  campaigns: [],
});

const ids = (rows: ReturnType<typeof withLeaving>) =>
  rows.map((row) => `${row.node.entry.id}${row.leaving ? '…' : ''}`);

describe('withLeaving', () => {
  it('draws the tree as it is on first sight', () => {
    expect(ids(withLeaving([], [node('a'), node('b')]))).toEqual(['a', 'b']);
  });

  it('keeps a node that left in its place, marked leaving', () => {
    const before = withLeaving([], [node('a'), node('b'), node('c')]);
    expect(ids(withLeaving(before, [node('a'), node('c')]))).toEqual(['a', 'b…', 'c']);
  });

  it('adds new nodes in the tree’s order', () => {
    const before = withLeaving([], [node('a')]);
    expect(ids(withLeaving(before, [node('n'), node('a')]))).toEqual(['n', 'a']);
  });
});

describe('columnCounts', () => {
  const at = (id: string, column: number | undefined, children: WorkNode[] = [], context = false) =>
    ({ ...node(id), column, children, context }) as WorkNode;

  it('counts every item in its column, nested ones too, but not context', () => {
    const tree = [
      at('epic', 0, [at('feature', 1, [at('task-a', 1), at('task-b', 2)])]),
      at('parent', undefined, [at('child', 2)], true),
      at('ticket', 2),
    ];
    expect(columnCounts(tree)).toEqual([1, 2, 3]);
  });
});
