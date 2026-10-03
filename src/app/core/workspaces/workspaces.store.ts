import { computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { debounceTime } from 'rxjs';
import { listOpenWorkspaces, listWorkItemWorkspaces } from '../../api/workspaces';
import { DomainEvents } from '$core/events/domain-events';
import { WORK_EVENTS, WORK_REFRESH_DEBOUNCE_MS } from '$core/work/selected-work';
import {
  LIST_OPEN_WORKSPACES,
  LIST_WORK_ITEM_WORKSPACES,
  type WorkspaceHistoryEntry,
} from './workspaces.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** One work item's workspaces, as `loadHistory(workRef)` left them. */
export interface WorkspaceHistory {
  readonly status: 'loading' | 'loaded' | 'error';
  /** Every state (ACTIVE, INTEGRATED, ABANDONED), newest first. */
  readonly entries: readonly WorkspaceHistoryEntry[];
}

interface WorkspacesState {
  readonly status: Status;
  /** The ids of the work items (qits-projects' entity ids) that have an ACTIVE workspace. */
  readonly openWorkIds: readonly string[];
  /** Each item's workspaces, by the reference they were read with. */
  readonly history: Readonly<Record<string, WorkspaceHistory>>;
}

/**
 * The workspaces qits-workspaces holds for work items (epic qits-112).
 *
 * - `load()` reads the platform's ACTIVE workspaces that are bound to a work item, once, and again
 *   after an error. The work pages call it, in the browser, one request per page; the cards then
 *   ask `hasOpen(workId)` and cost nothing.
 * - `refresh()` reads them again, keeping the last good answer if it fails.
 * - `follow(destroy)`: while `destroy` lives, `refresh()` after work items move
 *   (`EntityTransitioned`, at most once a second): a dispatch opens a workspace, an integration
 *   closes it.
 * - `loadHistory(workRef)` reads one item's workspaces in every state, newest first, once, and
 *   again after an error; `historyOf(workRef)` gives them, or undefined before.
 */
export const WorkspacesStore = signalStore(
  { providedIn: 'root' },
  withState<WorkspacesState>({ status: 'idle', openWorkIds: [], history: {} }),
  withComputed((store) => ({
    /** {@link WorkspacesState.openWorkIds} as a set. */
    openSet: computed(() => new Set(store.openWorkIds())),
  })),
  withMethods((store) => {
    const events = inject(DomainEvents);

    async function fetchOpen(): Promise<void> {
      const { data, error } = await consume(listOpenWorkspaces(), LIST_OPEN_WORKSPACES);
      if (error !== undefined || !data) {
        if (store.status() !== 'loaded') patchState(store, { status: 'error', openWorkIds: [] });
        return;
      }
      const openWorkIds = (data.entries ?? []).flatMap((e) =>
        e.workspace?.workId ? [e.workspace.workId] : [],
      );
      patchState(store, { status: 'loaded', openWorkIds });
    }

    function setHistory(workRef: string, value: WorkspaceHistory): void {
      patchState(store, { history: { ...store.history(), [workRef]: value } });
    }

    async function refresh(): Promise<void> {
      if (store.status() !== 'loaded') return;
      await fetchOpen();
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'loading' || store.status() === 'loaded') return;
        patchState(store, { status: 'loading' });
        await fetchOpen();
      },
      refresh,
      follow(destroy: DestroyRef): void {
        events
          .on(WORK_EVENTS)
          .pipe(debounceTime(WORK_REFRESH_DEBOUNCE_MS), takeUntilDestroyed(destroy))
          .subscribe(() => void refresh());
      },
      /** Whether the item with this id has an ACTIVE workspace. */
      hasOpen(workId: string | undefined): boolean {
        return !!workId && store.openSet().has(workId);
      },
      async loadHistory(workRef: string): Promise<void> {
        const current = store.history()[workRef];
        if (!workRef || (current && current.status !== 'error')) return;
        setHistory(workRef, { status: 'loading', entries: [] });
        const { data, error } = await consume(
          listWorkItemWorkspaces({ path: { workRef } }),
          LIST_WORK_ITEM_WORKSPACES,
        );
        if (error !== undefined || !data) {
          setHistory(workRef, { status: 'error', entries: [] });
          return;
        }
        const entries = (data.entries ?? []).flatMap((e) => (e.workspace ? [e.workspace] : []));
        setHistory(workRef, { status: 'loaded', entries });
      },
      historyOf(workRef: string): WorkspaceHistory | undefined {
        return store.history()[workRef];
      },
    };
  }),
);
