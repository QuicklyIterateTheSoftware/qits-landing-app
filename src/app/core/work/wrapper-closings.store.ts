import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import type { Subscription } from 'rxjs';
import { listWrapperClosings } from '../../api/projects';
import { injectRefreshOn } from '$core/events/refresh-on';
import { LIST_WRAPPER_CLOSINGS, type WrapperClosing } from './work.consumes';

/** The events after which a project's wrapper closings may have moved (see the store's comment). */
export const WRAPPER_CLOSING_EVENTS = [
  'EntityTransitioned',
  'ReleaseRequestStateChanged',
  'ReleaseRequestChanged',
] as const;

/** A project's wrapper closings, as `load` left them. */
export interface WrapperClosingList {
  readonly status: 'loading' | 'loaded' | 'error';
  /** One per VERIFIED ticket; empty while loading and after an error. */
  readonly closings: readonly WrapperClosing[];
}

interface WrapperClosingsState {
  /** Each project's closings, by project id. A project not asked for yet has no key. */
  readonly byProject: Readonly<Record<string, WrapperClosingList>>;
}

/**
 * Where each VERIFIED ticket of a project stands on its way to DONE (qits-1873), from
 * qits-projects' `listWrapperClosings`: one row per ticket, with the verdict of the platform's
 * close rules and the wrapper release request its ledger row names. A VERIFIED ticket's line
 * (`app-wrapper-closing`, in the lists and on its page) reads it by the ticket's qualified id.
 *
 * - `load(projectId)` reads once, and again after an error. The line calls it, in the browser, for
 *   the open project: only a page drawing a VERIFIED ticket asks.
 * - `refresh(projectId)` reads again and keeps the old rows until the answer is in, and if it fails.
 * - `closingOf(projectId, qualifiedId)`: the ticket's row; undefined while not loaded, after an
 *   error, or when the ticket has none.
 * - `follow(destroy, projectId)`: keeps the loaded closings of the project `projectId()` names
 *   current while `destroy` lives.
 *
 * Staleness (qits-1270): `EntityTransitioned` whose `entities[].projectId` names the open project
 * (a ticket reaching VERIFIED gets a row, one leaving it loses it), and `ReleaseRequestStateChanged`
 * or `ReleaseRequestChanged` whose `projectId` is the open project (the wrapper request joined,
 * moved, approved, finalized or withdrawn: the ledger step, the state and the verdict follow) → the
 * project's closings (`refresh`), debounced 1 s, and only once they were loaded. A ledger row moving
 * without its request's event (a ticket's branch pushed, PUSHED) shows on the next load.
 */
export const WrapperClosingsStore = signalStore(
  { providedIn: 'root' },
  withState<WrapperClosingsState>({ byProject: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function set(projectId: string, value: WrapperClosingList): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    async function fetch(projectId: string): Promise<WrapperClosingList> {
      const { data, error } = await consume(
        listWrapperClosings({ path: { project: projectId } }),
        LIST_WRAPPER_CLOSINGS,
      );
      if (error !== undefined || !data) return { status: 'error', closings: [] };
      return { status: 'loaded', closings: data.closings ?? [] };
    }

    async function refresh(projectId: string): Promise<void> {
      const next = await fetch(projectId);
      if (next.status === 'loaded' || !store.byProject()[projectId]) set(projectId, next);
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { status: 'loading', closings: [] });
        set(projectId, await fetch(projectId));
      },
      refresh,
      closingOf(projectId: string, qualifiedId: string): WrapperClosing | undefined {
        return store.byProject()[projectId]?.closings.find((c) => c.ticket === qualifiedId);
      },
      follow(destroy: DestroyRef, projectId: () => string | undefined): Subscription {
        return refreshOn(
          {
            names: WRAPPER_CLOSING_EVENTS,
            when: (_, ids) => {
              const id = projectId();
              return !!id && !!store.byProject()[id] && ids.projectIds.includes(id);
            },
            refresh: () => {
              const id = projectId();
              if (id) void refresh(id);
            },
          },
          destroy,
        );
      },
    };
  }),
);
