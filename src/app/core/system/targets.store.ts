import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { listTargets } from '../../api/system';
import { LIST_TARGETS, type TargetEntry } from './targets.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** Slot counts by slot type, as qits-system names the types (`ci`, `workspace`, `desk`, …). */
export type SlotCounts = Readonly<Record<string, number | undefined>>;

/** One execution target, as this app reads it. */
export interface Target {
  readonly connected: boolean;
  readonly slotsTotal: number;
  /** Slots in use, by type. */
  readonly used: SlotCounts;
  /** Slots reserved for each type: a reservation, not a limit. */
  readonly reserved: SlotCounts;
}

/** A target from qits-system's answer, in this app's terms. */
function targetOf(entry: TargetEntry): Target {
  return {
    connected: entry.connected ?? false,
    slotsTotal: entry.slotsTotal ?? 0,
    used: entry.used ?? {},
    // qits-system still names the reservations `minimums`; only this line changes when it renames.
    reserved: entry.minimums ?? {},
  };
}

interface TargetsState {
  readonly status: Status;
  /** Every execution target qits-system knows. */
  readonly targets: readonly Target[];
}

/**
 * qits-system's execution targets (epic qits-112), for the runners and slots line of the lightning
 * menu.
 *
 * - `load()` fetches the targets once, and again after an error. The menu calls it on each opening.
 * - `refresh()` fetches them again, keeping the list shown until the answer arrives; a failed
 *   refresh keeps the last good list.
 *
 * Only some roles may read the targets (`qits:admin` and the like). For anyone else the read fails
 * and the status stays `error`, so the line stays hidden.
 *
 * Staleness (qits-1270): `TARGET_EVENTS` → `refresh()`, wired by the line (`RunnerSlots`).
 */
export const TargetsStore = signalStore(
  { providedIn: 'root' },
  withState<TargetsState>({ status: 'idle', targets: [] }),
  withMethods((store) => {
    async function fetch(): Promise<void> {
      const { data, error } = await consume(listTargets(), LIST_TARGETS);
      if (error !== undefined || !data) {
        if (store.status() !== 'loaded') patchState(store, { status: 'error', targets: [] });
        return;
      }
      patchState(store, { status: 'loaded', targets: data.map(targetOf) });
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
