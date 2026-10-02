import type { WorkEntry } from './work.consumes';

/**
 * The nesting of a project's work (campaign › epic › story › task), shared by the board, the
 * backlog and the archive so that all three group the same way.
 *
 * - **Parent**: an entity's `parent` (epic › feature › task), else the campaign it is a member of.
 * - **Phase**: where an entity belongs. Its own status decides: REPORTED is the backlog, REFINED /
 *   IMPLEMENTED / VERIFIED the board, DONE / DROPPED the archive. Features and tasks have no status:
 *   they take their nearest ancestor's (their epic's).
 * - **Column** (on the board): REFINED 0, IMPLEMENTED 1, VERIFIED 2. A feature or task: Verified
 *   once its epic is VERIFIED, else Implemented once `implementedAt` is set, else Refined.
 * - **Tree** for one phase: every entity in that phase, plus its ancestors, which appear as
 *   `context` (a quiet header for a parent that lives elsewhere). Children keep the list's order;
 *   a campaign's members keep the campaign's order.
 * - **Span** of a node with children: from the leftmost to the rightmost column of the node itself
 *   (unless it is context) and every descendant. Descendants cannot fall behind their epic (moving
 *   an epic to IMPLEMENTED stamps them all), but they can run ahead of it, and a campaign's members
 *   move on their own: the span covers both.
 */

export type Phase = 'backlog' | 'board' | 'archive';

const PHASE_BY_STATUS: Readonly<Record<string, Phase>> = {
  REPORTED: 'backlog',
  REFINED: 'board',
  IMPLEMENTED: 'board',
  VERIFIED: 'board',
  DONE: 'archive',
  DROPPED: 'archive',
};

const COLUMN_BY_STATUS: Readonly<Record<string, number>> = {
  REFINED: 0,
  IMPLEMENTED: 1,
  VERIFIED: 2,
};

export interface WorkNode {
  readonly entry: WorkEntry;
  readonly children: readonly WorkNode[];
  /** Shown only to place its children: its own phase is another one. */
  readonly context: boolean;
  /** Its own board column; undefined off the board or when it is context. */
  readonly column?: number;
  /** The columns it spans with its descendants, [from, to]; undefined off the board. */
  readonly span?: readonly [number, number];
}

/** A project's work, indexed for the questions below. */
export class WorkGraph {
  private readonly byId = new Map<string, WorkEntry>();
  private readonly parentOf = new Map<string, string>();
  private readonly childrenOf = new Map<string, string[]>();

  /**
   * @param entries the project's entities, in qits-projects' tree order
   * @param campaignMembers each campaign's member ids, in campaign order
   */
  constructor(
    private readonly entries: readonly WorkEntry[],
    campaignMembers: Readonly<Record<string, readonly string[]>> = {},
  ) {
    for (const entry of entries) if (entry.id) this.byId.set(entry.id, entry);
    for (const [campaign, members] of Object.entries(campaignMembers)) {
      for (const member of members) {
        if (this.byId.has(member) && this.byId.has(campaign)) this.link(campaign, member);
      }
    }
    for (const entry of entries) {
      if (entry.id && entry.parent && this.byId.has(entry.parent) && !this.parentOf.has(entry.id)) {
        this.link(entry.parent, entry.id);
      }
    }
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
    const owner = this.statusOwner(entry);
    if (owner?.status === 'VERIFIED') return 2;
    return entry.implementedAt ? 1 : 0;
  }

  /** The tree of every entity in `phase`, with their ancestors as context, in tree order. */
  tree(phase: Phase): readonly WorkNode[] {
    const included = new Set<string>();
    for (const entry of this.entries) {
      if (!entry.id || this.phaseOf(entry) !== phase) continue;
      for (let id: string | undefined = entry.id; id; id = this.parentOf.get(id)) {
        included.add(id);
      }
    }
    const roots = this.entries.filter(
      (entry) => entry.id && included.has(entry.id) && !this.parentOf.has(entry.id),
    );
    return roots.map((root) => this.node(root, phase, included));
  }

  private node(entry: WorkEntry, phase: Phase, included: ReadonlySet<string>): WorkNode {
    const children = (this.childrenOf.get(entry.id!) ?? [])
      .filter((id) => included.has(id))
      .map((id) => this.node(this.byId.get(id)!, phase, included));
    const context = this.phaseOf(entry) !== phase;
    if (phase !== 'board') return { entry, children, context };
    const column = context ? undefined : this.columnOf(entry);
    const columns = [
      ...(column === undefined ? [] : [column]),
      ...children.flatMap((child) => child.span ?? []),
    ];
    const span: readonly [number, number] | undefined = columns.length
      ? [Math.min(...columns), Math.max(...columns)]
      : undefined;
    return { entry, children, context, column, span };
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
