import type { TargetEntry } from './targets.consumes';

/** One slot type's row: its label, the slots in use and the minimum reserved, summed. */
export interface SlotTypeRow {
  readonly type: string;
  readonly label: string;
  readonly used: number;
  readonly reserved: number;
}

/** The shared pool: the slots no minimum reserves, and how many the types use beyond theirs. */
export interface SharedPool {
  /** Slots the types use beyond their minimums: Σ max(0, used − minimum) per type. */
  readonly used: number;
  /** Slots no minimum reserves: total − Σ minimums. */
  readonly size: number;
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
  /** The unreserved slots and their use. */
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

const count = (counts: unknown, type: string): number => {
  const value = (counts as Record<string, unknown> | null | undefined)?.[type];
  return typeof value === 'number' ? value : 0;
};

/**
 * The line's figures from qits-system's targets. Only connected targets count. A minimum is a
 * reserve, not a cap: a type grows past it into the shared pool (the slots no minimum reserves)
 * while that has room. The pool is computed from the sums over all targets, per type. The types come
 * from the answer (every key of `used` and `minimums` on any target), so a new type shows by itself,
 * after the known ones.
 */
export function runnerSlots(targets: readonly TargetEntry[]): RunnerSlots {
  const connected = targets.filter((target) => target.connected);
  const types = new Set<string>();
  for (const target of targets) {
    for (const counts of [target.used, target.minimums]) {
      for (const type of Object.keys(counts ?? {})) types.add(type);
    }
  }
  const sum = (read: (target: TargetEntry) => number) =>
    connected.reduce((total, target) => total + read(target), 0);
  const rows = [...types]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((type) => ({
      type,
      label: LABELS[type] ?? type,
      used: sum((target) => count(target.used, type)),
      reserved: sum((target) => count(target.minimums, type)),
    }));
  const total = sum((target) => target.slotsTotal ?? 0);
  const add = (read: (row: SlotTypeRow) => number) => rows.reduce((all, row) => all + read(row), 0);
  return {
    runners: connected.length,
    used: add((row) => row.used),
    total,
    types: rows,
    shared: {
      used: add((row) => Math.max(0, row.used - row.reserved)),
      size: total - add((row) => row.reserved),
    },
  };
}
