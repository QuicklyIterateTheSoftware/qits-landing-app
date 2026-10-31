import { reorderAnchor } from './reorder-anchor';

/**
 * The anchor a drop sends (qits-753, qits-1791). Without `rankable` the work lists' cases in
 * `work-reorder.spec.ts` hold; these are the cases a list with unrankable items adds.
 */
describe('reorderAnchor with rankable items', () => {
  // b and d are drawn but cannot be ranked (an archived or DONE idea).
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const rankable = (id: string) => id !== 'b' && id !== 'd';

  it('anchors above the nearest rankable item below the drop', () => {
    expect(reorderAnchor(ids, { from: 4, to: 0 }, rankable)).toEqual({ above: 'a' });
    expect(reorderAnchor(ids, { from: 4, to: 1 }, rankable)).toEqual({ above: 'c' });
  });

  it('anchors below the nearest rankable item above when nothing rankable is below', () => {
    expect(reorderAnchor(ids, { from: 0, to: 4 }, rankable)).toEqual({ below: 'e' });
    expect(reorderAnchor(['a', 'b', 'c'], { from: 0, to: 2 }, rankable)).toEqual({ below: 'c' });
  });

  it('sends nothing for an unrankable item', () => {
    expect(reorderAnchor(ids, { from: 1, to: 4 }, rankable)).toBeUndefined();
  });

  it('sends nothing for a move that only passed unrankable items', () => {
    expect(reorderAnchor(ids, { from: 2, to: 1 }, rankable)).toBeUndefined();
    expect(reorderAnchor(ids, { from: 2, to: 3 }, rankable)).toBeUndefined();
  });

  it('sends nothing when no rankable item is left to anchor to', () => {
    expect(reorderAnchor(['a', 'b'], { from: 0, to: 1 }, rankable)).toBeUndefined();
  });
});
