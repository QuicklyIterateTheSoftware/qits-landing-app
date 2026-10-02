import type { WorkEntry } from '../projects/projects.consumes';

/**
 * One column of the Work board: a status, its heading, and its colours. The classes are written
 * out in full so that Tailwind finds them: the column's body, its header, and its cards' border.
 */
export interface BoardColumn {
  readonly status: string;
  readonly label: string;
  readonly body: string;
  readonly header: string;
  readonly cardBorder: string;
}

/**
 * The board's columns, left to right: the statuses work moves through while it is being worked
 * on. "Implementing" goes between Refined and Implemented once qits-projects has that status.
 */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: 'REFINED',
    label: 'Refined',
    body: 'bg-ocean-deep-300',
    header: 'bg-ocean-deep-400 text-ocean-deep-950',
    cardBorder: 'border-ocean-deep-400',
  },
  {
    status: 'IMPLEMENTED',
    label: 'Implemented',
    body: 'bg-sunflower-gold-300',
    header: 'bg-sunflower-gold-400 text-sunflower-gold-950',
    cardBorder: 'border-sunflower-gold-400',
  },
  {
    status: 'VERIFIED',
    label: 'Verified',
    body: 'bg-mint-leaf-300',
    header: 'bg-mint-leaf-400 text-mint-leaf-950',
    cardBorder: 'border-mint-leaf-400',
  },
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
