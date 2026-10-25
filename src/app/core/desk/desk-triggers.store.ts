import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listDeskTriggerMessages } from '../../api/projects';
import { LIST_DESK_TRIGGER_MESSAGES, type DeskTriggerMessage } from './desk-triggers.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** A project's desk trigger messages, as `load` left them. */
export interface ProjectDeskTriggers {
  readonly status: Status;
  /** Newest `openedAt` first, as qits-projects answers them. */
  readonly messages: readonly DeskTriggerMessage[];
}

interface DeskTriggersState {
  /** Each project's messages, by project id. */
  readonly byProject: Readonly<Record<string, ProjectDeskTriggers>>;
}

/**
 * The messages qits-projects' delivery desk was sent by its desk triggers (epic qits-1604), by
 * project: every window's state, delivery bookkeeping and the lines it collected.
 *
 * `load(projectId)` reads once, and again after an error. There is no staleness subscription yet:
 * no domain event marks a window opening, closing or being delivered (a gap AGENTS.md's "Live
 * domain events" section lists others like), so the Desk page's Retry is the only way to read
 * again today.
 */
export const DeskTriggersStore = signalStore(
  { providedIn: 'root' },
  withState<DeskTriggersState>({ byProject: {} }),
  withMethods((store) => {
    function set(projectId: string, value: ProjectDeskTriggers): void {
      patchState(store, { byProject: { ...store.byProject(), [projectId]: value } });
    }

    return {
      async load(projectId: string): Promise<void> {
        const current = store.byProject()[projectId];
        if (!projectId || (current && current.status !== 'error')) return;
        set(projectId, { status: 'loading', messages: [] });
        const { data, error } = await consume(
          listDeskTriggerMessages({ path: { projectId } }),
          LIST_DESK_TRIGGER_MESSAGES,
        );
        if (error !== undefined || !data) {
          set(projectId, { status: 'error', messages: [] });
          return;
        }
        set(projectId, { status: 'loaded', messages: data.messages ?? [] });
      },
    };
  }),
);
