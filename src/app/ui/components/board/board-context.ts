import { InjectionToken } from '@angular/core';

/**
 * Where a board child sits. The board's grid is its optional gutters (a narrow column on each
 * side) around its `columnCount` status columns. Children name status columns (0-based); the
 * context turns them into lines of the grid the child is in:
 *
 * - `lead`: how many gutter columns precede the status columns (0 or 1), the same everywhere;
 * - `offset`: the grid column (0 = the gutter, or the first status column without one) at which
 *   the child's own grid starts: 0 for the board and a full-width lane, `lead` for a row.
 *
 * `onBoard` is false for a lane laid out off a board: its children are off the board too.
 */
export interface BoardContext {
  readonly onBoard: boolean;
  readonly lead: () => number;
  readonly offset: () => number;
  readonly columnCount: () => number;
}

export const BOARD_CONTEXT = new InjectionToken<BoardContext>('BOARD_CONTEXT');

/** The CSS `grid-column` for status columns `from`..`to` inside `context`. */
export function gridColumn(context: BoardContext, from: number, to: number): string {
  const start = from + context.lead() - context.offset() + 1;
  return `${start} / span ${Math.max(1, to - from + 1)}`;
}
