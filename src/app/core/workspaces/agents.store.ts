import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  getAgent,
  getAgentActiveProcess,
  getWorkspace,
  getWorkspaceActiveProcess,
  listAgents,
  listWorkspaces,
} from '../../api/workspaces';
import type { DomainEvent } from '$core/events/domain-events';
import { injectRefreshOn } from '$core/events/refresh-on';
import {
  GET_ACTIVE_PROCESS,
  GET_AGENT,
  GET_AGENT_ACTIVE_PROCESS,
  GET_SLOT,
  LIST_ITEM_AGENTS,
  LIST_PROJECT_AGENTS,
  LIST_PROJECT_SLOTS,
  LIST_SLOT_AGENTS,
  PROJECT_AGENTS,
  type AgentDetail,
  type ItemAgent,
  type ProjectAgent,
  type ProjectSlot,
  type ProjectStatusAgent,
  type SlotAgent,
  type SlotDetail,
} from './agents.consumes';
import {
  AGENT_STATUS_EVENTS,
  concerns,
  WORKSPACE_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
  type WorkspaceEventIds,
} from './workspace-events';

/** How far a read got. `missing`: the service answered 404 (a slot that resolved, or none). */
export type ReadStatus = 'loading' | 'loaded' | 'error' | 'missing';

/** A project's slots (the Agents page's Workspaces heading) and the wrapper's agents, as `loadProject` left them. */
export interface ProjectWorkspaces {
  readonly status: ReadStatus;
  /** The wrapper's ACTIVE slots. */
  readonly slots: readonly ProjectSlot[];
  /** The wrapper's agents that are not removed, newest first. */
  readonly agents: readonly ProjectAgent[];
}

/** A project's ACTIVE agents with their waits and attention, as `loadProjectAgents` left them. */
export interface ProjectAgentsStatus {
  readonly status: ReadStatus;
  /** The project's ACTIVE agents, as the service orders them. */
  readonly agents: readonly ProjectStatusAgent[];
}

/** A slot's status strip: the slot and the start running against it, as `loadSlotStatus` left them. */
export interface SlotStatus {
  readonly status: ReadStatus;
  readonly slot?: SlotDetail;
  /** The technical process starting the slot's container, or null when none is live. */
  readonly processId: string | null;
}

/** A slot's page: its status, and the agents it hosts (not removed), as `loadSlot` left them. */
export interface SlotAgents {
  readonly status: ReadStatus;
  readonly agents: readonly SlotAgent[];
}

/** A work item's ACTIVE agent, as `loadItem` left it. */
export interface ItemAgents {
  readonly status: ReadStatus;
  /** The item's newest ACTIVE agent; undefined for none. */
  readonly agent?: ItemAgent;
}

/** One agent's page, as `loadAgent` left it. */
export interface AgentRead {
  readonly status: ReadStatus;
  readonly agent?: AgentDetail;
  /** The technical process starting the agent's slot's container, or null when none is live. */
  readonly processId?: string | null;
}

interface AgentsState {
  /** By the wrapper repository's id. */
  readonly projects: Readonly<Record<string, ProjectWorkspaces>>;
  /** By the project's id (qits-projects' uuid). */
  readonly projectAgents: Readonly<Record<string, ProjectAgentsStatus>>;
  /** By the slot's row id. */
  readonly slots: Readonly<Record<number, SlotStatus>>;
  /** By the slot's row id. */
  readonly slotAgents: Readonly<Record<number, SlotAgents>>;
  /** By the work item's id (qits-projects' entity id). */
  readonly items: Readonly<Record<string, ItemAgents>>;
  /** By the agent's id. */
  readonly agents: Readonly<Record<string, AgentRead>>;
}

const notRemoved = <T extends { readonly state?: string }>(agents: readonly T[] | undefined) =>
  (agents ?? []).filter((agent) => agent.state !== 'REMOVED');

/**
 * Whether a work item's qualified id (`<slug>-<n>`) is one of the project `slug`'s. Exact: `qits-12`
 * is `qits`', never `qits-ci`'s, and `qits-ci-3` is `qits-ci`'s, never `qits`'.
 */
export function ofProject(qualifiedId: string | undefined, slug: string | undefined): boolean {
  if (!qualifiedId || !slug) return false;
  const at = qualifiedId.lastIndexOf('-');
  return at > 0 && qualifiedId.slice(0, at) === slug && /^\d+$/.test(qualifiedId.slice(at + 1));
}

/** The status after a failed read: `missing` for a 404, else `error`. */
const failedWith = (status: number | undefined): ReadStatus =>
  status === 404 ? 'missing' : 'error';

/**
 * The workspace pages' reads from qits-workspaces (epic qits-1230): what
 * qits-workspaces-frontend's overview, slot and agent pages read, without their writes.
 *
 * - `loadProject(repositoryId, slug)`: the wrapper's slots (`listWorkspaces?repositoryId=`) and
 *   the project's agents (`listAgents`, every agent, of which it keeps those not removed that work
 *   in the wrapper or on one of the project's items, `<slug>-<n>`).
 * - `loadSlot(id)`: one slot's status (`loadSlotStatus`) and the agents it hosts
 *   (`listAgents?workspaceId=`).
 * - `loadSlotStatus(id)`: the slot (`getWorkspace`) and the process starting its container, if one
 *   is live (`getWorkspaceActiveProcess`); its log comes from `ProcessLog`.
 * - `loadItem(workId)`: the item's agents (`listAgents?workId=`), of which it keeps the newest
 *   ACTIVE one: where the item's old agent address leads.
 * - `loadAgent(agentId)` (epic qits-1681): one agent (`getAgent`), and, when it has a slot, the
 *   start bringing that slot's container up (`getAgentActiveProcess`, by the agent: epic qits-1667's
 *   agent page asks nothing of the slot itself): the agent page and its tabs.
 * - `loadProjectAgents(projectId)` (epic qits-1681): the project's ACTIVE agents
 *   (`listAgents?projectId=&state=ACTIVE`) with their open waits, their activity and their
 *   attention; `followProject` keeps them current (its comment has the mapping).
 *
 * Every load reads again when called again (a page calls it on arrival and on every relevant
 * lifecycle event), keeping the last good answer when a read again fails, and without going back
 * to `loading` (a read again never flashes the spinner). `follow(destroy, scope, refresh, names?)`
 * runs `refresh` with the burst's events after the lifecycle events (`names`, `WORKSPACE_EVENTS`
 * unless narrower) about `scope()` (one scope, or several: any id of any matches), at most once a
 * second (`refreshOn`): it is how the pages stay live, without polling.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` (or the page's narrower `names`) naming the page's
 * wrapper, slot, agent or item → whatever the page's `refresh` reads again (its `load…`). Each
 * page records its own mapping. What no lifecycle event announces, and so goes stale until the
 * next event or a visit: a queued agent's creation (no `AgentCreated`: it shows once placed);
 * a slot's runtime leaving RUNNING, or a start beginning (stopped, its container gone, its runner
 * offline, a start's PROVISIONING and its log: `WorkspaceStarted` says only that it turned
 * RUNNING, `WorkspaceFailed` that a start failed); an agent of the project working outside the
 * wrapper that the page does not list yet (the events name no project).
 */
export const AgentsStore = signalStore(
  { providedIn: 'root' },
  withState<AgentsState>({
    projects: {},
    projectAgents: {},
    slots: {},
    slotAgents: {},
    items: {},
    agents: {},
  }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    const setProject = (id: string, value: ProjectWorkspaces) =>
      patchState(store, { projects: { ...store.projects(), [id]: value } });
    const setProjectAgents = (id: string, value: ProjectAgentsStatus) =>
      patchState(store, { projectAgents: { ...store.projectAgents(), [id]: value } });
    const setSlot = (id: number, value: SlotStatus) =>
      patchState(store, { slots: { ...store.slots(), [id]: value } });
    const setSlotAgents = (id: number, value: SlotAgents) =>
      patchState(store, { slotAgents: { ...store.slotAgents(), [id]: value } });
    const setItem = (id: string, value: ItemAgents) =>
      patchState(store, { items: { ...store.items(), [id]: value } });
    const setAgent = (id: string, value: AgentRead) =>
      patchState(store, { agents: { ...store.agents(), [id]: value } });

    async function loadSlotStatus(id: number): Promise<void> {
      const before = store.slots()[id];
      if (!before) setSlot(id, { status: 'loading', processId: null });
      const [slot, process] = await Promise.all([
        consume(getWorkspace({ path: { id } }), GET_SLOT),
        consume(getWorkspaceActiveProcess({ path: { id } }), GET_ACTIVE_PROCESS),
      ]);
      if (slot.error !== undefined || !slot.data?.workspace) {
        const status = failedWith(slot.response?.status);
        // A slot that resolved is gone for good; any other failure keeps the last good answer.
        if (status === 'missing' || store.slots()[id]?.status !== 'loaded') {
          setSlot(id, { status, processId: null });
        }
        return;
      }
      // The start's log is an extra: a failed lookup shows none.
      const processId =
        process.error === undefined ? (process.data?.technicalProcessId ?? null) : null;
      setSlot(id, { status: 'loaded', slot: slot.data.workspace, processId });
    }

    async function loadProjectAgents(projectId: string): Promise<void> {
      if (!projectId) return;
      if (!store.projectAgents()[projectId]) {
        setProjectAgents(projectId, { status: 'loading', agents: [] });
      }
      const { data, error } = await consume(
        listAgents({ query: { projectId, state: 'ACTIVE' } }),
        PROJECT_AGENTS,
      );
      if (error !== undefined || !data) {
        if (store.projectAgents()[projectId]?.status !== 'loaded') {
          setProjectAgents(projectId, { status: 'error', agents: [] });
        }
        return;
      }
      setProjectAgents(projectId, { status: 'loaded', agents: data.agents ?? [] });
    }

    return {
      loadProjectAgents,
      projectAgentsOf(projectId: string): ProjectAgentsStatus | undefined {
        return store.projectAgents()[projectId];
      },
      /**
       * Keeps `projectId()`'s agents current while `destroy` lives, by reading them again
       * (`loadProjectAgents`, quietly: no spinner) after the events that can change them.
       *
       * Staleness (qits-1270): `AGENT_STATUS_EVENTS` about the open project → `loadProjectAgents`
       * again, debounced 1 s. "About the project": the five status events by their `projectId`;
       * `AgentNudged` and `ACTIVE_AGENT_EVENTS`, which name no project, by an agent or a repository
       * of the agents already listed. So an agent placed in a repository of the project none of
       * whose agents is listed yet shows on the next status event or visit. A wait's request gates
       * follow `RELEASE_REQUEST_EVENTS` through `ProjectsStore`, an item's status and block
       * `WORK_EVENTS` through `SelectedWork`, not this. No timer and no second stream.
       */
      followProject(destroy: DestroyRef, projectId: () => string | undefined): void {
        refreshOn(
          {
            names: AGENT_STATUS_EVENTS,
            when: (_event, ids) => {
              const id = projectId();
              if (!id) return false;
              if (ids.projectId) return ids.projectId === id;
              const listed = store.projectAgents()[id]?.agents ?? [];
              return listed.some(
                (agent) =>
                  (!!ids.agentId && agent.agentId === ids.agentId) ||
                  (!!ids.repositoryId && agent.repositoryId === ids.repositoryId),
              );
            },
            debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
            refresh: () => {
              const id = projectId();
              return id ? loadProjectAgents(id) : undefined;
            },
          },
          destroy,
        );
      },
      async loadProject(repositoryId: string, slug?: string): Promise<void> {
        if (!repositoryId) return;
        if (!store.projects()[repositoryId]) {
          setProject(repositoryId, { status: 'loading', slots: [], agents: [] });
        }
        const [slots, agents] = await Promise.all([
          consume(listWorkspaces({ query: { repositoryId } }), LIST_PROJECT_SLOTS),
          consume(listAgents(), LIST_PROJECT_AGENTS),
        ]);
        if (slots.error !== undefined || agents.error !== undefined) {
          if (store.projects()[repositoryId]?.status !== 'loaded') {
            setProject(repositoryId, { status: 'error', slots: [], agents: [] });
          }
          return;
        }
        setProject(repositoryId, {
          status: 'loaded',
          slots: (slots.data?.entries ?? []).flatMap((e) => (e.workspace ? [e.workspace] : [])),
          agents: notRemoved(agents.data?.agents).filter(
            (a) => a.repositoryId === repositoryId || ofProject(a.entityId, slug),
          ),
        });
      },
      loadSlotStatus,
      async loadSlot(id: number): Promise<void> {
        if (!Number.isInteger(id) || id <= 0) return;
        if (!store.slotAgents()[id]) setSlotAgents(id, { status: 'loading', agents: [] });
        const [, agents] = await Promise.all([
          loadSlotStatus(id),
          consume(listAgents({ query: { workspaceId: id } }), LIST_SLOT_AGENTS),
        ]);
        if (agents.error !== undefined || !agents.data) {
          if (store.slotAgents()[id]?.status !== 'loaded') {
            setSlotAgents(id, { status: 'error', agents: [] });
          }
          return;
        }
        setSlotAgents(id, { status: 'loaded', agents: notRemoved(agents.data.agents) });
      },
      async loadItem(workId: string): Promise<void> {
        if (!workId) return;
        if (!store.items()[workId]) setItem(workId, { status: 'loading' });
        const { data, error } = await consume(listAgents({ query: { workId } }), LIST_ITEM_AGENTS);
        if (error !== undefined || !data) {
          if (store.items()[workId]?.status !== 'loaded') setItem(workId, { status: 'error' });
          return;
        }
        const agent = (data.agents ?? []).find((a) => a.state === 'ACTIVE');
        setItem(workId, { status: 'loaded', agent });
      },
      async loadAgent(agentId: string): Promise<void> {
        if (!agentId) return;
        if (!store.agents()[agentId]) setAgent(agentId, { status: 'loading' });
        const { data, error, response } = await consume(
          getAgent({ path: { id: agentId } }),
          GET_AGENT,
        );
        if (error !== undefined || !data) {
          const status = failedWith(response?.status);
          // An agent that is not there is gone for good; any other failure keeps the last answer.
          if (status === 'missing' || store.agents()[agentId]?.status !== 'loaded') {
            setAgent(agentId, { status });
          }
          return;
        }
        if (!data.workspaceRowId) {
          setAgent(agentId, { status: 'loaded', agent: data, processId: null });
          return;
        }
        // The agent shows at once; the start it may be waiting on keeps its last answer meanwhile.
        const kept = store.agents()[agentId]?.processId ?? null;
        setAgent(agentId, { status: 'loaded', agent: data, processId: kept });
        // The start's log is an extra: a failed lookup shows none.
        const process = await consume(
          getAgentActiveProcess({ path: { id: agentId } }),
          GET_AGENT_ACTIVE_PROCESS,
        );
        const processId =
          process.error === undefined ? (process.data?.technicalProcessId ?? null) : null;
        setAgent(agentId, { status: 'loaded', agent: data, processId });
      },
      agentOf(agentId: string): AgentRead | undefined {
        return store.agents()[agentId];
      },
      projectOf(repositoryId: string): ProjectWorkspaces | undefined {
        return store.projects()[repositoryId];
      },
      slotOf(id: number): SlotStatus | undefined {
        return store.slots()[id];
      },
      slotAgentsOf(id: number): SlotAgents | undefined {
        return store.slotAgents()[id];
      },
      itemOf(workId: string): ItemAgents | undefined {
        return store.items()[workId];
      },
      follow(
        destroy: DestroyRef,
        scope: () => WorkspaceEventIds | readonly WorkspaceEventIds[],
        refresh: (events: readonly DomainEvent[]) => void,
        names: readonly string[] = WORKSPACE_EVENTS,
      ): void {
        refreshOn(
          {
            names,
            when: (event) => concerns(event, scope()),
            debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
            refresh: (events) => refresh(events),
          },
          destroy,
        );
      },
    };
  }),
);
