import type { Phase } from './work-tree';

/** One page of the work section, below `/projects/<slug>/work`. */
export interface WorkTab {
  /** The URL segment after `work/`. */
  readonly segment: string;
  readonly label: string;
  /** The phase of work the page lists (`work-tree.ts`). */
  readonly phase: Phase;
}

/**
 * The work section's pages, in the order work moves through them: the backlog, the board, the
 * acceptance list and the archive. `/work` itself opens In Progress.
 */
export const WORK_TABS: readonly WorkTab[] = [
  { segment: 'refinement', label: 'Refinement', phase: 'backlog' },
  { segment: 'in-progress', label: 'In Progress', phase: 'board' },
  { segment: 'acceptance', label: 'Acceptance', phase: 'acceptance' },
  { segment: 'archive', label: 'Archive', phase: 'archive' },
];

/**
 * The segment below `work/` that holds one item's page: `work/detail/<qualified id>`. A segment
 * of its own, so an item's id can never be taken for a tab.
 */
export const WORK_DETAIL = 'detail';
