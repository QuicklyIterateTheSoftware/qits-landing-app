import type { TargetEntry } from './targets.consumes';

/**
 * One row of the right column: a slot type, or the shared pool. `used` of `capacity`, summed over
 * the connected targets. Every slot in use is counted in exactly one row.
 */
export interface SlotRow {
  /** The slot type as the answer names it; `shared` for the pool. */
  readonly type: string;
  readonly label: string;
  /** A type: Σ min(used, minimum). The pool: Σ the types' overflow, max(0, used − minimum). */
  readonly used: number;
  /** A type: Σ minimum, its reservation. The pool: Σ max(0, slotsTotal − Σ minimums). */
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
  readonly types: readonly SlotRow[];
  /** The slots no minimum reserves, and the types' use beyond their minimums. */
  readonly shared: SlotRow;
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

const count = (counts: unknown, type: string): number => {
  const value = (counts as Record<string, unknown> | null | undefined)?.[type];
  return typeof value === 'number' ? value : 0;
};

/**
 * The line's figures from qits-system's targets. Only connected targets count, and each is counted
 * on its own before the sums, since each has its own reservations. On a target, a type's
 * reservation (its minimum) is its capacity: up to that, its use counts in its row. Beyond it, the
 * type takes slots from the target's shared pool (`slotsTotal − Σ minimums`, floored at 0), and that
 * overflow counts in the `shared` row. So the rows' use adds up to `slots` used, and their
 * capacities to `slots` total unless a target reserves more than it has. The types come from the
 * answer (every key of `used` and `minimums` on any target), so a new type shows by itself, after
 * the known ones.
 */
export function runnerSlots(targets: readonly TargetEntry[]): RunnerSlots {
  const connected = targets.filter((target) => target.connected);
  const seen = new Set<string>();
  for (const target of targets) {
    for (const counts of [target.used, target.minimums]) {
      for (const type of Object.keys(counts ?? {})) seen.add(type);
    }
  }
  const types = [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const sum = (read: (target: TargetEntry) => number) =>
    connected.reduce((total, target) => total + read(target), 0);
  const across = (read: (type: string) => number) =>
    types.reduce((total, type) => total + read(type), 0);
  const used = (target: TargetEntry, type: string) => count(target.used, type);
  const minimum = (target: TargetEntry, type: string) => count(target.minimums, type);
  return {
    runners: connected.length,
    used: sum((target) => across((type) => used(target, type))),
    total: sum((target) => target.slotsTotal ?? 0),
    types: types.map((type) => ({
      type,
      label: LABELS[type] ?? type,
      used: sum((target) => Math.min(used(target, type), minimum(target, type))),
      capacity: sum((target) => minimum(target, type)),
    })),
    shared: {
      type: 'shared',
      label: 'shared',
      used: sum((target) =>
        across((type) => Math.max(0, used(target, type) - minimum(target, type))),
      ),
      capacity: sum((target) =>
        Math.max(0, (target.slotsTotal ?? 0) - across((type) => minimum(target, type))),
      ),
    },
  };
}
