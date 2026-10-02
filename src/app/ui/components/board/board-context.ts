import { InjectionToken } from '@angular/core';

/**
 * Where a board child sits: the board's column count, and the absolute column its grid starts at
 * (0 for the board itself, a lane's `from` inside a lane). A child turns its absolute columns into
 * lines of the grid it is in. Absent outside a board: lanes then lay out as plain groups.
 */
export interface BoardContext {
  readonly columnCount: () => number;
  readonly offset: () => number;
}

export const BOARD_CONTEXT = new InjectionToken<BoardContext>('BOARD_CONTEXT');

/** The CSS `grid-column` value for absolute columns `from`..`to` inside `context`. */
export function gridColumn(context: BoardContext, from: number, to: number): string {
  const start = from - context.offset() + 1;
  return `${start} / span ${Math.max(1, to - from + 1)}`;
}
