/**
 * Which list a work item is in: a phase's, work in any phase each with its own status (`mixed`: the
 * In Progress page's agents' earlier and later work), or the board's tree
 * stacked (`board`: In Progress below `md`, where the board's columns do not fit, qits-1861).
 */
export type WorkListView = 'backlog' | 'board' | 'acceptance' | 'archive' | 'mixed';
