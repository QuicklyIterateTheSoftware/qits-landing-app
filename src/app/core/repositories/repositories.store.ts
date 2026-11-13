import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { injectRefreshOn, payloadField, type WithPayload } from '$core/events/refresh-on';
import type { RepositoryEntry, WrapperView } from './repositories.consumes';
import { PROJECT_REPOSITORIES } from './repositories.operations';

/** A project's repositories, as `load(projectId)` left them. */
export interface ProjectRepositories {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly entries: readonly RepositoryEntry[];
  /** The wrapper's view: which repository is the wrapper, and where each entry is mounted. */
  readonly wrapper?: WrapperView;
}

interface RepositoriesState {
  /** Each project's repositories, by project id. A project not asked for yet has no key. */
  readonly byProject: Readonly<Record<string, ProjectRepositories>>;
}

/**
 * Each project's repositories, from qits-projects' `listProjectRepositories`, for the release
 * request page (which is where each submodule is mounted, the wrapper's main branch). The project
 * card, the Repositories page and the UI builder read through `qitsResource` over
 * `repositories.operations.ts` instead (qits-2146); the release request page moves with its own
 * group, and this store goes with it. Until then it reads through `PROJECT_REPOSITORIES`' own
 * `fetch`, so it calls no client of its own: its read is that operation's, which
 * `repositories.operations.pact.spec.ts` binds (`show-project-repositories-tree`).
 *
 * `load(projectId)` fetches once, and again after an error. Nothing calls it on its own: the
 * release request page does for the open project. `refresh(projectId)` fetches again whatever the
 * store holds, keeping the answer on hand while it does. `follow(projectId, destroy)` keeps a
 * project's answer current while the page shows it.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the project's wrapper repository on its main branch
 * (`repoId` = `wrapper.repositoryId`, `branch` = the wrapper's `mainBranch`) → that project's list
 * (`refresh(projectId)`), at most once a second. The wrapper's `.gitmodules` on main is what places
 * a repository in the tree (`wrapper.entries`, `declared`), and qits-projects commits there when it
 * creates or adopts one, so that commit is the one event that moves the list. Gaps: qits-projects
 * emits no repository-created, -renamed or -deleted event (a repository created without a wrapper
 * commit shows only on the next load), and none for a backup's outcome (`lastBackup`) or a changed
 * `mainBranch`/`backupUrl`.
 */
export const RepositoriesStore = signalStore(
  { providedIn: 'root' },
  withState<RepositoriesState>({ byProject: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function set(projectId: string, value: ProjectRepositories): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    async function read(projectId: string): Promise<ProjectRepositories> {
      const { data, error } = await PROJECT_REPOSITORIES.fetch({ path: { projectId } });
      return error !== undefined || !data
        ? { status: 'error', entries: [] }
        : { status: 'loaded', entries: data.entries ?? [], wrapper: data.wrapper };
    }

    /**
     * Fetch again, without a `loading` in between: the page keeps showing the last answer. A
     * failed refresh keeps a loaded answer too, since it is still the best one on hand.
     */
    async function refresh(projectId: string): Promise<void> {
      const next = await read(projectId);
      if (next.status === 'error' && store.byProject()[projectId]?.status === 'loaded') return;
      set(projectId, next);
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { status: 'loading', entries: [] });
        set(projectId, await read(projectId));
      },

      refresh,

      /**
       * Reads the repositories of the project `projectId` names (read when an event arrives, so it
       * follows a page that moves to another project; none: nothing) again after a commit to its
       * wrapper's main branch (see the store's staleness note), until `destroy` is destroyed.
       */
      follow(projectId: () => string | undefined, destroy: DestroyRef): void {
        refreshOn(
          {
            names: ['SCMPublishCommit'],
            when: (event) => {
              const id = projectId();
              return !!id && movesWrapper(event, store.byProject()[id]);
            },
            refresh: () => {
              const id = projectId();
              return id ? refresh(id) : undefined;
            },
          },
          destroy,
        );
      },
    };
  }),
);

/**
 * What `movesWrapper` reads of a project's repositories: which one is the wrapper, and its main
 * branch. `ProjectRepositories` holds it, and so does a read of `PROJECT_WRAPPER` (the Agents page's
 * `LIST_PROJECT_WRAPPER`, qits-2143).
 */
export interface WrapperBranches {
  readonly entries?: readonly {
    readonly repository?: { readonly id?: string; readonly mainBranch?: string };
  }[];
  readonly wrapper?: { readonly repositoryId?: string };
}

/**
 * Whether `event` (a `SCMPublishCommit`) is a commit to the main branch of the wrapper
 * `repositories` names (`main` when its entry names none).
 */
export function movesWrapper(
  event: WithPayload,
  repositories: WrapperBranches | undefined,
): boolean {
  const wrapperId = repositories?.wrapper?.repositoryId;
  if (!wrapperId || payloadField(event, 'repoId') !== wrapperId) return false;
  const wrapper = repositories.entries?.find((entry) => entry.repository?.id === wrapperId);
  return payloadField(event, 'branch') === (wrapper?.repository?.mainBranch || 'main');
}
