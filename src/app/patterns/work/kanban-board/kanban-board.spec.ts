import type { WorkNode } from '$core/work/work-tree';
import { columnCounts } from './kanban-board';

/** A bare node: only its id matters here. */
const node = (id: string): WorkNode => ({
  entry: { id, qualifiedId: id, title: id, archetype: 'EPIC' },
  children: [],
  context: false,
  campaigns: [],
  tasks: { columns: [0, 0, 0, 0], verified: 0, total: 0 },
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
    expect(columnCounts(tree)).toEqual([1, 2, 3, 0]);
  });
});
