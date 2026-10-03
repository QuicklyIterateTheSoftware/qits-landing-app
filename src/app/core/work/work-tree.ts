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
 *   the archive. Every archetype has a status of its own, features and tasks included (ticket
 *   qits-763), and one item moves without its siblings: a task can be VERIFIED while its epic is
 *   still IMPLEMENTING. One exception: an item whose ancestor has left the board ahead of it, to the
 *   acceptance list or the archive, goes there with it, so a verified epic takes its unverified
 *   tasks along and a done or dropped one archives its whole tree (qits-projects moves no child
 *   when an epic goes to VERIFIED or DONE).
 * - **Column** (on the board): REFINED 0, IMPLEMENTING 1, IMPLEMENTED 2, VERIFYING 3, from the
 *   item's own status.
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

/** The phases in walk order; an ancestor further on than its item in these takes the item along. */
const PHASE_RANK: Readonly<Record<Phase, number>> = {
  backlog: 0,
  board: 1,
  acceptance: 2,
  archive: 3,
};

/** The phases an ancestor takes its items to when it reaches them first. */
const TAKES_ALONG: ReadonlySet<Phase> = new Set<Phase>(['acceptance', 'archive']);

/** Statuses past the board: work there is verified. */
const PAST_BOARD: ReadonlySet<string> = new Set(['VERIFIED', 'DONE']);

/** Where a node's tasks (its descendants that are tasks) are. */
export interface TaskDistribution {
  /** Tasks per board column, by column index (`BOARD_COLUMNS`), zeros included. */
  readonly columns: readonly number[];
  /**
   * Tasks whose own status is VERIFIED or DONE. They are in no board column (a verified task is in
   * the acceptance list, its board epic there as context), so the board shows them as a count.
   */
  readonly verified: number;
  /** Every task, wherever it is. */
  readonly total: number;
}

export interface WorkNode {
  readonly entry: WorkEntry;
  readonly children: readonly WorkNode[];
  /** Shown only to place its children: its own phase is another one. */
  readonly context: boolean;
  /** Its own board column; undefined off the board or when it is context. */
  readonly column?: number;
  /** The campaigns it is a member of, in the list's order. */
  readonly campaigns: readonly WorkEntry[];
  /**
   * Where all its tasks are, in whichever phase each one is: the tree holds only the tasks of its
   * own phase, so this is counted on the whole project's work, not on `children`.
   */
  readonly tasks: TaskDistribution;
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

  /**
   * The entity's phase: its own status's, unless an ancestor is further on in the acceptance list
   * or the archive, which takes it along. Undefined for one without a status that nothing took
   * along (qits-projects serves a status on every entity).
   */
  phaseOf(entry: WorkEntry): Phase | undefined {
    const own = entry.status ? PHASE_BY_STATUS[entry.status] : undefined;
    const parent = this.parentEntry(entry);
    const above = parent ? this.phaseOf(parent) : undefined;
    if (above && TAKES_ALONG.has(above) && (!own || PHASE_RANK[above] > PHASE_RANK[own])) {
      return above;
    }
    return own;
  }

  /** The entity's board column, or undefined when it is not on the board. */
  columnOf(entry: WorkEntry): number | undefined {
    if (this.phaseOf(entry) !== 'board' || !entry.status) return undefined;
    return COLUMN_BY_STATUS[entry.status];
  }

  /**
   * Where `entry`'s tasks (its descendants that are tasks) are: how many in each board column, how
   * many verified (their own status is VERIFIED or DONE),
   * and how many in all, whatever phase each is in.
   */
  tasksOf(entry: WorkEntry): TaskDistribution {
    const columns: number[] = BOARD_COLUMNS.map(() => 0);
    let verified = 0;
    let total = 0;
    const walk = (id: string) => {
      for (const childId of this.childrenOf.get(id) ?? []) {
        const child = this.byId.get(childId)!;
        if (child.archetype === 'TASK') {
          total++;
          const column = this.columnOf(child);
          if (column !== undefined) columns[column]++;
          else if (child.status && PAST_BOARD.has(child.status)) verified++;
        }
        walk(childId);
      }
    };
    if (entry.id) walk(entry.id);
    return { columns, verified, total };
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
    const tasks = this.tasksOf(entry);
    if (phase !== 'board') return { entry, children, context, campaigns, tasks };
    const column = context ? undefined : this.columnOf(entry);
    return { entry, children, context, column, campaigns, tasks };
  }

  private parentEntry(entry: WorkEntry): WorkEntry | undefined {
    const parent = entry.id ? this.parentOf.get(entry.id) : undefined;
    return parent ? this.byId.get(parent) : undefined;
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
