import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listActiveRuns, listRuns as listRepositoryRuns } from '../../api/ci';
import { injectRefreshOn } from '$core/events/refresh-on';
import { BUILD_EVENTS } from './build-events';
import {
  LIST_ACTIVE_RUNS,
  LIST_REPOSITORY_RUNS,
  type ActiveCiRun,
  type CiRun,
} from './ci-runs.consumes';

/** How many of a repository's newest runs are read. */
export const RUNS_LIMIT = 100;

/** A repository's runs, as `load` left them. */
export interface RepositoryRuns {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Newest first, at most {@link RUNS_LIMIT}. */
  readonly runs: readonly CiRun[];
}

/** Every queued or running run, as `loadActive` left them. */
export interface ActiveRuns {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Newest first. */
  readonly runs: readonly ActiveCiRun[];
}

interface CiRunsState {
  /** Each repository's runs, by repository id. */
  readonly byRepository: Readonly<Record<string, RepositoryRuns>>;
  /** Every queued or running run, all repositories; absent until `loadActive`. */
  readonly active: ActiveRuns | undefined;
}

/**
 * CI runs from qits-ci, by repository: its newest {@link RUNS_LIMIT} runs, newest first.
 *
 * - `load(repoId)` reads once, and again after an error.
 * - `refresh(repoId)` reads again and keeps the last good answer if it fails.
 *
 * - `follow(repoId, destroy)` keeps `repoId()`'s runs current while `destroy` lives.
 *
 * The release request page calls them, in the browser: the runs of a request are the ones that
 * name it (`releaseRequestId`) plus the ones the request names.
 *
 * - `loadActive()` reads every queued or running run (`/ci/api/runs/active`) once, and again after
 *   an error; `followActive(repoIds, destroy)` keeps it current. The lightning menu marks each
 *   pending request with its active runs.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` (`BuildStatusChanged`, `BuildSuccessful`, `BuildFailed`)
 * whose `repoId` is the followed repository → that repository's runs (`refresh`), at most once a
 * second. A new run shows with its first `BuildStatusChanged`. The same events whose `repoId` is
 * one of `followActive`'s repositories → the active runs, once they were read.
 */
export const CiRunsStore = signalStore(
  { providedIn: 'root' },
  withState<CiRunsState>({ byRepository: {}, active: undefined }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function set(repoId: string, value: RepositoryRuns): void {
      patchState(store, { byRepository: { ...store.byRepository(), [repoId]: value } });
    }

    async function fetch(repoId: string): Promise<void> {
      const { data, error } = await consume(
        listRepositoryRuns({ query: { repositoryId: repoId, limit: RUNS_LIMIT } }),
        LIST_REPOSITORY_RUNS,
      );
      if (error !== undefined || !data) {
        if (store.byRepository()[repoId]?.status !== 'loaded') {
          set(repoId, { status: 'error', runs: [] });
        }
        return;
      }
      set(repoId, { status: 'loaded', runs: data.runs ?? [] });
    }

    async function refresh(repoId: string): Promise<void> {
      if (!store.byRepository()[repoId]) return;
      await fetch(repoId);
    }

    async function fetchActive(): Promise<void> {
      const { data, error } = await consume(listActiveRuns(), LIST_ACTIVE_RUNS);
      if (error !== undefined || !data) {
        if (store.active()?.status !== 'loaded')
          patchState(store, { active: { status: 'error', runs: [] } });
        return;
      }
      patchState(store, { active: { status: 'loaded', runs: data.runs ?? [] } });
    }

    return {
      async load(repoId: string): Promise<void> {
        const current = store.byRepository()[repoId];
        if (!repoId || (current && current.status !== 'error')) return;
        set(repoId, { status: 'loading', runs: [] });
        await fetch(repoId);
      },
      refresh,
      /** Reads `repoId()`'s runs again after a build event naming it, until `destroy`. */
      follow(repoId: () => string | undefined, destroy: DestroyRef): void {
        refreshOn(
          {
            names: BUILD_EVENTS,
            when: (_, ids) => !!ids.repositoryId && ids.repositoryId === repoId(),
            refresh: () => {
              const id = repoId();
              if (id) void refresh(id);
            },
          },
          destroy,
        );
      },
      async loadActive(): Promise<void> {
        const current = store.active();
        if (current && current.status !== 'error') return;
        patchState(store, { active: { status: 'loading', runs: [] } });
        await fetchActive();
      },
      /**
       * Reads the active runs again after a build event of one of `repoIds()`, until `destroy`;
       * only once `loadActive` has read them.
       */
      followActive(repoIds: () => readonly (string | undefined)[], destroy: DestroyRef): void {
        refreshOn(
          {
            names: BUILD_EVENTS,
            when: (_, ids) => !!ids.repositoryId && repoIds().includes(ids.repositoryId),
            refresh: () => {
              if (store.active()) void fetchActive();
            },
          },
          destroy,
        );
      },
    };
  }),
);
