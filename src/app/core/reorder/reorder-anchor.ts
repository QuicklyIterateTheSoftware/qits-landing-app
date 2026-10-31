/**
 * The index-to-anchor translation of a dragged list (qits-753, generalised for ideas in
 * qits-1791): a reorder list reports a drop as the item's index before and after it, and the
 * service's drop doors (`reprioritizeWork`, `reprioritizeIdea`) take where the item now sits,
 * directly above or directly below another one.
 */

/** A list's move: the item's index among the list's drawn items before it, and after it. */
export interface ReorderIndexMove {
  readonly from: number;
  readonly to: number;
}

/** Where a dropped item now sits: directly above one item, or directly below one. */
export type ReorderAnchor = { readonly above: string } | { readonly below: string };

/**
 * Where the item moved in `move` sits after it, among `ids` (the list's drawn items, in order,
 * before the move): directly above the nearest item below it, or, with none below, directly below
 * the nearest item above it. None for no move (`from === to`), an index outside the list, or a list
 * of one.
 *
 * With `rankable`, only the ids it accepts count as neighbours, and the moved item must be one: a
 * list can draw items the service does not rank (an archived or DONE idea), and an anchor naming
 * one would be refused. A move that leaves the rankable ids in the same order (one that only
 * passed unrankable items) is no move.
 */
export function reorderAnchor(
  ids: readonly string[],
  move: ReorderIndexMove,
  rankable: (id: string) => boolean = () => true,
): ReorderAnchor | undefined {
  const { from, to } = move;
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return undefined;
  const moved = ids[from];
  if (!rankable(moved)) return undefined;
  const after = ids.filter((_, index) => index !== from);
  after.splice(to, 0, moved);
  const before = ids.filter(rankable);
  const ranked = after.filter(rankable);
  if (ranked.every((id, index) => id === before[index])) return undefined;
  const below = after.slice(to + 1).find(rankable);
  if (below !== undefined) return { above: below };
  const above = after.slice(0, to).reverse().find(rankable);
  return above !== undefined ? { below: above } : undefined;
}
