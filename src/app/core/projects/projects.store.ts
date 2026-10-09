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
 *   `refreshReleaseRequests(projectId)`
 *   fetches them again when a domain event says they changed.
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

    return {
      async load(): Promise<void> {
        if (store.status() === 'idle' || store.status() === 'error') await refreshList();
      },
      refresh(id?: string): Promise<void> {
        return id === undefined ? refreshList() : select(id);
      },
      async loadReleaseRequests(projectId: string): Promise<void> {
        const current = store.releaseRequests()[projectId];
        if (current && current.status !== 'error') return;
        setReleaseRequests(projectId, { status: 'loading', requests: [], pending: [] });
        await fetchReleaseRequests(projectId);
      },
      /**
       * Fetches a project's release requests again, keeping the ones shown until the answer
       * arrives. A failed refresh keeps the last good list rather than emptying the menu.
       */
      async refreshReleaseRequests(projectId: string): Promise<void> {
        if (store.releaseRequests()[projectId]?.status === 'loading') return;
        await fetchReleaseRequests(projectId);
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
