import type { WorkGraph } from './work-tree';

/** One page of the work section, below `/projects/<slug>/work`. */
export interface WorkTab {
  /** The URL segment after `work/`. */
  readonly segment: string;
  readonly label: string;
  /** The number the tab shows once the work is loaded. */
  readonly count: (graph: WorkGraph) => number;
}

/**
 * The work section's pages: first the open campaigns, which span the phases, then the phases in the
 * order work moves through them: the backlog, the board, the acceptance list and the archive.
 * `/work` itself opens In Progress.
 */
export const WORK_TABS: readonly WorkTab[] = [
  { segment: 'campaigns', label: 'Campaigns', count: (graph) => graph.openCampaigns().length },
  { segment: 'refinement', label: 'Refinement', count: (graph) => graph.count('backlog') },
  { segment: 'in-progress', label: 'In Progress', count: (graph) => graph.count('board') },
  { segment: 'acceptance', label: 'Acceptance', count: (graph) => graph.count('acceptance') },
  {
    segment: 'archive',
    label: 'Archive',
    // The page shows the archived campaigns too, so the count does.
    count: (graph) => graph.count('archive') + graph.archivedCampaigns().length,
  },
];

/**
 * The segment below `work/` that holds one item's page: `work/detail/<qualified id>`. A segment
 * of its own, so an item's id can never be taken for a tab.
 */
export const WORK_DETAIL = 'detail';
