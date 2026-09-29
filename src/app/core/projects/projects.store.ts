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
  getProjectsApiProjects,
  getProjectsApiProjectsById,
  type ProjectDto,
} from '../../api/projects';

/** A project as the store keeps it: the spec leaves `id` optional, the store needs one. */
export type Project = ProjectDto & { readonly id: string };

type Status = 'idle' | 'loading' | 'loaded' | 'error';

interface ProjectsState {
  /** The state of the list. A detail fetch does not change it. */
  readonly status: Status;
  readonly selectedId: string | null;
}

function withId(project: ProjectDto | undefined): project is Project {
  return !!project?.id;
}

/**
 * Every project the app has seen, from qits-projects.
 *
 * - `load()` fetches the list once. The `onInit` hook calls it, in the browser only: the server
 *   render has no `qits-session` cookie to send.
 * - `refresh()` fetches the list again.
 * - `refresh(id)` selects that project, and fetches its detail if the store does not hold it.
 */
export const ProjectsStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Project>() }),
  withState<ProjectsState>({ status: 'idle', selectedId: null }),
  withComputed(({ entityMap, selectedId }) => ({
    selected: computed(() => {
      const id = selectedId();
      return id === null ? undefined : entityMap()[id];
    }),
  })),
  withMethods((store) => {
    async function refreshList(): Promise<void> {
      patchState(store, { status: 'loading' });
      const { data, error } = await getProjectsApiProjects();
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
      const { data } = await getProjectsApiProjectsById({ path: { id } });
      if (withId(data?.project)) patchState(store, setEntity(data.project));
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'idle' || store.status() === 'error') await refreshList();
      },
      refresh(id?: string): Promise<void> {
        return id === undefined ? refreshList() : select(id);
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
