import type { WorkEntry } from './work.consumes';
import { BOARD_COLUMNS } from './work-statuses';

/**
 * The nesting of a project's work (epic › feature › task; tickets stand alone), shared by the
 * board, the backlog, the acceptance list and the archive so that all four group the same way.
 *
 * - **Parent**: an entity's `parent` (epic › feature › task). Campaigns are not structure: they
 *   gather existing epics, tickets and tasks as members, and show as tags (`campaignsOf`).
 * - **Phase**: where an entity belongs. Its own status decides: REPORTED is the backlog, REFINED /
 *   IMPLEMENTING / IMPLEMENTED / VERIFYING the board, VERIFIED the acceptance list, DONE / DROPPED
 *   the archive. Features and tasks have no status: they take their nearest ancestor's (their
 *   epic's), so the children of a VERIFIED epic go to the acceptance list with it.
 * - **Column** (on the board): REFINED 0, IMPLEMENTING 1, IMPLEMENTED 2, VERIFYING 3. A feature or
 *   task: Verifying once its epic is VERIFYING, else Implemented once `implementedAt` is set, else
 *   Implementing once `implementingAt` is set, else Refined.
 * - **Tree** for one phase: every entity in that phase, plus its ancestors, which appear as
 *   `context` (a quiet header for a parent that lives elsewhere). Campaigns themselves are not in
 *   any tree.
 * - **Order**: one order everywhere, independent of status, column and update time
 *   (`byNumber`): the roots (epics and tickets together) by the number of their qualified id, and
 *   inside each parent its children the same way. Removing an item leaves the rest in place.
 */

export type Phase = 'backlog' | 'board' | 'acceptance' | 'archive';

const PHASE_BY_STATUS: Readonly<Record<string, Phase>> = {
  REPORTED: 'backlog',
  REFINED: 'board',
  IMPLEMENTING: 'board',
  IMPLEMENTED: 'board',
  VERIFYING: 'board',
  VERIFIED: 'acceptance',
  DONE: 'archive',
  DROPPED: 'archive',
};

/** Each board status's column: its index in `BOARD_COLUMNS`. */
const COLUMN_BY_STATUS: Readonly<Record<string, number>> = Object.fromEntries(
  BOARD_COLUMNS.map((column, index) => [column.status, index]),
);

/** The board's last column (Verifying): a task there is done. */
export const LAST_COLUMN = BOARD_COLUMNS.length - 1;

export interface WorkNode {
  readonly entry: WorkEntry;
  readonly children: readonly WorkNode[];
  /** Shown only to place its children: its own phase is another one. */
  readonly context: boolean;
  /** Its own board column; undefined off the board or when it is context. */
  readonly column?: number;
  /** The campaigns it is a member of, in the list's order. */
  readonly campaigns: readonly WorkEntry[];
}

/** A project's work, indexed for the questions below. */
export class WorkGraph {
  private readonly byId = new Map<string, WorkEntry>();
  private readonly parentOf = new Map<string, string>();
  private readonly childrenOf = new Map<string, string[]>();
  private readonly campaignsByMember = new Map<string, WorkEntry[]>();

  /**
   * @param entries the project's entities, in qits-projects' tree order
   * @param campaignMembers each campaign's member ids, in campaign order
   */
  constructor(
    private readonly entries: readonly WorkEntry[],
    campaignMembers: Readonly<Record<string, readonly string[]>> = {},
  ) {
    for (const entry of entries) if (entry.id) this.byId.set(entry.id, entry);
    for (const entry of entries) {
      if (entry.archetype !== 'CAMPAIGN' || !entry.id) continue;
      for (const member of campaignMembers[entry.id] ?? []) {
        const list = this.campaignsByMember.get(member) ?? [];
        list.push(entry);
        this.campaignsByMember.set(member, list);
      }
    }
    for (const entry of entries) {
      if (entry.id && entry.parent && this.byId.has(entry.parent)) {
        this.link(entry.parent, entry.id);
      }
    }
  }

  /** The campaigns `entry` is a member of. */
  campaignsOf(entry: WorkEntry): readonly WorkEntry[] {
    return (entry.id && this.campaignsByMember.get(entry.id)) || [];
  }

  /** The entity's phase, from its own status or its nearest ancestor's; undefined if none has one. */
  phaseOf(entry: WorkEntry): Phase | undefined {
    const owner = this.statusOwner(entry);
    return owner?.status ? PHASE_BY_STATUS[owner.status] : undefined;
  }

  /** The entity's board column, or undefined when it is not on the board. */
  columnOf(entry: WorkEntry): number | undefined {
    if (this.phaseOf(entry) !== 'board') return undefined;
    if (entry.status) return COLUMN_BY_STATUS[entry.status];
    if (this.statusOwner(entry)?.status === 'VERIFYING') return COLUMN_BY_STATUS['VERIFYING'];
    if (entry.implementedAt) return COLUMN_BY_STATUS['IMPLEMENTED'];
    if (entry.implementingAt) return COLUMN_BY_STATUS['IMPLEMENTING'];
    return COLUMN_BY_STATUS['REFINED'];
  }

  /** The tree of every entity in `phase`, with their ancestors as context, in tree order. */
  tree(phase: Phase): readonly WorkNode[] {
    const included = new Set<string>();
    for (const entry of this.entries) {
      if (!entry.id || entry.archetype === 'CAMPAIGN' || this.phaseOf(entry) !== phase) continue;
      for (let id: string | undefined = entry.id; id; id = this.parentOf.get(id)) {
        included.add(id);
      }
    }
    const roots = this.entries
      .filter((entry) => entry.id && included.has(entry.id) && !this.parentOf.has(entry.id))
      .sort(byNumber);
    return roots.map((root) => this.node(root, phase, included));
  }

  private node(entry: WorkEntry, phase: Phase, included: ReadonlySet<string>): WorkNode {
    const children = (this.childrenOf.get(entry.id!) ?? [])
      .filter((id) => included.has(id))
      .map((id) => this.byId.get(id)!)
      .sort(byNumber)
      .map((child) => this.node(child, phase, included));
    const context = this.phaseOf(entry) !== phase;
    const campaigns = this.campaignsOf(entry);
    if (phase !== 'board') return { entry, children, context, campaigns };
    const column = context ? undefined : this.columnOf(entry);
    return { entry, children, context, column, campaigns };
  }

  /** The entity itself if it has a status, else its nearest ancestor that has one. */
  private statusOwner(entry: WorkEntry): WorkEntry | undefined {
    for (let current: WorkEntry | undefined = entry; current;) {
      if (current.status) return current;
      const parent: string | undefined = current.id ? this.parentOf.get(current.id) : undefined;
      current = parent ? this.byId.get(parent) : undefined;
    }
    return undefined;
  }

  private link(parent: string, child: string): void {
    this.parentOf.set(child, parent);
    const list = this.childrenOf.get(parent) ?? [];
    list.push(child);
    this.childrenOf.set(parent, list);
  }
}

/** The number at the end of a qualified id (`qits-112` → 112), or undefined without one. */
export function numberOf(entry: WorkEntry): number | undefined {
  const match = entry.qualifiedId ? /(\d+)$/.exec(entry.qualifiedId) : null;
  return match ? Number(match[1]) : undefined;
}

/**
 * The board's order: by the number of the qualified id, numerically (`qits-9` before `qits-10`);
 * an entry without one after those with one, by its raw id.
 */
export function byNumber(a: WorkEntry, b: WorkEntry): number {
  const x = numberOf(a);
  const y = numberOf(b);
  if (x !== undefined && y !== undefined && x !== y) return x - y;
  if (x !== undefined && y === undefined) return -1;
  if (x === undefined && y !== undefined) return 1;
  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * How many of a node's tasks (its descendants that are tasks) are done, of how many: on the board,
 * a task is done in the last column (its epic is VERIFYING). Off the board (no columns) it counts
 * none: the lists say what their own phase means.
 */
export function taskProgress(node: WorkNode): { verified: number; total: number } {
  let verified = 0;
  let total = 0;
  const walk = (n: WorkNode) => {
    for (const child of n.children) {
      if (child.entry.archetype === 'TASK') {
        total++;
        if (child.column === LAST_COLUMN) verified++;
      }
      walk(child);
    }
  };
  walk(node);
  return { verified, total };
}
