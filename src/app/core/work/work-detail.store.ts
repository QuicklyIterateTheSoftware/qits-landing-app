import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  addWorkComment,
  editWorkComment,
  getWork,
  listWorkComments,
  listWorkDossier,
  listWorkDossierAssets,
} from '../../api/projects';
import { PlatformOrigins } from '$core/platform/platform-origins';
import {
  GET_WORK,
  GET_WORK_CRITERIA,
  LIST_DOSSIER_PAGES,
  LIST_WORK_COMMENTS,
  LIST_WORK_DOSSIER_ASSETS,
  WORK_COMMENT,
  type CommentEntry,
  type DossierPage,
  type EntityDetail,
} from './work-detail.consumes';

/** One work item's page data, as `load(ref)` left it. */
export interface WorkDetail {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly entity?: EntityDetail;
  /** The thread, oldest first. */
  readonly comments: readonly CommentEntry[];
  /** The dossier's pages in position order: an epic's or a ticket's; none for other archetypes. */
  readonly pages: readonly DossierPage[];
  /**
   * The epic's figures: each address its pages name a figure with, mapped to where the browser
   * loads it (qits-projects' API origin and the figure's `/work/{qualifiedId}/dossier-assets/{id}/
   * content`). Empty for other archetypes.
   */
  readonly figures: Readonly<Record<string, string>>;
}

/** What a comment write answered: nothing when it went through, else why not, for a person. */
export interface CommentOutcome {
  readonly refusal?: string;
}

/**
 * Why a comment write failed: the HTTP status and the service's `message` when it sent one (its
 * OpenAPI document gives error answers no body, so it is read defensively), or "the service is
 * unreachable" when nothing answered.
 */
export function commentRefusal(error: unknown, httpStatus: number | undefined): string {
  if (!httpStatus) return 'the service is unreachable';
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim()
    ? `${httpStatus} ${message}`
    : `${httpStatus}`;
}

const LOADING: WorkDetail = { status: 'loading', comments: [], pages: [], figures: {} };

/** One item's acceptance criteria, as `loadCriteria(ref)` left them. */
export interface WorkCriteria {
  readonly status: 'loading' | 'loaded' | 'error';
  /** In order; empty while loading, after an error, and for an item that has none. */
  readonly items: readonly string[];
}

interface WorkDetailState {
  /** Each item's page data, by the reference it was loaded with (its qualified id). */
  readonly byRef: Readonly<Record<string, WorkDetail>>;
  /** Each item's acceptance criteria, by the reference they were loaded with (its qualified id). */
  readonly criteria: Readonly<Record<string, WorkCriteria>>;
}

/**
 * The data of one work item's page beyond what the project's work list holds, from qits-projects'
 * `/work` doors, all by qualified id: the item itself (`getWork`), its comments
 * (`listWorkComments`) and its dossier — an epic's or a ticket's pages (`listWorkDossier`), and an
 * epic's figures (`listWorkDossierAssets`). Features, tasks and campaigns have no dossier.
 *
 * - `load(ref)` reads by the qualified id the page's URL names, once, and again after an error.
 *   The item and its comments come together; the dossier follows, by the same reference, as the
 *   item's archetype calls for.
 *   Any failed read fails the whole page's data. Nothing calls it on its own: the work item page
 *   does, in the browser.
 * - `refresh(ref)` reads again and keeps the old data until the answer is in.
 * - `of(ref)`: the data, or undefined before `load`.
 * - `addComment(ref, body)` comments on the item (`addWorkComment`, ported from
 *   qits-projects-frontend's thread: only the body travels, the author is the session's), and
 *   `editComment(ref, commentId, body)` rewrites one comment's body (`editWorkComment`). The answered
 *   comment goes into the loaded thread (a new one last, an edited one in its place), so it shows
 *   without a second read. A refusal comes back as `refusal`, and the thread stays as it was.
 * - `loadCriteria(ref)` reads the item's acceptance criteria alone (`getWork`), once, and again
 *   after an error: the Schedule tab shows them for each item it lists. `criteriaOf(ref)`: them,
 *   or undefined before `loadCriteria`.
 *
 * Staleness (qits-1270): `EntityTransitioned` naming the item among its `entities[].entityId` →
 * that item's page data (`refresh`), wired by the work item page while it shows the item. Nothing
 * else of it has an event: qits-projects announces no comment added or edited (another tab's, or
 * an agent's), no dossier page or figure written, moved or deleted, and no edit of the item's
 * fields (description, acceptance criteria, impetus, assignee, depends-on, blocked), so those show
 * on the next visit. The acceptance criteria (`loadCriteria`) change only by such an edit, and
 * are read once.
 */
export const WorkDetailStore = signalStore(
  { providedIn: 'root' },
  withState<WorkDetailState>({ byRef: {}, criteria: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);

    function set(ref: string, value: WorkDetail): void {
      patchState(store, { byRef: { ...store.byRef(), [ref]: value } });
    }

    async function dossierOf(
      ref: string,
      entity: EntityDetail,
    ): Promise<Omit<WorkDetail, 'status'> | null> {
      const qualifiedId = ref;
      if (entity.archetype === 'EPIC') {
        const [pages, assets] = await Promise.all([
          consume(listWorkDossier({ path: { qualifiedId } }), LIST_DOSSIER_PAGES),
          consume(listWorkDossierAssets({ path: { qualifiedId } }), LIST_WORK_DOSSIER_ASSETS),
        ]);
        if (pages.error !== undefined || assets.error !== undefined) return null;
        // The pages name a figure by its stored address (`url`, data in their bodies); the browser
        // loads it through the `/work` content door, by the item's qualified id and the figure's id.
        const work = `${origins.api('projects')}/projects/api/work/${encodeURIComponent(qualifiedId)}`;
        const figures = Object.fromEntries(
          (assets.data?.assets ?? []).flatMap((a) =>
            a.url && a.id
              ? [[a.url, `${work}/dossier-assets/${encodeURIComponent(a.id)}/content`]]
              : [],
          ),
        );
        return { entity, comments: [], pages: pages.data?.pages ?? [], figures };
      }
      if (entity.archetype === 'TICKET') {
        const pages = await consume(listWorkDossier({ path: { qualifiedId } }), LIST_DOSSIER_PAGES);
        if (pages.error !== undefined) return null;
        return { entity, comments: [], pages: pages.data?.pages ?? [], figures: {} };
      }
      return { entity, comments: [], pages: [], figures: {} };
    }

    async function fetch(ref: string): Promise<WorkDetail> {
      const [item, thread] = await Promise.all([
        consume(getWork({ path: { qualifiedId: ref } }), GET_WORK),
        consume(listWorkComments({ path: { qualifiedId: ref } }), LIST_WORK_COMMENTS),
      ]);
      if (item.error !== undefined || !item.data || thread.error !== undefined) {
        return { ...LOADING, status: 'error' };
      }
      const dossier = await dossierOf(ref, item.data);
      if (!dossier) return { ...LOADING, status: 'error' };
      const comments = (thread.data?.entries ?? []).flatMap((e) => (e.comment ? [e.comment] : []));
      return { ...dossier, status: 'loaded', comments };
    }

    /** Puts `comment` into `ref`'s loaded thread: in place of the one with its id, else last. */
    function putComment(ref: string, comment: CommentEntry): void {
      const current = store.byRef()[ref];
      if (!current || current.status !== 'loaded') return;
      const known = current.comments.some((c) => c.id === comment.id);
      const comments = known
        ? current.comments.map((c) => (c.id === comment.id ? comment : c))
        : [...current.comments, comment];
      set(ref, { ...current, comments });
    }

    /** A comment write's answer as an outcome; the answered comment is put in the thread. */
    function written(
      answer: {
        readonly data?: { readonly comment?: CommentEntry };
        readonly error?: unknown;
        readonly response?: { readonly status: number };
      },
      ref: string,
    ): CommentOutcome {
      const { data, error, response } = answer;
      const comment = error === undefined ? data?.comment : undefined;
      if (!comment) return { refusal: commentRefusal(error, response?.status) };
      putComment(ref, comment);
      return {};
    }

    return {
      async load(ref: string): Promise<void> {
        const current = store.byRef()[ref];
        if (!ref || (current && current.status !== 'error')) return;
        set(ref, LOADING);
        set(ref, await fetch(ref));
      },
      /** Reads again; the old data stays until the answer is in, and stays if it fails. */
      async refresh(ref: string): Promise<void> {
        const next = await fetch(ref);
        if (next.status === 'loaded' || !store.byRef()[ref]) set(ref, next);
      },
      of(ref: string): WorkDetail | undefined {
        return store.byRef()[ref];
      },
      /** Sends the body as typed, trimmed; a blank one is not sent. */
      async addComment(ref: string, body: string): Promise<CommentOutcome> {
        const text = body.trim();
        if (!ref || !text) return { refusal: 'a comment needs some text' };
        return written(
          await consume(
            addWorkComment({ path: { qualifiedId: ref }, body: { body: text } }),
            WORK_COMMENT,
          ),
          ref,
        );
      },
      /**
       * A JSON merge patch of the body alone, sent as plain `application/json` as the old UI sent it:
       * the door reads either spelling, and the golden master records that one.
       */
      async editComment(ref: string, commentId: string, body: string): Promise<CommentOutcome> {
        const text = body.trim();
        if (!ref || !commentId || !text) return { refusal: 'a comment needs some text' };
        return written(
          await consume(
            editWorkComment({
              path: { qualifiedId: ref, commentId },
              body: { body: text },
              headers: { 'Content-Type': 'application/json' },
            }),
            WORK_COMMENT,
          ),
          ref,
        );
      },
      async loadCriteria(ref: string): Promise<void> {
        const current = store.criteria()[ref];
        if (!ref || (current && current.status !== 'error')) return;
        const put = (value: WorkCriteria) =>
          patchState(store, { criteria: { ...store.criteria(), [ref]: value } });
        put({ status: 'loading', items: [] });
        const { data, error } = await consume(
          getWork({ path: { qualifiedId: ref } }),
          GET_WORK_CRITERIA,
        );
        put(
          error !== undefined || !data
            ? { status: 'error', items: [] }
            : { status: 'loaded', items: data.acceptanceCriteria ?? [] },
        );
      },
      criteriaOf(ref: string): WorkCriteria | undefined {
        return store.criteria()[ref];
      },
    };
  }),
);
