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
 * The board's columns, left to right: the statuses work moves through once a person scheduled it
 * (READY_FOR_DEV, the first column) and while it is being worked on. REFINED work waits on the
 * Schedule tab, not here (qits-887). VERIFIED work is done with that: it waits in the Acceptance list above the board. Which
 * column an entity sits in, and which work is on the board at all, is `WorkGraph`'s business
 * (`work-tree.ts`); the index here is that column.
 */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: 'READY_FOR_DEV',
    label: 'Ready for Dev',
    body: 'bg-surface-muted',
    header: 'bg-surface-active text-fg',
    cardBorder: 'border-line-strong',
  },
  {
    status: 'IMPLEMENTING',
    label: 'Implementing',
    body: 'bg-danger-soft',
    header: 'bg-danger-line text-danger-strong',
    cardBorder: 'border-danger-line',
  },
  {
    status: 'IMPLEMENTED',
    label: 'Implemented',
    body: 'bg-warning-soft',
    header: 'bg-warning-line text-warning-strong',
    cardBorder: 'border-warning-line',
  },
  {
    status: 'VERIFYING',
    label: 'Verifying',
    body: 'bg-success-soft',
    header: 'bg-success-line text-success-strong',
    cardBorder: 'border-success-line',
  },
];

/**
 * An epic's own board (`app-epic-board`): the board's columns, then Verified, the green of the
 * verified tile one step darker than Verifying. VERIFIED and DONE tasks sit there.
 */
export const EPIC_BOARD_COLUMNS: readonly BoardColumn[] = [
  ...BOARD_COLUMNS,
  {
    status: 'VERIFIED',
    label: 'Verified',
    body: 'bg-success',
    header: 'bg-success text-fg-on-accent',
    cardBorder: 'border-success',
  },
];

/** The statuses for which an epic is drawn with its own board: those of the board's columns. */
export const EPIC_BOARD_STATUSES: ReadonlySet<string> = new Set(BOARD_COLUMNS.map((c) => c.status));
