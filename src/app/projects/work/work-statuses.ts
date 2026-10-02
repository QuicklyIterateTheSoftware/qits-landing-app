import type { WorkEntry } from '../../core/projects/projects.consumes';

/** One column of the Work board: a status and its heading. */
export interface BoardColumn {
  readonly status: string;
  readonly label: string;
}

/**
 * The board's columns, left to right: the statuses work moves through while it is being worked
 * on. "Implementing" goes between Refined and Implemented once qits-projects has that status.
 */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { status: 'REFINED', label: 'Refined' },
  { status: 'IMPLEMENTED', label: 'Implemented' },
  { status: 'VERIFIED', label: 'Verified' },
];

/** The Backlog: work not refined yet. */
export const BACKLOG_STATUSES: readonly string[] = ['REPORTED'];

/** The Archive: work in a final state. */
export const ARCHIVE_STATUSES: readonly string[] = ['DONE', 'DROPPED'];

/**
 * The entries whose status is one of `statuses`, in the order qits-projects lists them (tree
 * order). Features and tasks have no status, so they fall into no group: they appear nowhere for
 * now.
 */
export function withStatus(
  entries: readonly WorkEntry[],
  statuses: readonly string[],
): readonly WorkEntry[] {
  return entries.filter((entry) => entry.status !== undefined && statuses.includes(entry.status));
}
