/**
 * What a reorder list says to a screen reader: the instructions its handles are described by, and
 * what its polite live region announces as a move goes on. Positions are 1-based, as read out. A
 * mouse or touch drop or cancel announces the same outcome as the keyboard's, so every move is
 * heard. `releaseToCancel` is the one shown instead: the label on a touch drag's clone while a
 * release would cancel.
 */
export const REORDER_MESSAGES = {
  instructions: 'Press Space to pick up. Use arrow keys to move, Space to drop, Escape to cancel.',
  pickedUp: (item: string, position: number, total: number, list: string) =>
    `Picked up ${item}. Position ${position} of ${total} in ${list}.`,
  moved: (position: number, total: number) => `Position ${position} of ${total}.`,
  dropped: (item: string, position: number, total: number) =>
    `Dropped ${item} at position ${position} of ${total}.`,
  cancelled: (item: string) => `Move of ${item} cancelled.`,
  releaseToCancel: 'Release to cancel',
} as const;
