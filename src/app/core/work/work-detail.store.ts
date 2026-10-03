import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  getEntity,
  listEntityComments,
  listEpicDossierAssets,
  listEpicDossierPages,
  listTicketDossierPages,
} from '../../api/projects';
import { PlatformOrigins } from '$core/platform/platform-origins';
import {
  GET_ENTITY,
  LIST_DOSSIER_PAGES,
  LIST_ENTITY_COMMENTS,
  LIST_EPIC_DOSSIER_ASSETS,
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
   * loads it (qits-projects' API origin and path). Empty for other archetypes.
   */
  readonly figures: Readonly<Record<string, string>>;
}

const LOADING: WorkDetail = { status: 'loading', comments: [], pages: [], figures: {} };

interface WorkDetailState {
  /** Each item's page data, by the reference it was loaded with (its qualified id). */
  readonly byRef: Readonly<Record<string, WorkDetail>>;
}

/**
 * The data of one work item's page beyond what the project's work list holds, from qits-projects:
 * the item itself (`getEntity`), its comments (`listEntityComments`) and its dossier — an epic's
 * pages and figures (`listEpicDossierPages`, `listEpicDossierAssets`), a ticket's pages
 * (`listTicketDossierPages`). Features, tasks and campaigns have no dossier.
 *
 * - `load(ref)` reads by the qualified id the page's URL names, once, and again after an error.
 *   The item and its comments come together; the dossier follows, by the item's id and archetype.
 *   Any failed read fails the whole page's data. Nothing calls it on its own: the work item page
 *   does, in the browser.
 * - `refresh(ref)` reads again and keeps the old data until the answer is in.
 * - `of(ref)`: the data, or undefined before `load`.
 */
export const WorkDetailStore = signalStore(
  { providedIn: 'root' },
  withState<WorkDetailState>({ byRef: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);

    function set(ref: string, value: WorkDetail): void {
      patchState(store, { byRef: { ...store.byRef(), [ref]: value } });
    }

    async function dossierOf(entity: EntityDetail): Promise<Omit<WorkDetail, 'status'> | null> {
      const id = entity.id;
      if (entity.archetype === 'EPIC' && id) {
        const [pages, assets] = await Promise.all([
          consume(listEpicDossierPages({ path: { epicId: id } }), LIST_DOSSIER_PAGES),
          consume(listEpicDossierAssets({ path: { epicId: id } }), LIST_EPIC_DOSSIER_ASSETS),
        ]);
        if (pages.error !== undefined || assets.error !== undefined) return null;
        const api = `${origins.api('projects')}/projects/api`;
        const figures = Object.fromEntries(
          (assets.data?.assets ?? []).flatMap((a) => (a.url ? [[a.url, `${api}${a.url}`]] : [])),
        );
        return { entity, comments: [], pages: pages.data?.pages ?? [], figures };
      }
      if (entity.archetype === 'TICKET' && id) {
        const pages = await consume(
          listTicketDossierPages({ path: { ticketId: id } }),
          LIST_DOSSIER_PAGES,
        );
        if (pages.error !== undefined) return null;
        return { entity, comments: [], pages: pages.data?.pages ?? [], figures: {} };
      }
      return { entity, comments: [], pages: [], figures: {} };
    }

    async function fetch(ref: string): Promise<WorkDetail> {
      const [item, thread] = await Promise.all([
        consume(getEntity({ path: { id: ref } }), GET_ENTITY),
        consume(listEntityComments({ path: { id: ref } }), LIST_ENTITY_COMMENTS),
      ]);
      if (item.error !== undefined || !item.data || thread.error !== undefined) {
        return { ...LOADING, status: 'error' };
      }
      const dossier = await dossierOf(item.data);
      if (!dossier) return { ...LOADING, status: 'error' };
      const comments = (thread.data?.entries ?? []).flatMap((e) => (e.comment ? [e.comment] : []));
      return { ...dossier, status: 'loaded', comments };
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
    };
  }),
);
