/**
 * Which list a work item is in: a phase's, a campaign's members (`campaign`), or the board's tree
 * stacked (`board`: In Progress below `md`, where the board's columns do not fit, qits-1861).
 */
export type WorkListView = 'backlog' | 'board' | 'acceptance' | 'archive' | 'campaign';
