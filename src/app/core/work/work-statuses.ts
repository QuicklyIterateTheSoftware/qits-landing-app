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
 * on. VERIFIED work is done with that: it waits in the Acceptance list above the board. Which
 * column an entity sits in, and which work is on the board at all, is `WorkGraph`'s business
 * (`work-tree.ts`); the index here is that column.
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
    status: 'READY_FOR_DEV',
    label: 'Ready for Dev',
    body: 'bg-charcoal-brown-300',
    header: 'bg-charcoal-brown-400 text-charcoal-brown-950',
    cardBorder: 'border-charcoal-brown-400',
  },
  {
    status: 'IMPLEMENTING',
    label: 'Implementing',
    body: 'bg-cinnabar-200',
    header: 'bg-cinnabar-300 text-cinnabar-950',
    cardBorder: 'border-cinnabar-300',
  },
  {
    status: 'IMPLEMENTED',
    label: 'Implemented',
    body: 'bg-sunflower-gold-300',
    header: 'bg-sunflower-gold-400 text-sunflower-gold-950',
    cardBorder: 'border-sunflower-gold-400',
  },
  {
    status: 'VERIFYING',
    label: 'Verifying',
    body: 'bg-mint-leaf-300',
    header: 'bg-mint-leaf-400 text-mint-leaf-950',
    cardBorder: 'border-mint-leaf-400',
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
    body: 'bg-mint-leaf-500',
    header: 'bg-mint-leaf-600 text-mint-leaf-950',
    cardBorder: 'border-mint-leaf-600',
  },
];

/** The statuses for which an epic is drawn with its own board: those of the board's columns. */
export const EPIC_BOARD_STATUSES: ReadonlySet<string> = new Set(BOARD_COLUMNS.map((c) => c.status));
