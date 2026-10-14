/** One tab of a work item's agent page, a child route of `…/work/detail/<qualified id>/agent`. */
export interface AgentTab {
  /** The URL segment after `agent/`. */
  readonly segment: string;
  readonly label: string;
}

/**
 * The agent page's tabs (epic qits-1230), in the order they show, as qits-workspaces-frontend's
 * (Files comes with its slice): a tab is an entry here and a child route in `app.routes.ts`.
 */
export const AGENT_TABS: readonly AgentTab[] = [
  { segment: 'chat', label: 'Chat' },
  { segment: 'terminal', label: 'Terminal' },
];
