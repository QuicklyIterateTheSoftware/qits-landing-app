import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  getWorkspace,
  getWorkspaceActiveProcess,
  listAgents,
  listWorkspaces,
} from '../../api/workspaces';
import { injectRefreshOn } from '$core/events/refresh-on';
import {
  GET_ACTIVE_PROCESS,
  GET_SLOT,
  LIST_ITEM_AGENTS,
  LIST_PROJECT_AGENTS,
  LIST_PROJECT_SLOTS,
  LIST_SLOT_AGENTS,
  type ItemAgent,
  type ProjectAgent,
  type ProjectSlot,
  type SlotAgent,
  type SlotDetail,
} from './agents.consumes';
import {
  concerns,
  WORKSPACE_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
  type WorkspaceEventIds,
} from './workspace-events';

/** How far a read got. `missing`: the service answered 404 (a slot that resolved, or none). */
export type ReadStatus = 'loading' | 'loaded' | 'error' | 'missing';

/** A project's Workspaces page: the wrapper's slots and its agents, as `loadProject` left them. */
export interface ProjectWorkspaces {
  readonly status: ReadStatus;
  /** The wrapper's ACTIVE slots. */
  readonly slots: readonly ProjectSlot[];
  /** The wrapper's agents that are not removed, newest first. */
  readonly agents: readonly ProjectAgent[];
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

/** A work item's agent page, as `loadItem` left it. */
export interface ItemAgents {
  readonly status: ReadStatus;
  /** The item's agent: its newest one not removed, else its newest; undefined for none. */
  readonly agent?: ItemAgent;
}

interface AgentsState {
  /** By the wrapper repository's id. */
  readonly projects: Readonly<Record<string, ProjectWorkspaces>>;
  /** By the slot's row id. */
  readonly slots: Readonly<Record<number, SlotStatus>>;
  /** By the slot's row id. */
  readonly slotAgents: Readonly<Record<number, SlotAgents>>;
  /** By the work item's id (qits-projects' entity id). */
  readonly items: Readonly<Record<string, ItemAgents>>;
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
 * - `loadItem(workId)`: the item's agents (`listAgents?workId=`), its agent, and that agent's slot
 *   status when it has a slot.
 *
 * Every load reads again when called again (a page calls it on arrival and on every relevant
 * lifecycle event), keeping the last good answer when a read again fails. `follow(destroy, scope,
 * refresh)` runs `refresh` after the lifecycle events (`WORKSPACE_EVENTS`) about `scope()`, at most
 * once a second (`refreshOn`): it is how the pages stay live, without polling.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming the page's wrapper, slot, agent or item →
 * whatever the page's `refresh` reads again (its `load…`).
 */
export const AgentsStore = signalStore(
  { providedIn: 'root' },
  withState<AgentsState>({ projects: {}, slots: {}, slotAgents: {}, items: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    const setProject = (id: string, value: ProjectWorkspaces) =>
      patchState(store, { projects: { ...store.projects(), [id]: value } });
    const setSlot = (id: number, value: SlotStatus) =>
      patchState(store, { slots: { ...store.slots(), [id]: value } });
    const setSlotAgents = (id: number, value: SlotAgents) =>
      patchState(store, { slotAgents: { ...store.slotAgents(), [id]: value } });
    const setItem = (id: string, value: ItemAgents) =>
      patchState(store, { items: { ...store.items(), [id]: value } });

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

    return {
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
        const all = data.agents ?? [];
        const agent = notRemoved(all)[0] ?? all[0];
        setItem(workId, { status: 'loaded', agent });
        if (agent?.workspaceRowId) await loadSlotStatus(agent.workspaceRowId);
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
      follow(destroy: DestroyRef, scope: () => WorkspaceEventIds, refresh: () => void): void {
        refreshOn(
          {
            names: WORKSPACE_EVENTS,
            when: (event) => concerns(event, scope()),
            debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
            refresh: () => refresh(),
          },
          destroy,
        );
      },
    };
  }),
);
