import type { DomainEvent } from '$core/events/domain-events';

/**
 * qits-workspaces' lifecycle events (qits-1236, its `qits-workspaces-events` vocabulary): an agent
 * placed in a slot, started, refused, requeued, yielded, resumed, obsolete, deferred, removed, or
 * its harness gone; a slot started, failed or removed. Each names its ids flat and top-level, as
 * strings: `agentId`, `workId`, `workspaceId` (the slot's row id, as a string) and `repositoryId`
 * (the wrapper). A field the row does not have (a queued agent's slot) is absent.
 *
 * Since epic qits-1681 also an agent's status: a wait opened, its subject moved, a wait closed, its
 * activity flipped, its attention changed. These five also name the agent's `projectId` (the
 * project's uuid). `AgentNudged` (qits-1460, the nudge an idle agent is handed) names only the
 * lifecycle events' four ids.
 */
export const WORKSPACE_EVENTS = [
  'AgentPlaced',
  'AgentStarted',
  'AgentStartRefused',
  'AgentRequeued',
  'AgentYielded',
  'AgentResumed',
  'AgentObsolete',
  'AgentCleanupDeferred',
  'AgentRemoved',
  'AgentHarnessExited',
  'WorkspaceStarted',
  'WorkspaceFailed',
  'WorkspaceRemoved',
  'AgentWaitOpened',
  'AgentWaitChanged',
  'AgentWaitClosed',
  'AgentActivityChanged',
  'AgentAttentionChanged',
  'AgentNudged',
] as const;

/**
 * The lifecycle events that can change an agent's harness (which command its terminal or chat
 * attaches to, and whether it runs): a start, a refused start, a yield or a resume, its exit, its
 * removal, and its slot's container starting, failing or going. A placement is not among them: it
 * gives the agent a slot, which the agent page reads (`loadAgent`), and the tab follows that slot.
 */
export const HARNESS_EVENTS = [
  'AgentStarted',
  'AgentStartRefused',
  'AgentYielded',
  'AgentResumed',
  'AgentHarnessExited',
  'AgentRemoved',
  'WorkspaceStarted',
  'WorkspaceFailed',
  'WorkspaceRemoved',
] as const satisfies readonly (typeof WORKSPACE_EVENTS)[number][];

/**
 * The lifecycle events that move a runner's slot counts (its live containers, its ACTIVE
 * workspaces): a slot started, failed or removed, and an agent placed (which may open a slot).
 * None names its runner, so a runner list cannot narrow them by id.
 */
export const SLOT_EVENTS = [
  'AgentPlaced',
  'WorkspaceStarted',
  'WorkspaceFailed',
  'WorkspaceRemoved',
] as const satisfies readonly (typeof WORKSPACE_EVENTS)[number][];

/**
 * The lifecycle events that move which work items have an ACTIVE placed agent (qits-workspaces'
 * open work-item workspaces, `listOpenWorkspaces`), the ACTIVE agents (`listAgents?state=ACTIVE`)
 * and an item's placed agents in every state (`listWorkItemWorkspaces`): placed, requeued (its
 * slot taken back), obsolete (no longer ACTIVE), removed. An agent's creation is not announced:
 * a queued agent shows only once it is placed.
 */
export const ACTIVE_AGENT_EVENTS = [
  'AgentPlaced',
  'AgentRequeued',
  'AgentObsolete',
  'AgentRemoved',
] as const satisfies readonly (typeof WORKSPACE_EVENTS)[number][];

/**
 * The events that can change a project's agents as `AgentsStore.loadProjectAgents` reads them
 * (epic qits-1681): their waits (opened, the subject moved, closed), their activity, their
 * attention, a nudge, and which agents are ACTIVE at all (`ACTIVE_AGENT_EVENTS`). The five status
 * events name the `projectId`; the nudge and the lifecycle events name only the agent, its item, its
 * slot and its repository.
 */
export const AGENT_STATUS_EVENTS = [
  'AgentWaitOpened',
  'AgentWaitChanged',
  'AgentWaitClosed',
  'AgentActivityChanged',
  'AgentAttentionChanged',
  'AgentNudged',
  ...ACTIVE_AGENT_EVENTS,
] as const satisfies readonly (typeof WORKSPACE_EVENTS)[number][];

/** How long a burst of lifecycle events waits before the page reads again: at most once a second. */
export const WORKSPACE_REFRESH_DEBOUNCE_MS = 1_000;

/** The ids a lifecycle event's payload names. */
export interface WorkspaceEventIds {
  readonly agentId?: string;
  readonly workId?: string;
  readonly workspaceId?: string;
  readonly repositoryId?: string;
}

/** The ids `event`'s payload names; none when it names none, or is not JSON. */
export function workspaceEventIds(event: DomainEvent): WorkspaceEventIds {
  if (!event.payload) return {};
  try {
    const payload: unknown = JSON.parse(event.payload);
    if (!payload || typeof payload !== 'object') return {};
    const record = payload as Record<string, unknown>;
    const id = (key: string) => {
      const value = record[key];
      return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
    };
    return {
      agentId: id('agentId'),
      workId: id('workId'),
      workspaceId: id('workspaceId'),
      repositoryId: id('repositoryId'),
    };
  } catch {
    return {};
  }
}

/**
 * Whether `event` is about what a page shows: any of `scope`'s ids it names matches. A page names
 * what it is about (a project's wrapper, a slot, an item and its agent's slot), or several such
 * scopes (the wrapper and each agent it lists); an event that names none of them is somebody else's.
 */
export function concerns(
  event: DomainEvent,
  scope: WorkspaceEventIds | readonly WorkspaceEventIds[],
): boolean {
  const ids = workspaceEventIds(event);
  const scopes: readonly WorkspaceEventIds[] = Array.isArray(scope) ? scope : [scope];
  return scopes.some((scope) => matches(ids, scope));
}

function matches(ids: WorkspaceEventIds, scope: WorkspaceEventIds): boolean {
  return (
    (!!scope.repositoryId && ids.repositoryId === scope.repositoryId) ||
    (!!scope.workspaceId && ids.workspaceId === scope.workspaceId) ||
    (!!scope.agentId && ids.agentId === scope.agentId) ||
    (!!scope.workId && ids.workId === scope.workId)
  );
}
