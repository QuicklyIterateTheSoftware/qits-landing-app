import { computed, type DestroyRef } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listAgents, listOpenWorkspaces, listWorkItemWorkspaces } from '../../api/workspaces';
import { injectRefreshOn } from '$core/events/refresh-on';
import { ACTIVE_AGENT_EVENTS } from './workspace-events';
import {
  LIST_ACTIVE_AGENTS,
  LIST_OPEN_WORKSPACES,
  LIST_WORK_ITEM_WORKSPACES,
  type WorkspaceHistoryEntry,
} from './workspaces.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** One work item's workspaces, as `loadHistory(workRef)` left them. */
export interface WorkspaceHistory {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Every state (ACTIVE, INTEGRATED, ABANDONED), newest first. */
  readonly entries: readonly WorkspaceHistoryEntry[];
}

interface WorkspacesState {
  readonly status: Status;
  /** The ids of the work items (qits-projects' entity ids) that have an ACTIVE workspace. */
  readonly openWorkIds: readonly string[];
  /** How far `loadAgents()` got. */
  readonly agentsStatus: Status;
  /** The ids of the work items (qits-projects' entity ids) an ACTIVE agent works on. */
  readonly agentWorkIds: readonly string[];
  /** Each item's workspaces, by the reference they were read with. */
  readonly history: Readonly<Record<string, WorkspaceHistory>>;
}

/**
 * The workspaces qits-workspaces holds for work items (epic qits-112).
 *
 * - `load()` reads the platform's ACTIVE workspaces that are bound to a work item, once, and again
 *   after an error. The work pages call it, in the browser, one request per page; the cards then
 *   ask `hasOpen(workId)` and cost nothing.
 * - `loadAgents()` reads the platform's ACTIVE agents, once, and again after an error: the In
 *   Progress tab shows every item an agent works on, whatever its status. `agentSet` holds their
 *   items' ids. A failed read (a visitor whose roles do not reach the door) leaves it empty.
 * - `refresh()` reads them again (those already read), keeping the last good answer if it fails.
 * - `follow(destroy)`: while `destroy` lives, `refresh()` after the lifecycle events that move
 *   which items have an ACTIVE agent (`ACTIVE_AGENT_EVENTS`, at most once a second).
 * - `loadHistory(workRef)` reads one item's workspaces in every state, newest first, once, and
 *   again after an error; `refreshHistory(workRef)` reads a loaded one again, quietly (no
 *   `loading`, the last good answer kept on a failure); `historyOf(workRef)` gives them, or
 *   undefined before.
 *
 * Staleness (qits-1270): `AgentPlaced`, `AgentRequeued`, `AgentObsolete`, `AgentRemoved` (any:
 * the events name no project, and an item that just got an agent is not one the store knows yet)
 * → `listOpenWorkspaces` and `listAgents?state=ACTIVE`, each only once it was read (`follow`). An
 * item's history is the work item page's to follow: the same events naming its `workId` →
 * `refreshHistory` (`work-item.page.ts`, through `AgentsStore.follow`). No longer
 * `EntityTransitioned`: a work item's move changes nothing qits-workspaces holds; the agent events
 * that follow it do. Not announced: an agent's creation (no `AgentCreated`), so a queued agent's
 * item reaches the In Progress tab only once the agent is placed.
 */
export const WorkspacesStore = signalStore(
  { providedIn: 'root' },
  withState<WorkspacesState>({
    status: 'idle',
    openWorkIds: [],
    agentsStatus: 'idle',
    agentWorkIds: [],
    history: {},
  }),
  withComputed((store) => ({
    /** {@link WorkspacesState.openWorkIds} as a set. */
    openSet: computed(() => new Set(store.openWorkIds())),
    /** {@link WorkspacesState.agentWorkIds} as a set. */
    agentSet: computed(() => new Set(store.agentWorkIds())),
  })),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    async function fetchOpen(): Promise<void> {
      const { data, error } = await consume(listOpenWorkspaces(), LIST_OPEN_WORKSPACES);
      if (error !== undefined || !data) {
        if (store.status() !== 'loaded') patchState(store, { status: 'error', openWorkIds: [] });
        return;
      }
      const openWorkIds = (data.entries ?? []).flatMap((e) =>
        e.workspace?.workId ? [e.workspace.workId] : [],
      );
      patchState(store, { status: 'loaded', openWorkIds });
    }

    async function fetchAgents(): Promise<void> {
      const { data, error } = await consume(
        listAgents({ query: { state: 'ACTIVE' } }),
        LIST_ACTIVE_AGENTS,
      );
      if (error !== undefined || !data) {
        if (store.agentsStatus() !== 'loaded') {
          patchState(store, { agentsStatus: 'error', agentWorkIds: [] });
        }
        return;
      }
      const agentWorkIds = (data.agents ?? []).flatMap((a) => (a.workId ? [a.workId] : []));
      patchState(store, { agentsStatus: 'loaded', agentWorkIds });
    }

    function setHistory(workRef: string, value: WorkspaceHistory): void {
      patchState(store, { history: { ...store.history(), [workRef]: value } });
    }

    async function fetchHistory(workRef: string): Promise<boolean> {
      const { data, error } = await consume(
        listWorkItemWorkspaces({ path: { workRef } }),
        LIST_WORK_ITEM_WORKSPACES,
      );
      if (error !== undefined || !data) return false;
      const entries = (data.entries ?? []).flatMap((e) => (e.workspace ? [e.workspace] : []));
      setHistory(workRef, { status: 'loaded', entries });
      return true;
    }

    async function refreshHistory(workRef: string): Promise<void> {
      if (store.history()[workRef]?.status !== 'loaded') return;
      await fetchHistory(workRef);
    }

    async function refresh(): Promise<void> {
      await Promise.all([
        store.status() === 'loaded' ? fetchOpen() : undefined,
        store.agentsStatus() === 'loaded' ? fetchAgents() : undefined,
      ]);
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'loading' || store.status() === 'loaded') return;
        patchState(store, { status: 'loading' });
        await fetchOpen();
      },
      async loadAgents(): Promise<void> {
        const status = store.agentsStatus();
        if (status === 'loading' || status === 'loaded') return;
        patchState(store, { agentsStatus: 'loading' });
        await fetchAgents();
      },
      refresh,
      follow(destroy: DestroyRef): void {
        refreshOn({ names: ACTIVE_AGENT_EVENTS, refresh: () => refresh() }, destroy);
      },
      /** Whether the item with this id has an ACTIVE workspace. */
      hasOpen(workId: string | undefined): boolean {
        return !!workId && store.openSet().has(workId);
      },
      async loadHistory(workRef: string): Promise<void> {
        const current = store.history()[workRef];
        if (!workRef || (current && current.status !== 'error')) return;
        setHistory(workRef, { status: 'loading', entries: [] });
        if (!(await fetchHistory(workRef))) setHistory(workRef, { status: 'error', entries: [] });
      },
      refreshHistory,
      historyOf(workRef: string): WorkspaceHistory | undefined {
        return store.history()[workRef];
      },
    };
  }),
);
