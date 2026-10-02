import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listPendingBumps } from '../../api/maintenance';
import { LIST_PENDING_BUMPS, PENDING_BUMPS, type BumpEntry } from './maintenance.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

interface MaintenanceState {
  readonly status: Status;
  /** The newest pending bumps, newest first. */
  readonly pending: readonly BumpEntry[];
}

/**
 * The version bumps qits-maintenance has under way (epic qits-112), for the top bar's bumps menu.
 *
 * - `load()` fetches the newest {@link PENDING_BUMPS} pending bumps once, and again after an error.
 *   qits-maintenance decides what is pending. The menu calls it on its first opening.
 * - `refresh()` fetches them again, keeping the list shown until the answer arrives; a failed
 *   refresh keeps the last good list. The menu calls it after domain events that move bumps.
 */
export const MaintenanceStore = signalStore(
  { providedIn: 'root' },
  withState<MaintenanceState>({ status: 'idle', pending: [] }),
  withMethods((store) => {
    async function fetch(): Promise<void> {
      const { data, error } = await consume(
        listPendingBumps({ query: { limit: PENDING_BUMPS } }),
        LIST_PENDING_BUMPS,
      );
      if (error !== undefined || !data) {
        if (store.status() !== 'loaded') patchState(store, { status: 'error', pending: [] });
        return;
      }
      patchState(store, { status: 'loaded', pending: data.bumps ?? [] });
    }

    return {
      async load(): Promise<void> {
        if (store.status() === 'loading' || store.status() === 'loaded') return;
        patchState(store, { status: 'loading' });
        await fetch();
      },
      async refresh(): Promise<void> {
        if (store.status() !== 'loaded') return;
        await fetch();
      },
    };
  }),
);
