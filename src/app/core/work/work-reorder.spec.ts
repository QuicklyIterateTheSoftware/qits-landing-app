import type { WorkNode } from './work-tree';
import { movable, reorderAnchor } from './work-reorder';

/** The anchor a drop sends, and which nodes can be dragged (qits-753): pure functions. */
describe('reorderAnchor', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('anchors above the item now below the moved one', () => {
    expect(reorderAnchor(ids, { from: 3, to: 0 })).toEqual({ above: 'a' });
    expect(reorderAnchor(ids, { from: 0, to: 2 })).toEqual({ above: 'd' });
    expect(reorderAnchor(ids, { from: 2, to: 1 })).toEqual({ above: 'b' });
  });

  it('anchors below the item now above it when moved to the end', () => {
    expect(reorderAnchor(ids, { from: 0, to: 3 })).toEqual({ below: 'd' });
    expect(reorderAnchor(ids, { from: 1, to: 3 })).toEqual({ below: 'd' });
    expect(reorderAnchor(['a', 'b'], { from: 0, to: 1 })).toEqual({ below: 'b' });
  });

  it('sends nothing for no move or an index outside the list', () => {
    expect(reorderAnchor(ids, { from: 2, to: 2 })).toBeUndefined();
    expect(reorderAnchor(ids, { from: 4, to: 0 })).toBeUndefined();
    expect(reorderAnchor(ids, { from: 0, to: 4 })).toBeUndefined();
    expect(reorderAnchor(ids, { from: -1, to: 0 })).toBeUndefined();
    expect(reorderAnchor(['a'], { from: 0, to: 0 })).toBeUndefined();
  });
});

describe('movable', () => {
  const node = (status: string, context = false) =>
    ({
      entry: { id: 'x', qualifiedId: 'qits-1', status },
      children: [],
      context,
      campaigns: [],
      tasks: { verified: 0, total: 0 },
    }) as unknown as WorkNode;

  it('drags open work of the list’s own phase only', () => {
    expect(
      ['REPORTED', 'REFINED', 'IMPLEMENTING', 'VERIFIED'].map((s) => movable(node(s))),
    ).toEqual([true, true, true, true]);
    expect(movable(node('DONE'))).toBe(false);
    expect(movable(node('DROPPED'))).toBe(false);
    expect(movable(node('REPORTED', true))).toBe(false);
  });
});
