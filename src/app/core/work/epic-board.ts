import type { WorkEntry } from './work.consumes';
import type { WorkNode } from './work-tree';
import { EPIC_BOARD_COLUMNS, EPIC_BOARD_STATUSES } from './work-statuses';

/**
 * An epic laid out on its own board (`app-epic-board`): one row per child (its features), each
 * with its tasks as cards in `EPIC_BOARD_COLUMNS`. A child without a status takes its parent's,
 * and a DONE or DROPPED feature takes its tasks with it, as `WorkGraph` does.
 *
 * - READY_FOR_DEV to VERIFYING: their own column; VERIFIED: the Verified column;
 * - DONE: the Verified column too, drawn muted (`done`): past verified, and still part of the epic;
 * - REPORTED (not yet refined), REFINED (not yet scheduled) and DROPPED: not on the board. A DROPPED feature has no row.
 */

const COLUMN_BY_STATUS: Readonly<Record<string, number>> = {
  ...Object.fromEntries(EPIC_BOARD_COLUMNS.map((column, index) => [column.status, index])),
  DONE: EPIC_BOARD_COLUMNS.length - 1,
};

/** Statuses that take every item below them along. */
const FINAL: ReadonlySet<string> = new Set(['DONE', 'DROPPED']);

export interface EpicBoardCard {
  readonly node: WorkNode;
  readonly column: number;
  /** Its status is DONE: drawn muted. */
  readonly done: boolean;
}

export interface EpicBoardRow {
  readonly node: WorkNode;
  readonly cards: readonly EpicBoardCard[];
}

/** Whether an epic in this status is drawn with its own board. */
export function hasEpicBoard(entry: WorkEntry): boolean {
  return !!entry.status && EPIC_BOARD_STATUSES.has(entry.status);
}

/** The status `node` counts with: its parent's when that is final or it has none of its own. */
function statusIn(node: WorkNode, parent: string | undefined): string | undefined {
  return parent && FINAL.has(parent) ? parent : (node.entry.status ?? parent);
}

/** The rows of `epic`'s board, in tree order. */
export function epicBoardRows(epic: WorkNode): readonly EpicBoardRow[] {
  const own = epic.entry.status;
  return epic.children
    .map((child) => ({ child, status: statusIn(child, own) }))
    .filter(({ status }) => status !== 'DROPPED')
    .map(({ child, status }) => ({ node: child, cards: cardsOf(child, status) }));
}

function cardsOf(feature: WorkNode, status: string | undefined): EpicBoardCard[] {
  const cards: EpicBoardCard[] = [];
  for (const task of feature.children) {
    const own = statusIn(task, status);
    const column = own === undefined ? undefined : COLUMN_BY_STATUS[own];
    if (column !== undefined) cards.push({ node: task, column, done: own === 'DONE' });
  }
  return cards;
}

/** How many cards each column of the board holds. */
export function epicBoardCounts(rows: readonly EpicBoardRow[]): readonly number[] {
  const counts = EPIC_BOARD_COLUMNS.map(() => 0);
  for (const row of rows) for (const card of row.cards) counts[card.column]++;
  return counts;
}
