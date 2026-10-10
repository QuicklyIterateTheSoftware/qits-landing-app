import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listRuns as listRepositoryRuns } from '../../api/ci';
import { LIST_REPOSITORY_RUNS, type CiRun } from './ci-runs.consumes';

/** How many of a repository's newest runs are read. */
export const RUNS_LIMIT = 100;

/** A repository's runs, as `load` left them. */
export interface RepositoryRuns {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Newest first, at most {@link RUNS_LIMIT}. */
  readonly runs: readonly CiRun[];
}

interface CiRunsState {
  /** Each repository's runs, by repository id. */
  readonly byRepository: Readonly<Record<string, RepositoryRuns>>;
}

/**
 * CI runs from qits-ci, by repository: its newest {@link RUNS_LIMIT} runs, newest first.
 *
 * - `load(repoId)` reads once, and again after an error.
 * - `refresh(repoId)` reads again and keeps the last good answer if it fails.
 *
 * The release request page calls both, in the browser: the runs of a request are the ones that
 * name it (`releaseRequestId`) plus the ones the request names.
 */
export const CiRunsStore = signalStore(
  { providedIn: 'root' },
  withState<CiRunsState>({ byRepository: {} }),
  withMethods((store) => {
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

    return {
      async load(repoId: string): Promise<void> {
        const current = store.byRepository()[repoId];
        if (!repoId || (current && current.status !== 'error')) return;
        set(repoId, { status: 'loading', runs: [] });
        await fetch(repoId);
      },
      async refresh(repoId: string): Promise<void> {
        if (!store.byRepository()[repoId]) return;
        await fetch(repoId);
      },
    };
  }),
);
