import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listProjectEntities } from '../../api/projects';
import { countsAsWork, LIST_PROJECT_ENTITIES, type WorkEntry } from './work.consumes';

type Status = 'loading' | 'loaded' | 'error';

/**
 * A project's work, as `load(projectId)` left it: its entities, and how many count as work (the
 * project card's tile).
 */
export interface ProjectWork {
  readonly status: Status;
  readonly count: number;
  readonly entries: readonly WorkEntry[];
}

interface WorkState {
  /** Each project's work, by project id. A project not asked for yet has no key. */
  readonly byProject: Readonly<Record<string, ProjectWork>>;
}

/**
 * Each project's work entities, from qits-projects' `listProjectEntities` (the whole planning
 * tree, unfiltered): one request per project, shared by the project card and the Work pages.
 *
 * - `load(projectId)` fetches once, and again after an error. Nothing calls it on its own: the
 *   project card does in the browser, and `SelectedWork` for the open project.
 * - Which entities count as work is `countsAsWork` in `work.consumes.ts`.
 */
export const WorkStore = signalStore(
  { providedIn: 'root' },
  withState<WorkState>({ byProject: {} }),
  withMethods((store) => {
    function set(projectId: string, value: ProjectWork): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (current && current.status !== 'error') return;
        set(projectId, { status: 'loading', count: 0, entries: [] });
        const { data, error } = await consume(
          listProjectEntities({ path: { projectId } }),
          LIST_PROJECT_ENTITIES,
        );
        const entries = data?.entities ?? [];
        set(
          projectId,
          error !== undefined || !data
            ? { status: 'error', count: 0, entries: [] }
            : { status: 'loaded', count: entries.filter(countsAsWork).length, entries },
        );
      },
    };
  }),
);
