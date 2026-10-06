import type { WorkEntry } from './work.consumes';
import { BOARD_COLUMNS } from './work-statuses';

/**
 * The nesting of a project's work (epic › feature › task; tickets stand alone), shared by the
 * board, the backlog, the acceptance list and the archive so that all four group the same way.
 *
 * - **Parent**: an entity's `parent` (epic › feature › task). Campaigns are not structure: they
 *   gather existing epics, tickets and tasks as members, and show as tags (`campaignsOf`).
 * - **Phase**: where an entity belongs. Its own status decides: REPORTED is the backlog, REFINED /
 *   READY_FOR_DEV / IMPLEMENTING / IMPLEMENTED / VERIFYING the board, VERIFIED the acceptance list,
 *   DONE / DROPPED the archive. A status this map does not know falls back to the backlog, rather
 *   than being drawn nowhere (the app holds no status model of its own; the fallback is a safety
 *   net, not a model). Features and tasks hold a status of their own too (qits-763), so a task can
 *   be on the board while its epic waits in Acceptance; the epic is then the task's context there.
 *   An entity without a status takes its nearest ancestor's. One exception: an ancestor in the
 *   archive (DONE, DROPPED) takes every item below it there, so a finished or dropped epic archives
 *   its whole tree (qits-projects moves no child when an epic goes to DONE or DROPPED).
 * - **Column** (on the board): REFINED 0, READY_FOR_DEV 1, IMPLEMENTING 2, IMPLEMENTED 3,
 *   VERIFYING 4, by the entity's own status (or that ancestor's).
 * - **Tree** for one phase: every entity in that phase, plus its ancestors, which appear as
 *   `context` (a quiet header for a parent that lives elsewhere). Campaigns themselves are not in
 *   any tree.
 * - **Order**: one order everywhere, independent of status, column and update time
 *   (`byNumber`): the roots (epics and tickets together) by the number of their qualified id, and
 *   inside each parent its children the same way. Removing an item leaves the rest in place.
 * - **Campaigns** (`campaigns`, `membersOf`): span the phases, so they have a list of their own
 *   while open (`openCampaigns`); once in a final state they go to the archive like any other work
 *   (`archivedCampaigns`, by the same `PHASE_BY_STATUS`). Each campaign's members come in campaign
 *   order, each with its whole subtree.
 */

export type Phase = 'backlog' | 'board' | 'acceptance' | 'archive';

const PHASE_BY_STATUS: Readonly<Record<string, Phase>> = {
  REPORTED: 'backlog',
  REFINED: 'board',
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
  /** The campaigns it is a member of, in the list's order. */
  readonly campaigns: readonly WorkEntry[];
  /** Every task below it, in this tree or not (`taskDistribution`). */
  readonly tasks: TaskTally;
}

/** The tasks below a node, wherever their own status puts them. */
export interface TaskTally {
  /** Their own status is VERIFIED or DONE. */
  readonly verified: number;
  readonly total: number;
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
    private readonly campaignMembers: Readonly<Record<string, readonly string[]>> = {},
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

  /** The project's campaigns, in the board's order (`byNumber`). */
  campaigns(): readonly WorkEntry[] {
    return this.entries.filter((entry) => entry.archetype === 'CAMPAIGN').sort(byNumber);
  }

  /** The campaigns not in the archive (their phase by `PHASE_BY_STATUS`), in the board's order. */
  openCampaigns(): readonly WorkEntry[] {
    return this.campaigns().filter((campaign) => this.phaseOf(campaign) !== 'archive');
  }

  /** The campaigns in the archive (DONE, DROPPED), in the board's order. */
  archivedCampaigns(): readonly WorkEntry[] {
    return this.campaigns().filter((campaign) => this.phaseOf(campaign) === 'archive');
  }

  /**
   * A campaign's members, in campaign order, each with its whole subtree (an epic's features and
   * tasks). A member that is not in the list (hidden while its finish waits) is left out. A
   * member's `campaigns` leave out `campaign` itself: the page it is on already names it.
   */
  membersOf(campaign: WorkEntry): readonly WorkNode[] {
    const ids = (campaign.id && this.campaignMembers[campaign.id]) || [];
    return ids
      .map((id) => this.byId.get(id))
      .filter((entry): entry is WorkEntry => !!entry)
      .map((entry) => this.subtree(entry, campaign));
  }

  /**
   * `entry` with every descendant (an epic's features and tasks, a feature's tasks), none of them
   * context, each with all its campaigns.
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

  /** How many epics and tickets are in `phase`. Features, tasks and campaigns are not counted. */
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
    const tasks = this.tasksBelow(entry);
    if (phase !== 'board') return { entry, children, context, campaigns, tasks };
    const column = context ? undefined : this.columnOf(entry);
    return { entry, children, context, column, campaigns, tasks };
  }

  /** `entry` with every descendant, none of them context; `campaign`, if any, left out of their tags. */
  private subtree(entry: WorkEntry, campaign?: WorkEntry): WorkNode {
    const children = (this.childrenOf.get(entry.id!) ?? [])
      .map((id) => this.byId.get(id)!)
      .sort(byNumber)
      .map((child) => this.subtree(child, campaign));
    const campaigns = this.campaignsOf(entry).filter((c) => c.id !== campaign?.id);
    return { entry, children, context: false, campaigns, tasks: this.tasksBelow(entry) };
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
