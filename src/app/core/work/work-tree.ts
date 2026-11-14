import { hasEpicBoard } from './epic-board';
import type { WorkEntry } from './work.consumes';
import { BOARD_COLUMNS } from './work-statuses';

/**
 * The nesting of a project's work (epic › feature › task; tickets stand alone), shared by the
 * board, the backlog, the acceptance list and the archive so that all four group the same way.
 *
 * - **Parent**: an entity's `parent` (epic › feature › task).
 * - **Phase**: where an entity belongs. Its own status decides: REPORTED is the backlog, REFINED
 *   the schedule (refined, waiting for a person to schedule it), READY_FOR_DEV / IMPLEMENTING /
 *   IMPLEMENTED / VERIFYING the board, VERIFIED the acceptance list, DONE / DROPPED the archive.
 *   A READY_FOR_DEV epic or ticket is also listed on the Schedule tab, as scheduled and not
 *   started (`scheduling`), so it can be unscheduled there; its phase stays the board's. A status this map does not know falls back to the backlog, rather
 *   than being drawn nowhere (the app holds no status model of its own; the fallback is a safety
 *   net, not a model). Features and tasks hold a status of their own too (qits-763), so a task can
 *   be on the board while its epic waits in Acceptance; the epic is then the task's context there.
 *   An entity without a status takes its nearest ancestor's. One exception: an ancestor in the
 *   archive (DONE, DROPPED) takes every item below it there, so a finished or dropped epic archives
 *   its whole tree (qits-projects closes the open pieces with an epic's move to DONE, qits-1685, but
 *   moves none when an epic is DROPPED).
 * - **Column** (on the board): READY_FOR_DEV 0, IMPLEMENTING 1, IMPLEMENTED 2, VERIFYING 3, by
 *   the entity's own status (or that ancestor's). A feature or task still REFINED below a started
 *   epic is in the schedule phase, so, like a REPORTED one, it is not on the board.
 * - **Tree** for one phase: every entity in that phase, plus its ancestors, which appear as
 *   `context` (a quiet header for a parent that lives elsewhere).
 * - **Epic boards** (qits-2051): In Progress's default view draws each root epic on the board
 *   (READY_FOR_DEV to VERIFYING, `hasEpicBoard`) with its own epic board, its whole subtree
 *   (`epicBoards`), Verified column included. `tree(phase, { withoutEpicBoards: true })` leaves
 *   such an epic's tree out: the board for the rest, and Acceptance, which would list again what
 *   that board's Verified column shows. An epic off the board keeps its pieces that are on it, as
 *   context, so they never vanish from every tab.
 * - **Order**: one order everywhere, independent of status, column and update time
 *   (`byPriority`, qits-753): the roots (epics and tickets together) by their priority, highest
 *   first, those nobody ranked after every ranked one, ties by the number of their qualified id;
 *   inside each parent its children the same way. Removing an item leaves the rest in place.
 */

export type Phase = 'backlog' | 'schedule' | 'board' | 'acceptance' | 'archive';

const PHASE_BY_STATUS: Readonly<Record<string, Phase>> = {
  REPORTED: 'backlog',
  REFINED: 'schedule',
  READY_FOR_DEV: 'board',
  IMPLEMENTING: 'board',
  IMPLEMENTED: 'board',
  VERIFYING: 'board',
  VERIFIED: 'acceptance',
  DONE: 'archive',
  DROPPED: 'archive',
};

/**
 * `status`'s phase, or `'backlog'` for a word this map does not know: the app holds no status
 * model of its own (the javadoc rule above), so an unrecognised word is a safety net rather than a
 * model of what that word means. Without it such an entity would be drawn nowhere.
 */
function phaseOfStatus(status: string): Phase {
  return PHASE_BY_STATUS[status] ?? 'backlog';
}

/** Each board status's column: its index in `BOARD_COLUMNS`. */
const COLUMN_BY_STATUS: Readonly<Record<string, number>> = Object.fromEntries(
  BOARD_COLUMNS.map((column, index) => [column.status, index]),
);

/** Statuses past the board: work there is verified. */
const PAST_BOARD: ReadonlySet<string> = new Set(['VERIFIED', 'DONE']);

export interface WorkNode {
  readonly entry: WorkEntry;
  readonly children: readonly WorkNode[];
  /** Shown only to place its children: its own phase is another one. */
  readonly context: boolean;
  /** Its own board column; undefined off the board or when it is context. */
  readonly column?: number;
  /** Every task below it, in this tree or not (`taskDistribution`). */
  readonly tasks: TaskTally;
}

/** The tasks below a node, wherever their own status puts them. */
export interface TaskTally {
  /** Their own status is VERIFIED or DONE. */
  readonly verified: number;
  readonly total: number;
}

/** How {@link WorkGraph.tree} draws a phase. */
export interface TreeOptions {
  /**
   * Leaves out every entity whose root epic is drawn with its own epic board (`hasEpicBoard`), the
   * epic included (qits-2051).
   */
  readonly withoutEpicBoards?: boolean;
}

/** A project's work, indexed for the questions below. */
export class WorkGraph {
  private readonly byId = new Map<string, WorkEntry>();
  private readonly parentOf = new Map<string, string>();
  private readonly childrenOf = new Map<string, string[]>();

  /** @param entries the project's entities, in qits-projects' tree order */
  constructor(private readonly entries: readonly WorkEntry[]) {
    for (const entry of entries) if (entry.id) this.byId.set(entry.id, entry);
    for (const entry of entries) {
      if (entry.id && entry.parent && this.byId.has(entry.parent)) {
        this.link(entry.parent, entry.id);
      }
    }
  }

  /**
   * `entry` with every descendant (an epic's features and tasks, a feature's tasks), none of them
   * context.
   */
  nodeOf(entry: WorkEntry): WorkNode {
    return this.subtree(entry);
  }

  /**
   * The entity's phase, from its own status or its nearest ancestor's; undefined if none has one.
   * An ancestor in the archive takes it there, whatever its own status.
   */
  phaseOf(entry: WorkEntry): Phase | undefined {
    const parent = this.parentEntry(entry);
    if (parent && this.phaseOf(parent) === 'archive') return 'archive';
    const owner = this.statusOwner(entry);
    return owner?.status ? phaseOfStatus(owner.status) : undefined;
  }

  /** The entity's own status, or its nearest ancestor's (a feature's or task's epic); else none. */
  statusOf(entry: WorkEntry): WorkEntry['status'] | undefined {
    return this.statusOwner(entry)?.status;
  }

  /** The entity's board column, or undefined when it is not on the board. */
  columnOf(entry: WorkEntry): number | undefined {
    if (this.phaseOf(entry) !== 'board') return undefined;
    const status = this.statusOf(entry);
    return status ? COLUMN_BY_STATUS[status] : undefined;
  }

  /**
   * The Schedule tab's two lists, epics and tickets only (a feature or a task moves with its epic),
   * each by number (`byNumber`): `toSchedule`, every REFINED one; `scheduled`, every
   * READY_FOR_DEV one (scheduled, not started: started is IMPLEMENTING).
   */
  scheduling(): {
    readonly toSchedule: readonly WorkEntry[];
    readonly scheduled: readonly WorkEntry[];
  } {
    const roots = this.entries.filter(
      (entry) => entry.archetype === 'EPIC' || entry.archetype === 'TICKET',
    );
    return {
      toSchedule: roots.filter((entry) => entry.status === 'REFINED').sort(byNumber),
      scheduled: roots.filter((entry) => entry.status === 'READY_FOR_DEV').sort(byNumber),
    };
  }

  /** How many epics and tickets are in `phase`. Features and tasks are not counted. */
  count(phase: Phase): number {
    return this.entries.filter(
      (entry) =>
        entry.status &&
        (entry.archetype === 'EPIC' || entry.archetype === 'TICKET') &&
        phaseOfStatus(entry.status) === phase,
    ).length;
  }

  /**
   * Every task below `entry`, wherever its own status puts it: how many there are and how many are
   * VERIFIED or DONE.
   */
  private tasksBelow(entry: WorkEntry): TaskTally {
    let verified = 0;
    let total = 0;
    const walk = (id: string) => {
      for (const childId of this.childrenOf.get(id) ?? []) {
        const child = this.byId.get(childId)!;
        if (child.archetype === 'TASK') {
          total++;
          const status = this.statusOf(child);
          if (status && PAST_BOARD.has(status)) verified++;
        }
        walk(childId);
      }
    };
    if (entry.id) walk(entry.id);
    return { verified, total };
  }

  /**
   * The tree of every entity in `phase`, with their ancestors as context, in tree order. With
   * `withoutEpicBoards`, without the trees {@link epicBoards} draws.
   */
  tree(phase: Phase, options: TreeOptions = {}): readonly WorkNode[] {
    const apart = !!options.withoutEpicBoards;
    return this.treeWhere(
      (entry) => this.phaseOf(entry) === phase && !(apart && this.onEpicBoard(entry)),
      phase === 'board',
    );
  }

  /**
   * Every root epic drawn with its own epic board (its own status READY_FOR_DEV to VERIFYING,
   * `hasEpicBoard`), each with its whole subtree as {@link nodeOf} gives it, in the trees' order.
   */
  epicBoards(): readonly WorkNode[] {
    return this.entries
      .filter(
        (entry) =>
          entry.id &&
          !this.parentOf.has(entry.id) &&
          entry.archetype === 'EPIC' &&
          hasEpicBoard(entry),
      )
      .sort(byPriority)
      .map((epic) => this.subtree(epic));
  }

  /**
   * The tree of the entities whose id is in `ids` and whose phase is one of `phases`, with their
   * ancestors as context, in tree order. The In Progress tab draws the work an agent is on before
   * and after the board with it, whatever its status.
   */
  treeOf(ids: ReadonlySet<string>, phases: readonly Phase[]): readonly WorkNode[] {
    const wanted = new Set<Phase | undefined>(phases);
    return this.treeWhere(
      (entry) => !!entry.id && ids.has(entry.id) && wanted.has(this.phaseOf(entry)),
      false,
    );
  }

  /** Every entity `matches` takes, with its ancestors as context; with `board`, board columns. */
  private treeWhere(matches: (entry: WorkEntry) => boolean, board: boolean): readonly WorkNode[] {
    const included = new Set<string>();
    for (const entry of this.entries) {
      // An issue is not work: the Desk page shows it (qits-1819). Campaigns are retired (epic
      // qits-1899): a CAMPAIGN row a read still carries, until qits-projects deletes them
      // (qits-1908), is drawn nowhere. The client no longer names CAMPAIGN (qits-1908 dropped it
      // from the spec), so the guard compares the wire string.
      const archetype: string | undefined = entry.archetype;
      if (!entry.id || archetype === 'ISSUE' || archetype === 'CAMPAIGN') continue;
      if (!matches(entry)) continue;
      for (let id: string | undefined = entry.id; id; id = this.parentOf.get(id)) {
        included.add(id);
      }
    }
    const roots = this.entries
      .filter((entry) => entry.id && included.has(entry.id) && !this.parentOf.has(entry.id))
      .sort(byPriority);
    return roots.map((root) => this.node(root, matches, board, included));
  }

  private node(
    entry: WorkEntry,
    matches: (entry: WorkEntry) => boolean,
    board: boolean,
    included: ReadonlySet<string>,
  ): WorkNode {
    const children = (this.childrenOf.get(entry.id!) ?? [])
      .filter((id) => included.has(id))
      .map((id) => this.byId.get(id)!)
      .sort(byPriority)
      .map((child) => this.node(child, matches, board, included));
    const context = !matches(entry);
    const tasks = this.tasksBelow(entry);
    if (!board) return { entry, children, context, tasks };
    const column = context ? undefined : this.columnOf(entry);
    return { entry, children, context, column, tasks };
  }

  /** `entry` with every descendant, none of them context. */
  private subtree(entry: WorkEntry): WorkNode {
    const children = (this.childrenOf.get(entry.id!) ?? [])
      .map((id) => this.byId.get(id)!)
      .sort(byPriority)
      .map((child) => this.subtree(child));
    return { entry, children, context: false, tasks: this.tasksBelow(entry) };
  }

  /** Whether `entry` is in a tree {@link epicBoards} draws: its root is an epic with a board. */
  private onEpicBoard(entry: WorkEntry): boolean {
    let root = entry;
    for (let parent = this.parentEntry(root); parent; parent = this.parentEntry(root))
      root = parent;
    return root.archetype === 'EPIC' && hasEpicBoard(root);
  }

  private parentEntry(entry: WorkEntry): WorkEntry | undefined {
    const parent = entry.id ? this.parentOf.get(entry.id) : undefined;
    return parent ? this.byId.get(parent) : undefined;
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

/**
 * `entries` without the `hidden` ones and without everything below them (qits-1685). An epic whose
 * finish waits for its Undo has left its list, and its features and tasks leave with it: kept
 * without their parent, they would be drawn as roots, like tickets of their own.
 */
export function withoutHidden(
  entries: readonly WorkEntry[],
  hidden: ReadonlySet<string>,
): readonly WorkEntry[] {
  if (!hidden.size) return entries;
  const parentOf = new Map<string, string>();
  for (const entry of entries) if (entry.id && entry.parent) parentOf.set(entry.id, entry.parent);
  const isHidden = (id: string | undefined): boolean => {
    for (
      let current = id, hops = 0;
      current && hops < 16;
      current = parentOf.get(current), hops++
    ) {
      if (hidden.has(current)) return true;
    }
    return false;
  };
  return entries.filter((entry) => !entry.id || !isHidden(entry.id));
}

/** The number at the end of a qualified id (`qits-112` → 112), or undefined without one. */
export function numberOf(entry: WorkEntry): number | undefined {
  const match = entry.qualifiedId ? /(\d+)$/.exec(entry.qualifiedId) : null;
  return match ? Number(match[1]) : undefined;
}

/**
 * By the number of the qualified id, numerically (`qits-9` before `qits-10`), {@link byPriority}'s tie-break;
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
 * The trees' order (qits-753): by `priority`, highest first; an entry nobody ranked (no priority)
 * after every ranked one; equal priorities, and two unranked entries, by {@link byNumber}.
 */
export function byPriority(a: WorkEntry, b: WorkEntry): number {
  const x = a.priority ?? undefined;
  const y = b.priority ?? undefined;
  if (x !== undefined && y !== undefined && x !== y) return y - x;
  if (x !== undefined && y === undefined) return -1;
  if (x === undefined && y !== undefined) return 1;
  return byNumber(a, b);
}

/** Where a node's tasks (its descendants that are tasks) are. */
export interface TaskDistribution extends TaskTally {
  /**
   * Tasks per board column, by column index (`BOARD_COLUMNS`), zeros included: the tasks of this
   * tree only, so on the board only.
   */
  readonly columns: readonly number[];
}

/**
 * Where a node's tasks are: how many in each board column of its tree, and, counted below it
 * whatever tree they are in, how many are verified (own status VERIFIED or DONE) and how many there
 * are in all.
 */
export function taskDistribution(node: WorkNode): TaskDistribution {
  const columns: number[] = BOARD_COLUMNS.map(() => 0);
  const walk = (n: WorkNode) => {
    for (const child of n.children) {
      if (child.entry.archetype === 'TASK' && child.column !== undefined) columns[child.column]++;
      walk(child);
    }
  };
  walk(node);
  return { columns, ...node.tasks };
}
