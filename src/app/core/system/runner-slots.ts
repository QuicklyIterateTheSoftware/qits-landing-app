import type { Target } from './targets.store';

/** One slot type's row: the slots it uses, and the slots reserved for it. Summed over targets. */
export interface SlotTypeRow {
  /** The slot type as the answer names it. */
  readonly type: string;
  readonly label: string;
  /** Slots in use. Not capped: a type may use more than its reservation while shared slots are free. */
  readonly used: number;
  /** Slots reserved for the type: a reservation, not a limit. */
  readonly reserved: number;
}

/** The shared pool: the slots nothing reserves, and how many the types use beyond their reservations. */
export interface SharedPool {
  /** Per target Σ max(0, used − reserved) over the types; summed over the targets. */
  readonly used: number;
  /** Per target max(0, slotsTotal − Σ reserved); summed over the targets. */
  readonly capacity: number;
}

/** What the lightning menu's runners and slots line shows. */
export interface RunnerSlots {
  /** How many targets are connected. */
  readonly runners: number;
  /** Slots in use on the connected targets. */
  readonly used: number;
  /** Slots the connected targets offer (`slotsTotal`). */
  readonly total: number;
  /** One row per slot type the answer names: ci, workspaces, desk, then any other by name. */
  readonly types: readonly SlotTypeRow[];
  /** The slots nothing reserves, and the types' use beyond their reservations. */
  readonly shared: SharedPool;
}

/** The labels for the slot types known today; any other type shows its raw name. */
const LABELS: Readonly<Record<string, string>> = {
  ci: 'ci',
  workspace: 'workspaces',
  ws: 'workspaces',
  desk: 'desk',
};

/** Where the known types go; any other type follows them, by name. */
const ORDER = ['ci', 'workspace', 'ws', 'desk'];
const rank = (type: string) => (ORDER.includes(type) ? ORDER.indexOf(type) : ORDER.length);

/**
 * The line's figures from qits-system's targets. Only connected targets count. A type's row is its
 * use (uncapped) and its reservation, each summed: a reservation is not a limit, so `ci: 3/1` is
 * valid while shared slots are free. The shared pool is counted per target, since each has its own
 * reservations, then summed. The types come from the answer (every key of `used` and `reserved` on
 * any target), so a new type shows by itself, after the known ones.
 */
export function runnerSlots(targets: readonly Target[]): RunnerSlots {
  const connected = targets.filter((target) => target.connected);
  const seen = new Set<string>();
  for (const target of targets) {
    for (const counts of [target.used, target.reserved]) {
      for (const type of Object.keys(counts)) seen.add(type);
    }
  }
  const types = [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const sum = (read: (target: Target) => number) =>
    connected.reduce((all, target) => all + read(target), 0);
  const across = (read: (type: string) => number) =>
    types.reduce((all, type) => all + read(type), 0);
  const used = (target: Target, type: string) => target.used[type] ?? 0;
  const reserved = (target: Target, type: string) => target.reserved[type] ?? 0;
  return {
    runners: connected.length,
    used: sum((target) => across((type) => used(target, type))),
    total: sum((target) => target.slotsTotal),
    types: types.map((type) => ({
      type,
      label: LABELS[type] ?? type,
      used: sum((target) => used(target, type)),
      reserved: sum((target) => reserved(target, type)),
    })),
    shared: {
      used: sum((target) =>
        across((type) => Math.max(0, used(target, type) - reserved(target, type))),
      ),
      capacity: sum((target) =>
        Math.max(0, target.slotsTotal - across((type) => reserved(target, type))),
      ),
    },
  };
}
