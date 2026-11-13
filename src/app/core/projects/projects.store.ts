import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { listProjectReleaseRequests } from '../../api/projects';
import { consume } from '@qits/angular';
import {
  isPendingRelease,
  LIST_PROJECT_RELEASE_REQUESTS,
  type ReleaseRequestEntry,
} from './projects.consumes';

/** A project as the app keeps it (`SelectedProject`'s list). */
export type { Project } from './selected-project';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** A project's release requests, as `loadReleaseRequests(projectId)` left them. */
export interface ProjectReleaseRequests {
  readonly status: Exclude<Status, 'idle'>;
  /** Every request of the answer, in qits-projects' order. */
  readonly requests: readonly ReleaseRequestEntry[];
  /** The ones still open ({@link isPendingRelease}), in the same order. */
  readonly pending: readonly ReleaseRequestEntry[];
}

interface ProjectsState {
  /** Each project's release requests, by project id. Not asked for yet: no key. */
  readonly releaseRequests: Readonly<Record<string, ProjectReleaseRequests>>;
}

/**
 * A project's release requests, from qits-projects, for the release request pages and the
 * lightning menu, until they read through `qitsResource` too (qits-2146's release request group).
 * The projects themselves are `SelectedProject`'s `qitsResource` now, and the shell's and the agents
 * menu's release requests `ProjectReleaseRequests`' (qits-2146), over the same request.
 *
 * - `loadReleaseRequests(projectId)` fetches a project's release requests once, when a project
 *   opens, and keeps all of them and, apart, the pending ones (`isPendingRelease`);
 *   `refreshReleaseRequests(projectId)` fetches them again when a domain event says they changed.
 *   Both share one in-flight guard per project (`runReleaseRequestsFetch`): at most one
 *   `listProjectReleaseRequests` call runs for a project at a time, and any refresh asked for while
 *   one is already running is coalesced into exactly one follow-up fetch afterwards, rather than
 *   piling up a call per event.
 *
 * Staleness (qits-1270):
 * - The release requests: `RELEASE_REQUEST_EVENTS` about the open project →
 *   `refreshReleaseRequests(projectId)`, wired once by the top bar's release menu
 *   (`ReleaseMenu`), which the shell keeps mounted while any project page is open; the sidebar
 *   note and the Release Requests page read the same answer. The list answer is the only read
 *   this store has, so a row-only event (`ReleaseRequestChanged`) reads the whole list too.
 *
 * Its pact (`projects.store.pact.spec.ts`), with the operations' (`projects.operations.pact.spec.ts`),
 * `WorkStore`'s and `RepositoriesStore`'s, is what this app relies on from qits-projects. Every
 * call goes through `consume(...)` with its list from `projects.consumes.ts`: the store can read
 * only those fields, and the pact binds exactly them.
 */
export const ProjectsStore = signalStore(
  { providedIn: 'root' },
  withState<ProjectsState>({ releaseRequests: {} }),
  withMethods((store) => {
    function setReleaseRequests(projectId: string, value: ProjectReleaseRequests): void {
      patchState(store, { releaseRequests: { ...store.releaseRequests(), [projectId]: value } });
    }

    async function fetchReleaseRequests(projectId: string): Promise<void> {
      const { data, error } = await consume(
        listProjectReleaseRequests({ path: { projectId } }),
        LIST_PROJECT_RELEASE_REQUESTS,
      );
      const previous = store.releaseRequests()[projectId];
      if (error !== undefined || !data) {
        if (previous?.status !== 'loaded') {
          setReleaseRequests(projectId, { status: 'error', requests: [], pending: [] });
        }
        return;
      }
      const requests = data.requests ?? [];
      setReleaseRequests(projectId, {
        status: 'loaded',
        requests,
        pending: requests.filter(isPendingRelease),
      });
    }

    // Bookkeeping for the in-flight guard below. Plain, non-signal state: it is not data the
    // templates render, so it stays out of `ProjectsState` rather than going through `patchState`.
    /** The fetch currently running for a project, by project id; absent once it settles. */
    const releaseRequestFetches = new Map<string, Promise<void>>();
    /** Projects whose fetch was asked for again while the one in `releaseRequestFetches` ran. */
    const staleReleaseRequests = new Set<string>();

    /**
     * Runs `fetchReleaseRequests(projectId)`, coalescing calls so at most one is ever in flight
     * for a project. A call made while one is already running does not start a second: it marks
     * the project stale and returns the running fetch's promise. That promise resolves only once
     * the project is no longer stale, re-running the fetch first if it was marked stale meanwhile —
     * so a burst of calls during a fetch becomes exactly one fetch, then exactly one follow-up
     * fetch, and every caller's promise reflects the data that follow-up lands.
     */
    function runReleaseRequestsFetch(projectId: string): Promise<void> {
      const running = releaseRequestFetches.get(projectId);
      if (running) {
        staleReleaseRequests.add(projectId);
        return running;
      }
      const fetch = (async () => {
        do {
          staleReleaseRequests.delete(projectId);
          await fetchReleaseRequests(projectId);
        } while (staleReleaseRequests.has(projectId));
      })().finally(() => releaseRequestFetches.delete(projectId));
      releaseRequestFetches.set(projectId, fetch);
      return fetch;
    }

    return {
      /**
       * Fetches a project's release requests if nothing is loaded for it yet (or the last fetch
       * failed); otherwise this means "load if not loaded", so it just waits for whichever fetch
       * (initial or in-flight) is already under way rather than starting a new one.
       */
      loadReleaseRequests(projectId: string): Promise<void> {
        const current = store.releaseRequests()[projectId];
        if (current && current.status !== 'error') {
          return releaseRequestFetches.get(projectId) ?? Promise.resolve();
        }
        setReleaseRequests(projectId, { status: 'loading', requests: [], pending: [] });
        return runReleaseRequestsFetch(projectId);
      },
      /**
       * Fetches a project's release requests again, keeping the ones shown until the answer
       * arrives. A failed refresh keeps the last good list rather than emptying the menu.
       * Shares `runReleaseRequestsFetch`'s guard with `loadReleaseRequests`: calling this while a
       * fetch for the project is already running never starts a second one, only queues one
       * follow-up fetch after it.
       */
      refreshReleaseRequests(projectId: string): Promise<void> {
        return runReleaseRequestsFetch(projectId);
      },
    };
  }),
);
