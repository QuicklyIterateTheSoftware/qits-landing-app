import type { WorkNode } from '../../../core/work/work-tree';
import { withLeaving } from './project-work';

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
