import type { DomainEvent } from '$core/events/domain-events';

/**
 * qits-workspaces' lifecycle events (qits-1236, its `qits-workspaces-events` vocabulary): an agent
 * placed in a slot, started, refused, requeued, yielded, resumed, obsolete, deferred, removed, or
 * its harness gone; a slot started, failed or removed. Each names its ids flat and top-level, as
 * strings: `agentId`, `workId`, `workspaceId` (the slot's row id, as a string) and `repositoryId`
 * (the wrapper). A field the row does not have (a queued agent's slot) is absent.
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
] as const;

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
 * what it is about (a project's wrapper, a slot, an item and its agent's slot); an event that names
 * none of them is somebody else's.
 */
export function concerns(event: DomainEvent, scope: WorkspaceEventIds): boolean {
  const ids = workspaceEventIds(event);
  return (
    (!!scope.repositoryId && ids.repositoryId === scope.repositoryId) ||
    (!!scope.workspaceId && ids.workspaceId === scope.workspaceId) ||
    (!!scope.agentId && ids.agentId === scope.agentId) ||
    (!!scope.workId && ids.workId === scope.workId)
  );
}
