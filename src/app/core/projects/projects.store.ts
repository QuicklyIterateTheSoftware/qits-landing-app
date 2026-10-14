import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import {
  patchState,
  signalStore,
  type,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { setAllEntities, setEntity, withEntities } from '@ngrx/signals/entities';
import { listProjects, getProject, listProjectReleaseRequests } from '../../api/projects';
import { consume } from '@qits/angular';
import {
  GET_PROJECT,
  isPendingRelease,
  LIST_PROJECT_RELEASE_REQUESTS,
  LIST_PROJECTS,
  SESSION_CHECK,
  type FetchedProject,
  type ListedProject,
  type ReleaseRequestEntry,
} from './projects.consumes';

/**
 * A project as the store keeps it: only the fields it reads (`projects.consumes.ts`), and an `id`,
 * which the spec leaves optional.
 */
export type Project = ListedProject & { readonly id: string };

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
  /** The state of the list. A detail fetch does not change it. */
  readonly status: Status;
  readonly selectedId: string | null;
  /** Each project's release requests, by project id. Not asked for yet: no key. */
  readonly releaseRequests: Readonly<Record<string, ProjectReleaseRequests>>;
}

function withId(project: ListedProject | FetchedProject | undefined): project is Project {
  return !!project?.id;
}

/**
 * Every project the app has seen, from qits-projects.
 *
 * - `load()` fetches the list once. The `onInit` hook calls it, in the browser only: the server
 *   render has no `qits-session` cookie to send.
 * - `refresh()` fetches the list again.
 * - `refresh(id)` selects that project, and fetches its detail if the store does not hold it.
 * - `loadReleaseRequests(projectId)` fetches a project's release requests once, when a project
 *   opens, and keeps all of them and, apart, the pending ones (`isPendingRelease`);
 *   `refreshReleaseRequests(projectId)` fetches them again when a domain event says they changed.
 *   Both share one in-flight guard per project (`runReleaseRequestsFetch`): at most one
 *   `listProjectReleaseRequests` call runs for a project at a time, and any refresh asked for while
 *   one is already running is coalesced into exactly one follow-up fetch afterwards, rather than
 *   piling up a call per event.
 * - `hasSession()` asks qits-projects whether the visitor has a session. It changes no state.
 *
 * The store is the only user of the generated qits-projects client, so its pact
 * (`projects.store.pact.spec.ts`), with `WorkStore`'s and `RepositoriesStore`'s, is what this app
 * relies on from qits-projects. Every
 * call goes through `consume(...)` with its list from `projects.consumes.ts`: the store can read
 * only those fields, and the pact binds exactly them.
 */
export const ProjectsStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Project>() }),
  withState<ProjectsState>({
    status: 'idle',
    selectedId: null,
    releaseRequests: {},
  }),
  withComputed(({ entityMap, selectedId }) => ({
    selected: computed(() => {
      const id = selectedId();
      return id === null ? undefined : entityMap()[id];
    }),
  })),
  withMethods((store) => {
    async function refreshList(): Promise<void> {
      patchState(store, { status: 'loading' });
      const { data, error } = await consume(listProjects(), LIST_PROJECTS);
      if (error !== undefined || !data) {
        patchState(store, { status: 'error' });
        return;
      }
      const projects = (data.entries ?? []).map((entry) => entry.project).filter(withId);
      patchState(store, setAllEntities(projects), { status: 'loaded' });
    }

    async function select(id: string): Promise<void> {
      patchState(store, { selectedId: id });
      if (store.entityMap()[id]) return;
      const { data } = await consume(getProject({ path: { id } }), GET_PROJECT);
      if (withId(data?.project)) patchState(store, setEntity(data.project));
    }

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
      async load(): Promise<void> {
        if (store.status() === 'idle' || store.status() === 'error') await refreshList();
      },
      refresh(id?: string): Promise<void> {
        return id === undefined ? refreshList() : select(id);
      },
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
      /** False only when the edge answers 401: no valid `qits-session` cookie. */
      async hasSession(): Promise<boolean> {
        const { response } = await consume(listProjects(), SESSION_CHECK);
        return response?.status !== 401;
      },
    };
  }),
  withHooks((store) => {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    return {
      onInit(): void {
        if (browser) void store.load();
      },
    };
  }),
);
