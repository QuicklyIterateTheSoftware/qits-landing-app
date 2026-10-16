import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { injectRefreshOn, payloadField } from '$core/events/refresh-on';
import type { DomainEvent } from '$core/events/domain-events';
import {
  listProjectRepositories,
  postProjectsApiProjectsByProjectIdRepositoriesBackupSync,
} from '../../api/projects';
import {
  BACKUP_SYNC_PROJECT,
  LIST_PROJECT_REPOSITORIES,
  type RepositoryEntry,
  type WrapperView,
} from './repositories.consumes';

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
 * Each project's repositories, from qits-projects' `listProjectRepositories`: one request per
 * project, shared by the project card and the Repositories page.
 *
 * `load(projectId)` fetches once, and again after an error. Nothing calls it on its own: the
 * project card does in the browser, and the Repositories page for the open project.
 * `refresh(projectId)` fetches again whatever the store holds (the Repositories page, after the
 * backup sign-in terminal ends), keeping the answer on hand while it does. `syncBackups(projectId)`
 * asks qits-projects to push every repository to its backup remote; the outcomes land on each
 * repository's `lastBackup` later, with no event to say so.
 * `follow(projectId, destroy)` keeps a project's answer current while a page or card shows it.
 *
 * Staleness (qits-1270): `SCMPublishCommit` to the project's wrapper repository on its main branch
 * (`repoId` = `wrapper.repositoryId`, `branch` = the wrapper's `mainBranch`) → that project's list
 * (`refresh(projectId)`), at most once a second. The wrapper's `.gitmodules` on main is what places
 * a repository in the tree (`wrapper.entries`, `declared`), and qits-projects commits there when it
 * creates or adopts one, so that commit is the one event that moves the list. Gaps: qits-projects
 * emits no repository-created, -renamed or -deleted event (a repository created without a wrapper
 * commit shows only on the next load), and none for a backup's outcome (`lastBackup`, read again
 * after the sign-in terminal and its backup sync only) or a changed `mainBranch`/`backupUrl`.
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
      const { data, error } = await consume(
        listProjectRepositories({ path: { projectId } }),
        LIST_PROJECT_REPOSITORIES,
      );
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

      /** How many repositories qits-projects scheduled a backup for, or null when it refused. */
      async syncBackups(projectId: string): Promise<number | null> {
        const { data, error } = await consume(
          postProjectsApiProjectsByProjectIdRepositoriesBackupSync({ path: { projectId } }),
          BACKUP_SYNC_PROJECT,
        );
        return error !== undefined || !data ? null : (data.scheduled ?? 0);
      },
    };
  }),
);

/** Whether `event` is a commit to the main branch of the wrapper `repositories` names. */
function movesWrapper(event: DomainEvent, repositories: ProjectRepositories | undefined): boolean {
  const wrapperId = repositories?.wrapper?.repositoryId;
  if (!wrapperId || payloadField(event, 'repoId') !== wrapperId) return false;
  const wrapper = repositories.entries.find((entry) => entry.repository?.id === wrapperId);
  return payloadField(event, 'branch') === (wrapper?.repository?.mainBranch || 'main');
}
