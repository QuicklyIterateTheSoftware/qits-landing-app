import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import type { Subscription } from 'rxjs';
import {
  archiveIdea,
  createIdea,
  getIdea,
  listIdeas,
  patchIdea,
  reprioritizeIdea,
  unarchiveIdea,
} from '../../api/projects';
import type { DomainEvent } from '$core/events/domain-events';
import { injectRefreshOn } from '$core/events/refresh-on';
import type { ReorderAnchor } from '$core/reorder/reorder-anchor';
import { inIdeaRank } from './idea-rank';
import { IDEA_EVENTS } from './idea-events';
import {
  GET_IDEA,
  IDEA_REFUSAL,
  IDEA_WRITTEN,
  LIST_IDEAS,
  REPRIORITIZE_IDEA,
  type IdeaDetail,
  type IdeaEntry,
  type IdeaPriorities,
  type WrittenIdea,
} from './ideas.consumes';

/** A project's ideas, as `loadList` left them. */
export interface IdeaList {
  readonly status: 'loading' | 'loaded' | 'error';
  /**
   * In rank order (`byIdeaRank`, qits-1791): as the service answers, and sorted again after a
   * drop's priorities are written in. Empty while loading and after an error.
   */
  readonly ideas: readonly IdeaEntry[];
}

/** One idea's page data, as `loadIdea` left it. */
export interface IdeaView {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly idea?: IdeaDetail;
}

/** What a write answered: the idea as written, or why not. */
export type IdeaOutcome =
  | { readonly ok: true; readonly idea: WrittenIdea }
  | { readonly ok: false; readonly refusal: string };

/** Where a dragged idea now sits: directly above one rankable idea, or directly below one. */
export type IdeaAnchor = ReorderAnchor;

/** What a drop answered: the renumbered ideas, or why not. */
export type IdeaRankOutcome =
  | { readonly ok: true; readonly priorities: IdeaPriorities }
  | { readonly ok: false; readonly refusal: string };

/** A new idea: its title, and optionally its description and the idea enabling it. */
export interface IdeaDraft {
  readonly title: string;
  readonly description?: string;
  readonly enabledBy?: string;
}

/** An edit, as a JSON merge patch: a field left out stays, `null` clears it. */
export interface IdeaPatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly enabledBy?: string | null;
}

/**
 * Why a write was refused, for a person: the service's `message` as it is (a 400 names the rule
 * the title or description broke), else the status, else "the service is unreachable".
 */
export function ideaRefusal(error: unknown, httpStatus: number | undefined): string {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  return httpStatus
    ? `The service refused it (HTTP ${httpStatus}).`
    : 'The service is unreachable.';
}

interface IdeasState {
  /** Each project's list, by `listKey(projectId, archived)`. */
  readonly lists: Readonly<Record<string, IdeaList>>;
  /** Each idea's page data, by its id. */
  readonly ideas: Readonly<Record<string, IdeaView>>;
  /** Why each project's last drop was refused, by project id; gone when the next drop starts. */
  readonly rankRefusals: Readonly<Record<string, string | undefined>>;
}

/** A list's key: the project, and whether the archived ideas are in it. */
const listKey = (projectId: string, archived: boolean) =>
  `${projectId}|${archived ? 'all' : 'open'}`;

/** Both of a project's list keys: without and with the archived ideas. */
const listKeys = (projectId: string) => [listKey(projectId, false), listKey(projectId, true)];

/**
 * A project's ideas (epic qits-888), from qits-projects' `/ideas` doors.
 *
 * - `loadList(projectId, archived)` reads the project's ideas once (`listIdeas`, `?project=` by
 *   id), and again after an error; `archived` reads the archived ones beside the others
 *   (`&archived=true`). The status filter is the page's, over the answer: one read serves all three.
 *   `refreshList` reads again and keeps the old list until the answer is in. `listOf` gives it.
 * - `loadIdea(id)` reads one idea's page (`getIdea`): the idea, the idea enabling it, the ideas it
 *   enables and the work it inspired. `refreshIdea`, `ideaOf` as for the list.
 * - `create(projectId, draft)`, `update(id, patch)`, `archive(id, reason)`, `unarchive(id)`: the
 *   writes. Each answers an {@link IdeaOutcome}; a refusal carries the service's `message`. The
 *   pages read again what they show afterwards.
 * - `reprioritize(projectId, ideaId, anchor)` puts a rankable idea directly above or below another
 *   one (`reprioritizeIdea`, qits-1791): a drop on the Ideas page. The renumbered ideas the service
 *   answers are written into the project's cached lists at once, which are sorted again, so the
 *   idea stays where it was dropped. A refusal (400 for an anchor that is no rankable idea of the
 *   project, 404, 409 for an archived or DONE idea) reads the project's lists again, so the idea
 *   goes back, and is kept for the page (`rankRefusalOf(projectId)`) until the next drop.
 * - `follow(destroy, projectId, refresh)`: calls `refresh` after the idea events about the
 *   project `projectId()` names when the event arrives.
 *
 * Staleness (qits-1270): `IDEA_EVENTS` (`IdeaCreated`, `IdeaUpdated`, `IdeaArchived`,
 * `IdeaUnarchived`) whose `projectId` is the open project → the Ideas page's list
 * (`refreshList`), and on an idea's page that idea (`refreshIdea`: any idea of the project can be
 * the one it enables or is enabled by, so every such event reads it again), each through `follow`,
 * debounced 1 s. An event about another project reads nothing. A drop announces `IdeaUpdated` for
 * each idea it renumbered, so other open lists follow it the same way. The work an idea inspired moves on
 * `EntityTransitioned`, which the idea's derived status follows as an `IdeaUpdated`; a move that
 * does not change the status shows on the next visit.
 */
export const IdeasStore = signalStore(
  { providedIn: 'root' },
  withState<IdeasState>({ lists: {}, ideas: {}, rankRefusals: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function setList(key: string, value: IdeaList): void {
      patchState(store, { lists: { ...store.lists(), [key]: value } });
    }

    function setIdea(id: string, value: IdeaView): void {
      patchState(store, { ideas: { ...store.ideas(), [id]: value } });
    }

    async function fetchList(projectId: string, archived: boolean): Promise<IdeaList> {
      const query = archived ? { project: projectId, archived: true } : { project: projectId };
      const { data, error } = await consume(listIdeas({ query }), LIST_IDEAS);
      if (error !== undefined || !data) return { status: 'error', ideas: [] };
      return { status: 'loaded', ideas: inIdeaRank(data.ideas ?? []) };
    }

    async function fetchIdea(id: string): Promise<IdeaView> {
      const { data, error } = await consume(getIdea({ path: { id } }), GET_IDEA);
      if (error !== undefined || !data) return { status: 'error' };
      return { status: 'loaded', idea: data };
    }

    async function refreshList(projectId: string, archived: boolean): Promise<void> {
      const key = listKey(projectId, archived);
      const next = await fetchList(projectId, archived);
      if (next.status === 'loaded' || !store.lists()[key]) setList(key, next);
    }

    function setRankRefusal(projectId: string, refusal: string | undefined): void {
      patchState(store, { rankRefusals: { ...store.rankRefusals(), [projectId]: refusal } });
    }

    /** Writes a drop's priorities into the project's cached lists, and sorts them again. */
    function applyPriorities(projectId: string, priorities: IdeaPriorities): void {
      const written = new Map(
        (priorities.items ?? []).flatMap((item) => (item.id ? [[item.id, item.priority]] : [])),
      );
      if (!written.size) return;
      const lists = { ...store.lists() };
      for (const key of listKeys(projectId)) {
        const list = lists[key];
        if (list?.status !== 'loaded') continue;
        const ideas = list.ideas.map((idea) =>
          idea.id && written.has(idea.id) ? { ...idea, priority: written.get(idea.id) } : idea,
        );
        lists[key] = { ...list, ideas: inIdeaRank(ideas) };
      }
      patchState(store, { lists });
    }

    function written(answer: {
      readonly data?: WrittenIdea;
      readonly error?: unknown;
      readonly response?: { readonly status: number };
    }): IdeaOutcome {
      const { data, error, response } = answer;
      if (error !== undefined || !data?.id) {
        return { ok: false, refusal: ideaRefusal(error, response?.status) };
      }
      return { ok: true, idea: data };
    }

    return {
      async loadList(projectId: string, archived = false): Promise<void> {
        const key = listKey(projectId, archived);
        const current = store.lists()[key];
        if (!projectId || (current && current.status !== 'error')) return;
        setList(key, { status: 'loading', ideas: [] });
        setList(key, await fetchList(projectId, archived));
      },
      /** Reads again; the old list stays until the answer is in, and stays if it fails. */
      refreshList(projectId: string, archived = false): Promise<void> {
        return refreshList(projectId, archived);
      },
      listOf(projectId: string, archived = false): IdeaList | undefined {
        return store.lists()[listKey(projectId, archived)];
      },
      async loadIdea(id: string): Promise<void> {
        const current = store.ideas()[id];
        if (!id || (current && current.status !== 'error')) return;
        setIdea(id, { status: 'loading' });
        setIdea(id, await fetchIdea(id));
      },
      /** Reads again; the old idea stays until the answer is in, and stays if it fails. */
      async refreshIdea(id: string): Promise<void> {
        const next = await fetchIdea(id);
        if (next.status === 'loaded' || !store.ideas()[id]) setIdea(id, next);
      },
      ideaOf(id: string): IdeaView | undefined {
        return store.ideas()[id];
      },
      /** Sends the title and description trimmed; a blank description or enabledBy is not sent. */
      async create(projectId: string, draft: IdeaDraft): Promise<IdeaOutcome> {
        const description = draft.description?.trim();
        const enabledBy = draft.enabledBy?.trim();
        const body = {
          project: projectId,
          title: draft.title.trim(),
          ...(description ? { description } : {}),
          ...(enabledBy ? { enabledBy } : {}),
        };
        return written(await consume(createIdea({ body }), IDEA_WRITTEN, IDEA_REFUSAL));
      },
      /**
       * A JSON merge patch, sent as plain `application/json`: the door reads either spelling, and the
       * golden master records that one (as `WorkDetailStore.editComment`).
       */
      async update(id: string, patch: IdeaPatch): Promise<IdeaOutcome> {
        return written(
          await consume(
            patchIdea({
              path: { id },
              body: { ...patch },
              headers: { 'Content-Type': 'application/json' },
            }),
            IDEA_WRITTEN,
            IDEA_REFUSAL,
          ),
        );
      },
      async archive(id: string, reason: string): Promise<IdeaOutcome> {
        const text = reason.trim();
        if (!text) return { ok: false, refusal: 'Archiving needs a reason.' };
        return written(
          await consume(
            archiveIdea({ path: { id }, body: { reason: text } }),
            IDEA_WRITTEN,
            IDEA_REFUSAL,
          ),
        );
      },
      async unarchive(id: string): Promise<IdeaOutcome> {
        return written(await consume(unarchiveIdea({ path: { id } }), IDEA_WRITTEN, IDEA_REFUSAL));
      },
      /**
       * Sends a drop; the answer's priorities order the cached lists at once. A refusal reads the
       * project's loaded lists again and is kept in `rankRefusalOf(projectId)`.
       */
      async reprioritize(
        projectId: string,
        ideaId: string,
        anchor: IdeaAnchor,
      ): Promise<IdeaRankOutcome> {
        setRankRefusal(projectId, undefined);
        const { data, error, response } = await consume(
          reprioritizeIdea({ path: { id: ideaId }, body: anchor }),
          REPRIORITIZE_IDEA,
          IDEA_REFUSAL,
        );
        if (error !== undefined || !data) {
          const refusal = ideaRefusal(error, response?.status);
          setRankRefusal(projectId, refusal);
          for (const archived of [false, true]) {
            if (store.lists()[listKey(projectId, archived)]) {
              void refreshList(projectId, archived);
            }
          }
          return { ok: false, refusal };
        }
        applyPriorities(projectId, data);
        return { ok: true, priorities: data };
      },
      /** Why the project's last drop was refused, in the service's words; none after a success. */
      rankRefusalOf(projectId: string): string | undefined {
        return store.rankRefusals()[projectId];
      },
      follow(
        destroy: DestroyRef,
        projectId: () => string | undefined,
        refresh: (events: readonly DomainEvent[]) => void,
      ): Subscription {
        return refreshOn(
          {
            names: IDEA_EVENTS,
            when: (_, ids) => {
              const id = projectId();
              return !!id && ids.projectId === id;
            },
            refresh,
          },
          destroy,
        );
      },
    };
  }),
);
