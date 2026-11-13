import type { TargetEntry } from './targets.consumes';

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

/** A target from qits-system's answer (`TARGET_LIST`), in this app's terms. */
export function targetOf(entry: TargetEntry): Target {
  return {
    connected: entry.connected ?? false,
    slotsTotal: entry.slotsTotal ?? 0,
    used: entry.used ?? {},
    reserved: entry.reservations ?? {},
  };
}
