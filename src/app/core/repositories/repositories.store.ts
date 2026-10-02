import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listProjectRepositories } from '../../api/projects';
import {
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
 */
export const RepositoriesStore = signalStore(
  { providedIn: 'root' },
  withState<RepositoriesState>({ byProject: {} }),
  withMethods((store) => {
    function set(projectId: string, value: ProjectRepositories): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { status: 'loading', entries: [] });
        const { data, error } = await consume(
          listProjectRepositories({ path: { projectId } }),
          LIST_PROJECT_REPOSITORIES,
        );
        set(
          projectId,
          error !== undefined || !data
            ? { status: 'error', entries: [] }
            : { status: 'loaded', entries: data.entries ?? [], wrapper: data.wrapper },
        );
      },
    };
  }),
);
