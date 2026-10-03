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
  getCampaign,
  listProjectEntities,
  transitionEpic,
  transitionTicket,
} from '../../api/projects';
import {
  countsAsWork,
  GET_CAMPAIGN,
  LIST_PROJECT_ENTITIES,
  TRANSITION_EPIC,
  TRANSITION_TICKET,
  type WorkEntry,
} from './work.consumes';
import { FINISH_DELAY_MS } from './finish-delay';

/** How a finish (a move to DONE) is going: running, or failed. Absent when none is. */
export type FinishState = 'running' | 'error';

type Status = 'loading' | 'loaded' | 'error';

/** A work entity's status word. */
export type WorkStatus = NonNullable<WorkEntry['status']>;

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
}

interface WorkState {
  /** Each project's work, by project id. A project not asked for yet has no key. */
  readonly byProject: Readonly<Record<string, ProjectWork>>;
  /** Each entity's running or failed finish, by entity id. */
  readonly finishing: Readonly<Record<string, FinishState>>;
  /** Each finish asked for with `finishLater` and not settled yet, by entity id, oldest first. */
  readonly pendingFinishes: Readonly<Record<string, PendingFinish>>;
  /** Each entity's running or failed `transition`, by entity id. */
  readonly transitioning: Readonly<Record<string, FinishState>>;
}

/**
 * Each project's work entities, from qits-projects' `listProjectEntities` (the whole planning
 * tree, unfiltered): one request per project, shared by the project card and the Work pages.
 *
 * - `load(projectId)` fetches once, and again after an error. Nothing calls it on its own: the
 *   project card does in the browser, and `SelectedWork` for the open project.
 * - Which entities count as work is `countsAsWork` in `work.consumes.ts`.
 * - Each campaign in the tree is then asked for its members (`getCampaign`), one request per
 *   campaign: membership lives on the campaign, not on the entity. A failed campaign read fails the
 *   project's work, as a partial tree would group wrongly.
 * - `refresh(projectId)` fetches again and keeps showing the old work until the answer is in.
 * - `finish(projectId, entry)` moves a VERIFIED epic or ticket to DONE (`transitionEpic`,
 *   `transitionTicket`) and writes the answered status into the entry: it leaves the Acceptance list for the
 *   archive. DONE is final in qits-projects; nothing moves it back.
 * - `finishLater(projectId, entry)` is the Acceptance list's finish: the item is hidden at once (`hidden`),
 *   and `finish` runs after {@link FINISH_DELAY_MS}, unless `undoFinish(id)` takes it back first.
 *   On failure the item shows again and the pending finish stays `failed` until `dismissFinish`.
 *   Leaving the page (`pagehide`) sends every waiting finish at once: the user had their chance to
 *   undo, and the request is sent with `keepalive`, so it outlives the page.
 * - `transition(projectId, entry, target)` moves an epic or a ticket to any status its lifecycle
 *   allows (the work item page's Mark refined and Drop), through the same doors as `finish`, and
 *   writes the answered status into the entry. `transitioning` holds a running or failed move.
 */
export const WorkStore = signalStore(
  { providedIn: 'root' },
  withState<WorkState>({ byProject: {}, finishing: {}, pendingFinishes: {}, transitioning: {} }),
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
     * Moves an epic or a ticket to `target` through its lifecycle door, and writes the answered
     * status into its entry. The answered status, or undefined when the move failed.
     */
    async function move(
      projectId: string,
      entry: WorkEntry,
      target: WorkStatus,
    ): Promise<WorkStatus | undefined> {
      const id = entry.id;
      if (!id) return undefined;
      // `keepalive`: a finish sent as the page is left must still arrive.
      const options = { path: { id }, body: { target }, keepalive: true };
      const status =
        entry.archetype === 'EPIC'
          ? await consume(transitionEpic(options), TRANSITION_EPIC).then(({ data, error }) =>
              error === undefined ? data?.epic?.status : undefined,
            )
          : await consume(transitionTicket(options), TRANSITION_TICKET).then(({ data, error }) =>
              error === undefined ? data?.ticket?.status : undefined,
            );
      if (!status) return undefined;
      settled.set(id, { status, at: ++clock });
      const work = store.byProject()[projectId];
      if (work) {
        const entries = work.entries.map((e) => (e.id === id ? { ...e, status } : e));
        set(projectId, { ...work, entries, count: entries.filter(countsAsWork).length });
      }
      return status;
    }

    async function finish(projectId: string, entry: WorkEntry): Promise<void> {
      const id = entry.id;
      if (!id || store.finishing()[id] === 'running') return;
      setFinishing(id, 'running');
      const status = await move(projectId, entry, 'DONE');
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
        listProjectEntities({ path: { projectId } }),
        LIST_PROJECT_ENTITIES,
      );
      const entries = withSettled(data?.entities ?? [], startedAt);
      const campaignIds = entries.flatMap((e) =>
        e.archetype === 'CAMPAIGN' && e.id ? [e.id] : [],
      );
      const answers = await Promise.all(
        campaignIds.map((id) => consume(getCampaign({ path: { id } }), GET_CAMPAIGN)),
      );
      const failed =
        error !== undefined || !data || answers.some((a) => a.error !== undefined || !a.data);
      const campaigns = Object.fromEntries(
        answers.map((a, i) => [
          campaignIds[i],
          (a.data?.campaign?.members ?? []).flatMap((m) => (m.entity?.id ? [m.entity.id] : [])),
        ]),
      );
      return failed
        ? { status: 'error', count: 0, entries: [], campaigns: {} }
        : { status: 'loaded', count: entries.filter(countsAsWork).length, entries, campaigns };
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { status: 'loading', count: 0, entries: [], campaigns: {} });
        set(projectId, await fetch(projectId));
      },
      /** Fetches again; the old work stays until the answer is in, and stays if it fails. */
      async refresh(projectId: string): Promise<void> {
        const next = await fetch(projectId);
        if (next.status === 'loaded' || !store.byProject()[projectId]) set(projectId, next);
      },
      /** Moves `entry` to DONE now. */
      finish,
      /** Moves an epic or a ticket to `target` (Mark refined, Drop); a running move is not repeated. */
      async transition(projectId: string, entry: WorkEntry, target: WorkStatus): Promise<void> {
        const id = entry.id;
        if (!id || store.transitioning()[id] === 'running') return;
        setTransitioning(id, 'running');
        const status = await move(projectId, entry, target);
        setTransitioning(id, status ? undefined : 'error');
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
