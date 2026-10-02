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
import {
  listProjects,
  getProject,
  listProjectRepositories,
  listProjectEntities,
} from '../../api/projects';
import { consume } from '@qits/angular';
import {
  countsAsWork,
  GET_PROJECT,
  LIST_PROJECT_ENTITIES,
  LIST_PROJECT_REPOSITORIES,
  LIST_PROJECTS,
  SESSION_CHECK,
  type FetchedProject,
  type ListedProject,
  type RepositoryEntry,
} from './projects.consumes';

/**
 * A project as the store keeps it: only the fields it reads (`projects.consumes.ts`), and an `id`,
 * which the spec leaves optional.
 */
export type Project = ListedProject & { readonly id: string };

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** A project's work, as `loadWork(projectId)` left it: how many entities count as work. */
export interface ProjectWork {
  readonly status: Exclude<Status, 'idle'>;
  readonly count: number;
}

/** A project's repositories, as `loadRepositories(projectId)` left them. */
export interface ProjectRepositories {
  readonly status: Exclude<Status, 'idle'>;
  readonly entries: readonly RepositoryEntry[];
}

interface ProjectsState {
  /** The state of the list. A detail fetch does not change it. */
  readonly status: Status;
  readonly selectedId: string | null;
  /** Each project's repositories, by project id. A project not asked for yet has no key. */
  readonly repositories: Readonly<Record<string, ProjectRepositories>>;
  /** Each project's work count, by project id. A project not asked for yet has no key. */
  readonly work: Readonly<Record<string, ProjectWork>>;
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
 * - `loadRepositories(projectId)` fetches a project's repositories once.
 * - `loadWork(projectId)` fetches a project's work entities once and keeps how many count as work
 *   (`countsAsWork` in `projects.consumes.ts`).
 * - `hasSession()` asks qits-projects whether the visitor has a session. It changes no state.
 *
 * The store is the only user of the generated qits-projects client, so its pact
 * (`projects.store.pact.spec.ts`) is the whole of what this app relies on from qits-projects. Every
 * call goes through `consume(...)` with its list from `projects.consumes.ts`: the store can read
 * only those fields, and the pact binds exactly them.
 */
export const ProjectsStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Project>() }),
  withState<ProjectsState>({ status: 'idle', selectedId: null, repositories: {}, work: {} }),
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

    function setRepositories(projectId: string, value: ProjectRepositories): void {
      patchState(store, { repositories: { ...store.repositories(), [projectId]: value } });
    }

    function setWork(projectId: string, value: ProjectWork): void {
      patchState(store, { work: { ...store.work(), [projectId]: value } });
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'idle' || store.status() === 'error') await refreshList();
      },
      refresh(id?: string): Promise<void> {
        return id === undefined ? refreshList() : select(id);
      },
      async loadRepositories(projectId: string): Promise<void> {
        const current = store.repositories()[projectId];
        if (current && current.status !== 'error') return;
        setRepositories(projectId, { status: 'loading', entries: [] });
        const { data, error } = await consume(
          listProjectRepositories({ path: { projectId } }),
          LIST_PROJECT_REPOSITORIES,
        );
        setRepositories(
          projectId,
          error !== undefined || !data
            ? { status: 'error', entries: [] }
            : { status: 'loaded', entries: data.entries ?? [] },
        );
      },
      async loadWork(projectId: string): Promise<void> {
        const current = store.work()[projectId];
        if (current && current.status !== 'error') return;
        setWork(projectId, { status: 'loading', count: 0 });
        const { data, error } = await consume(
          listProjectEntities({ path: { projectId } }),
          LIST_PROJECT_ENTITIES,
        );
        setWork(
          projectId,
          error !== undefined || !data
            ? { status: 'error', count: 0 }
            : { status: 'loaded', count: (data.entities ?? []).filter(countsAsWork).length },
        );
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
