/**
 * What a reorder list says to a screen reader: the instructions its handles are described by, and
 * what its polite live region announces as a move goes on. Positions are 1-based, as read out. A
 * mouse drop or cancel announces the same outcome as the keyboard's, so every move is heard.
 */
export const REORDER_MESSAGES = {
  instructions: 'Press Space to pick up. Use arrow keys to move, Space to drop, Escape to cancel.',
  pickedUp: (item: string, position: number, total: number, list: string) =>
    `Picked up ${item}. Position ${position} of ${total} in ${list}.`,
  moved: (position: number, total: number) => `Position ${position} of ${total}.`,
  dropped: (item: string, position: number, total: number) =>
    `Dropped ${item} at position ${position} of ${total}.`,
  cancelled: (item: string) => `Move of ${item} cancelled.`,
} as const;
