import type { WorkNode } from './work-tree';

/** A top-level node as drawn (on the board or in a list), and whether it is on its way out. */
export interface RowState {
  readonly node: WorkNode;
  readonly leaving: boolean;
}

/**
 * The rows to draw for the tree `next`, given those drawn before: `next`'s nodes in its order,
 * and every node drawn before that `next` no longer has, still in its place, marked leaving.
 */
export function withLeaving(
  previous: readonly RowState[],
  next: readonly WorkNode[],
): readonly RowState[] {
  const nextIds = new Set(next.map((node) => node.entry.id));
  const rows: RowState[] = next.map((node) => ({ node, leaving: false }));
  previous.forEach((row, index) => {
    if (nextIds.has(row.node.entry.id)) return;
    rows.splice(Math.min(index, rows.length), 0, { node: row.node, leaving: true });
  });
  return rows;
}
