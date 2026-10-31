/**
 * The geometry of a reorder, shared by every drag engine (the mouse's, and touch's beside it)
 * and by the keyboard mode: pure functions over the items' rects, and the numbers both engines
 * use. Nothing here reads the DOM.
 *
 * A list of `n` items has `n + 1` slots, the gaps an item can land in: slot 0 is above the first
 * item, slot `k` between items `k - 1` and `k`, slot `n` below the last. An item's own two gaps,
 * slots `from` and `from + 1`, both mean "where it already is".
 */

/** The part of an item's rect the geometry reads: its vertical extent. */
export interface SlotRect {
  readonly top: number;
  readonly bottom: number;
}

/**
 * How far the pointer may stray to the left or right of the list's rect and still be over it, in
 * px, so a slightly wobbly vertical drag stays valid.
 */
export const TARGET_SLACK_PX = 24;

/** How close to the top or bottom of the visible area the pointer starts scrolling the page, in px. */
export const EDGE_SCROLL_ZONE_PX = 48;

/** The fastest edge scroll, in px per animation frame, reached at the very edge. */
export const EDGE_SCROLL_MAX_PX = 20;

/**
 * The slot nearest `y`: the number of items whose vertical middle lies above it. So `y` above the
 * first item's middle is slot 0, past the last item's middle slot `n`, and in between it is the
 * gap between the two items nearest it, whatever their heights. An empty list has one slot, 0.
 */
export function slotAt(rects: readonly SlotRect[], y: number): number {
  let slot = 0;
  for (const rect of rects) {
    if (y > (rect.top + rect.bottom) / 2) slot++;
    else break;
  }
  return slot;
}

/**
 * The index an item has after it moves from index `from` into `slot`. Below its own place the
 * item's removal shifts the slot up by one; at or above it the slot is the index. Both of its own
 * slots give `from`: no move.
 */
export function targetIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}

/**
 * The slot an item at `from` lands in to end up at index `to`: the inverse of
 * {@link targetIndex}. For `to === from` it is the gap just above the item.
 */
export function slotFor(from: number, to: number): number {
  return to > from ? to + 1 : to;
}

/**
 * The y at the middle of `slot`'s gap: halfway between the item above it and the item below it,
 * the first item's top for slot 0 and the last item's bottom for slot `n`. An empty list has none.
 */
export function gapY(rects: readonly SlotRect[], slot: number): number | undefined {
  if (rects.length === 0) return undefined;
  if (slot <= 0) return rects[0].top;
  if (slot >= rects.length) return rects[rects.length - 1].bottom;
  return (rects[slot - 1].bottom + rects[slot].top) / 2;
}

/** Whether (`x`, `y`) is over the list's rect, widened by {@link TARGET_SLACK_PX} on either side. */
export function overTarget(
  list: { readonly left: number; readonly right: number } & SlotRect,
  x: number,
  y: number,
): boolean {
  return (
    x >= list.left - TARGET_SLACK_PX &&
    x <= list.right + TARGET_SLACK_PX &&
    y >= list.top &&
    y <= list.bottom
  );
}

/**
 * How far to scroll the page this frame for a pointer at `y`, in px (negative is up), when the
 * visible area runs from `top` (below whatever is pinned there) to `bottom`. Zero outside the two
 * {@link EDGE_SCROLL_ZONE_PX} bands; inside one it grows with the depth into the band, up to
 * {@link EDGE_SCROLL_MAX_PX} at the edge and beyond it.
 */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
  const speed = (depth: number) =>
    Math.ceil(Math.min(1, depth / EDGE_SCROLL_ZONE_PX) * EDGE_SCROLL_MAX_PX);
  if (y < top + EDGE_SCROLL_ZONE_PX) return -speed(top + EDGE_SCROLL_ZONE_PX - y);
  if (y > bottom - EDGE_SCROLL_ZONE_PX) return speed(y - (bottom - EDGE_SCROLL_ZONE_PX));
  return 0;
}
