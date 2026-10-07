import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  dispatchWork,
  getWork,
  listProjectWork,
  listWorkMembers,
  setWorkStatus,
} from '../../api/projects';
import {
  countsAsWork,
  DISPATCH_WORK,
  GET_CAMPAIGN_DESCRIPTION,
  LIST_PROJECT_WORK,
  LIST_WORK_MEMBERS,
  SET_WORK_STATUS,
  type WorkEntry,
} from './work.consumes';
import { FINISH_DELAY_MS } from './finish-delay';

/** How a finish (a move to DONE) is going: running, or failed. Absent when none is. */
export type FinishState = 'running' | 'error';

type Status = 'loading' | 'loaded' | 'error';

/**
 * A work entity's status word. Plain `string`, not the generated client's closed union
 * (`WorkEntry['status']`): the union names the words qits-projects-service's OpenAPI document had
 * when the client was generated (READY_FOR_DEV since qits-887), and a newer word can reach a live
 * entity before the client is regenerated. Nothing here may depend on the union being exhaustive.
 */
export type WorkStatus = string;

/**
 * Why a move failed, for a person to read: the answer's `message`, verbatim, when it carries one
 * (a quality gate's 409: `Ticket <id> cannot move to READY_FOR_DEV: ACCEPTANCE_CRITERIA: …`), else
 * the HTTP status. qits-projects' OpenAPI document gives its error answers no body, so the message
 * is read defensively and nothing else of it is relied on.
 */
export function refusalOf(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus ? `The move failed (HTTP ${httpStatus}).` : 'The move failed.';
}

/** What a dispatch press runs: the whole flow, or the next phase only. */
export type DispatchMode = 'FLOW' | 'PHASE';

export { FINISH_DELAY_MS };

/**
 * A finish asked for in the Acceptance list and not settled yet:
 *
 * - `waiting`: the item is hidden, and Undo still takes it back;
 * - `sending`: the move to DONE is on its way;
 * - `failed`: the move failed; the item is back in the list until this is dismissed.
 */
export interface PendingFinish {
  readonly projectId: string;
  readonly entry: WorkEntry;
  readonly phase: 'waiting' | 'sending' | 'failed';
}

/**
 * A project's work, as `load(projectId)` left it: its entities, and how many count as work (the
 * project card's tile).
 */
export interface ProjectWork {
  readonly status: Status;
  readonly count: number;
  readonly entries: readonly WorkEntry[];
  /** Each campaign's member ids, in campaign order (campaign membership is not on the entity). */
  readonly campaigns: Readonly<Record<string, readonly string[]>>;
  /** Each campaign's description, by campaign id; a campaign without one has no key. */
  readonly campaignDescriptions: Readonly<Record<string, string>>;
}

/**
 * How qits-projects' `/work` doors address an entry: its qualified id (`qits-111`), or its id when
 * it carries none (the doors resolve a UUID too).
 */
export function workRef(entry: Pick<WorkEntry, 'id' | 'qualifiedId'>): string | undefined {
  return entry.qualifiedId || entry.id;
}

/** A project's work while it has none to show: loading, or failed. */
const NO_WORK: ProjectWork = {
  status: 'loading',
  count: 0,
  entries: [],
  campaigns: {},
  campaignDescriptions: {},
};

interface WorkState {
  /** Each project's work, by project id. A project not asked for yet has no key. */
  readonly byProject: Readonly<Record<string, ProjectWork>>;
  /** Each entity's running or failed finish, by entity id. */
  readonly finishing: Readonly<Record<string, FinishState>>;
  /** Each finish asked for with `finishLater` and not settled yet, by entity id, oldest first. */
  readonly pendingFinishes: Readonly<Record<string, PendingFinish>>;
  /** Each entity's running or failed `transition`, by entity id. */
  readonly transitioning: Readonly<Record<string, FinishState>>;
  /**
   * Why each entity's last `transition` failed, by entity id: the service's message, verbatim (a
   * quality gate's 409 names every gate it failed), or a fallback naming the HTTP status when the
   * answer carried none. Gone once the entity's next `transition` starts.
   */
  readonly refusals: Readonly<Record<string, string>>;
  /** Each entity's running or failed `dispatch`, by entity id. */
  readonly dispatching: Readonly<Record<string, FinishState>>;
  /** The phase each entity's last dispatch started, by entity id. */
  readonly dispatched: Readonly<Record<string, string>>;
}

/**
 * Each project's work entities, from qits-projects' `listProjectWork` (the whole planning tree,
 * unfiltered): one request per project, shared by the project card and the work section. Every
 * entity is addressed by its qualified id ({@link workRef}); the state is keyed by entity id.
 *
 * - `load(projectId)` fetches once, and again after an error. Nothing calls it on its own: the
 *   project card does in the browser, and `SelectedWork` for the open project.
 * - Which entities count as work is `countsAsWork` in `work.consumes.ts`.
 * - Each campaign in the tree is then asked for its members (`listWorkMembers`) and its description
 *   (`getWork`), two requests per campaign: membership lives on the campaign, not on the entity. A
 *   failed members read fails the project's work, as a partial tree would group wrongly; a failed
 *   description read only leaves that campaign's description out.
 * - `refresh(projectId)` fetches again and keeps showing the old work until the answer is in.
 * - `finish(projectId, entry)` moves a VERIFIED epic or ticket to DONE (`setWorkStatus`) and
 *   writes the answered status into the entry: it leaves the Acceptance list for the archive. DONE
 *   is final in qits-projects; nothing moves it back.
 * - `finishLater(projectId, entry)` is the Acceptance list's finish: the item is hidden at once (`hidden`),
 *   and `finish` runs after {@link FINISH_DELAY_MS}, unless `undoFinish(id)` takes it back first.
 *   On failure the item shows again and the pending finish stays `failed` until `dismissFinish`.
 *   Leaving the page (`pagehide`) sends every waiting finish at once: the user had their chance to
 *   undo, and the request is sent with `keepalive`, so it outlives the page.
 * - `transition(projectId, entry, target)` moves any work item to a status the archetype registry
 *   serves for it (the work item page's Status actions), through the same door as `finish`, and
 *   writes the answered status into the entry. `transitioning` holds a running or failed move,
 *   `refusals` why a move failed (the 409's message: a quality gate, say).
 * - `transitionAll(projectId, entries, target)` moves several items at once, each as `transition`
 *   does (the Schedule tab's Schedule and Unschedule). Each move succeeds or fails on its own.
 * - `dispatch(entry, mode)` presses dispatch (`dispatchWork`): `FLOW` runs every
 *   phase left, `PHASE` the next one. The answer names the phase it started (`dispatched`); the
 *   status the platform moves the item to arrives as an event, like any other move.
 *   `dispatching` holds a running or failed press.
 */
export const WorkStore = signalStore(
  { providedIn: 'root' },
  withState<WorkState>({
    byProject: {},
    finishing: {},
    pendingFinishes: {},
    transitioning: {},
    refusals: {},
    dispatching: {},
    dispatched: {},
  }),
  withComputed((store) => ({
    /** The ids of items the lists do not show: their finish is waiting or being sent. */
    hidden: computed(
      () =>
        new Set(
          Object.entries(store.pendingFinishes()).flatMap(([id, p]) =>
            p.phase === 'failed' ? [] : [id],
          ),
        ),
    ),
  })),
  withMethods((store) => {
    /** The timer of each waiting finish, by entity id. */
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    /**
     * Statuses this tab wrote after a finish, and when: a step of `clock`, which also counts every
     * fetch. A fetch that started before a finish went through can answer with the old status (a
     * finish's own event starts one while the next finish is still on its way), so its answer must
     * not undo the finish. An entry goes once a fetch that started later answers with it.
     */
    let clock = 0;
    const settled = new Map<
      string,
      { readonly status: WorkEntry['status']; readonly at: number }
    >();

    /** `entries` with every status this tab settled after `startedAt` laid over them. */
    function withSettled(entries: readonly WorkEntry[], startedAt: number): WorkEntry[] {
      return entries.map((e) => {
        const local = e.id ? settled.get(e.id) : undefined;
        if (!local || !e.id) return e;
        if (local.at > startedAt) return { ...e, status: local.status };
        if (e.status === local.status) settled.delete(e.id);
        return e;
      });
    }

    function set(projectId: string, value: ProjectWork): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    function setFinishing(entityId: string, value: FinishState | undefined): void {
      const { [entityId]: _, ...rest } = store.finishing();
      patchState(store, { finishing: value ? { ...rest, [entityId]: value } : rest });
    }

    function setTransitioning(entityId: string, value: FinishState | undefined): void {
      const { [entityId]: _, ...rest } = store.transitioning();
      patchState(store, { transitioning: value ? { ...rest, [entityId]: value } : rest });
    }

    function setRefusal(entityId: string, value: string | undefined): void {
      const { [entityId]: _, ...rest } = store.refusals();
      patchState(store, { refusals: value ? { ...rest, [entityId]: value } : rest });
    }

    function setDispatching(entityId: string, value: FinishState | undefined): void {
      const { [entityId]: _, ...rest } = store.dispatching();
      patchState(store, { dispatching: value ? { ...rest, [entityId]: value } : rest });
    }

    /** Sets or drops a pending finish; a finish already there keeps its place in the order. */
    function setPending(entityId: string, value: PendingFinish | undefined): void {
      const { [entityId]: _, ...rest } = store.pendingFinishes();
      patchState(store, {
        pendingFinishes: value ? { ...store.pendingFinishes(), [entityId]: value } : rest,
      });
    }

    function stopTimer(entityId: string): void {
      clearTimeout(timers.get(entityId));
      timers.delete(entityId);
    }

    /**
     * Moves an entity to `target` through the status door, and writes the answered status into its
     * entry. The answered status, or why the move failed.
     */
    async function move(
      projectId: string,
      entry: WorkEntry,
      target: WorkStatus,
    ): Promise<{ readonly status?: WorkStatus; readonly refusal?: string }> {
      const id = entry.id;
      const qualifiedId = workRef(entry);
      if (!id || !qualifiedId) return {};
      // `keepalive`: a finish sent as the page is left must still arrive.
      const { data, error, response } = await consume(
        setWorkStatus({ path: { qualifiedId }, body: { target }, keepalive: true }),
        SET_WORK_STATUS,
      );
      const status = error === undefined ? data?.status : undefined;
      if (!status) return { refusal: refusalOf(error, response?.status) };
      settled.set(id, { status, at: ++clock });
      const work = store.byProject()[projectId];
      if (work) {
        // Only the moved entry changes: an epic going to DONE moves none of its features or tasks
        // in qits-projects (only REPORTED ↔ REFINED ↔ READY_FOR_DEV and → IMPLEMENTED cascade,
        // qits-763, qits-887), and the lists archive them with their epic (`WorkGraph.phaseOf`).
        // Any other move refetches on its `EntityTransitioned` (`SelectedWork.followTransitions`):
        // a scheduled epic's features and tasks follow it that way.
        const entries = work.entries.map((e) => (e.id === id ? { ...e, status } : e));
        set(projectId, { ...work, entries, count: entries.filter(countsAsWork).length });
      }
      return { status };
    }

    async function transition(projectId: string, entry: WorkEntry, target: WorkStatus) {
      const id = entry.id;
      if (!id || store.transitioning()[id] === 'running') return;
      setTransitioning(id, 'running');
      setRefusal(id, undefined);
      const { status, refusal } = await move(projectId, entry, target);
      setTransitioning(id, status ? undefined : 'error');
      setRefusal(id, status ? undefined : refusal);
    }

    async function finish(projectId: string, entry: WorkEntry): Promise<void> {
      const id = entry.id;
      if (!id || store.finishing()[id] === 'running') return;
      setFinishing(id, 'running');
      const { status } = await move(projectId, entry, 'DONE');
      setFinishing(id, status ? undefined : 'error');
    }

    /** Sends the waiting finish of `entityId` now. */
    async function send(entityId: string): Promise<void> {
      stopTimer(entityId);
      const pending = store.pendingFinishes()[entityId];
      if (pending?.phase !== 'waiting') return;
      setPending(entityId, { ...pending, phase: 'sending' });
      await finish(pending.projectId, pending.entry);
      // The entry carries DONE before the pending finish goes, so the item never shows again.
      setPending(
        entityId,
        store.finishing()[entityId] === 'error' ? { ...pending, phase: 'failed' } : undefined,
      );
    }

    async function fetch(projectId: string): Promise<ProjectWork> {
      const startedAt = ++clock;
      const { data, error } = await consume(
        listProjectWork({ path: { project: projectId } }),
        LIST_PROJECT_WORK,
      );
      const entries = withSettled(data?.entities ?? [], startedAt);
      const campaignList = entries.flatMap((e) => {
        const qualifiedId = workRef(e);
        return e.archetype === 'CAMPAIGN' && e.id && qualifiedId ? [{ id: e.id, qualifiedId }] : [];
      });
      const [members, described] = await Promise.all([
        Promise.all(
          campaignList.map(({ qualifiedId }) =>
            consume(listWorkMembers({ path: { qualifiedId } }), LIST_WORK_MEMBERS),
          ),
        ),
        Promise.all(
          campaignList.map(({ qualifiedId }) =>
            consume(getWork({ path: { qualifiedId } }), GET_CAMPAIGN_DESCRIPTION),
          ),
        ),
      ]);
      const failed =
        error !== undefined || !data || members.some((a) => a.error !== undefined || !a.data);
      const campaigns = Object.fromEntries(
        members.map((a, i) => [
          campaignList[i].id,
          (a.data?.members ?? []).flatMap((m) => (m.entity?.id ? [m.entity.id] : [])),
        ]),
      );
      const campaignDescriptions = Object.fromEntries(
        described.flatMap((a, i) => {
          const description = a.error === undefined ? a.data?.description : undefined;
          return description ? [[campaignList[i].id, description]] : [];
        }),
      );
      return failed
        ? { ...NO_WORK, status: 'error' }
        : {
            status: 'loaded',
            count: entries.filter(countsAsWork).length,
            entries,
            campaigns,
            campaignDescriptions,
          };
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { ...NO_WORK, status: 'loading' });
        set(projectId, await fetch(projectId));
      },
      /** Fetches again; the old work stays until the answer is in, and stays if it fails. */
      async refresh(projectId: string): Promise<void> {
        const next = await fetch(projectId);
        if (next.status === 'loaded' || !store.byProject()[projectId]) set(projectId, next);
      },
      /** Moves `entry` to DONE now. */
      finish,
      /** Moves `entry` to `target` (a Status action); a running move is not repeated. */
      transition,
      /** Moves every one of `entries` to `target`, all at once, each as `transition` does. */
      async transitionAll(
        projectId: string,
        entries: readonly WorkEntry[],
        target: WorkStatus,
      ): Promise<void> {
        await Promise.all(entries.map((entry) => transition(projectId, entry, target)));
      },
      /** Presses dispatch for `entry`; a running press is not repeated. */
      async dispatch(entry: WorkEntry, mode: DispatchMode): Promise<void> {
        const id = entry.id;
        const qualifiedId = workRef(entry);
        if (!id || !qualifiedId || store.dispatching()[id] === 'running') return;
        setDispatching(id, 'running');
        const { data, error } = await consume(
          dispatchWork({ path: { qualifiedId }, body: { mode } }),
          DISPATCH_WORK,
        );
        const failed = error !== undefined || !data;
        setDispatching(id, failed ? 'error' : undefined);
        const phase = !failed && 'dispatch' in data ? data.dispatch?.phase : undefined;
        if (phase) patchState(store, { dispatched: { ...store.dispatched(), [id]: phase } });
      },
      /** Hides `entry` and moves it to DONE after {@link FINISH_DELAY_MS}, unless undone first. */
      finishLater(projectId: string, entry: WorkEntry): void {
        const id = entry.id;
        const phase = id ? store.pendingFinishes()[id]?.phase : undefined;
        if (!id || phase === 'waiting' || phase === 'sending') return;
        setFinishing(id, undefined);
        setPending(id, { projectId, entry, phase: 'waiting' });
        timers.set(
          id,
          setTimeout(() => void send(id), FINISH_DELAY_MS),
        );
      },
      /** Takes a waiting finish back: the item shows again, and nothing is sent. */
      undoFinish(entityId: string): void {
        if (store.pendingFinishes()[entityId]?.phase !== 'waiting') return;
        stopTimer(entityId);
        setPending(entityId, undefined);
      },
      /** Forgets a failed finish. */
      dismissFinish(entityId: string): void {
        if (store.pendingFinishes()[entityId]?.phase === 'failed') setPending(entityId, undefined);
      },
      /** Sends every waiting finish now. */
      async flushFinishes(): Promise<void> {
        await Promise.all(Object.keys(store.pendingFinishes()).map((id) => send(id)));
      },
    };
  }),
  withHooks((store) => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const leave = () => void store.flushFinishes();
    return {
      onInit: () => {
        if (browser) globalThis.addEventListener('pagehide', leave);
      },
      onDestroy: () => {
        if (browser) globalThis.removeEventListener('pagehide', leave);
      },
    };
  }),
);
