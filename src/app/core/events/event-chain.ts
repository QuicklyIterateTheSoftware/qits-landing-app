import type { EventChild, ProjectEventDetail } from './events.consumes';
import { EVENT_CHILDREN, PROJECT_EVENT } from './events.operations';

/**
 * An event's chain (qits-2338, ported from qits-events-frontend's `event/chain.ts`): what caused
 * the event and what it caused, as one graph.
 *
 * qits-events has no chain route: a client bounds its own walk and remembers the ids it visited.
 * The walk goes up by `parentId` (`getEvent`, one request per hop) to the chain's start, then down
 * from there breadth-first (`listEvents?parentId=`, one request per node, a level's requests
 * together), and draws the tree depth-first, each node's children newest first (`occurredAt`, then
 * id, both descending: a fork's siblings share an instant).
 *
 * Three caps, and each draws a statement when reached rather than truncating in silence:
 * {@link UP_HOP_CAP} requests up, {@link DOWN_DEPTH_CAP} levels below the start and
 * {@link DOWN_NODE_CAP} events in the graph. A seen-set guards both walks, so a loop (nothing
 * server-side prevents `A → B → A`) stops the walk and is drawn.
 *
 * A cause that answers 404 is the chain's start (`dangling`), never an error. `?parentId=` answers
 * an empty list for an id that caused nothing and for one not held at all; either ends a branch.
 * Any other failure, up or down, fails the whole walk: half a graph is never drawn as if whole.
 */

/** Requests spent walking up before the walk stops and says so. */
export const UP_HOP_CAP = 32;

/** Levels drawn below the chain's start. */
export const DOWN_DEPTH_CAP = 8;

/** Events drawn in one graph. */
export const DOWN_NODE_CAP = 200;

/** An event of a chain, as either read answers it. */
export type ChainEvent = ProjectEventDetail | EventChild;

/**
 * Where the chain begins, and why the walk up stopped there: `root` (no `parentId`), `dangling`
 * (the cause is not in the log), `cycle` (the cause is already on the walk) or `capped` (still not
 * a root after {@link UP_HOP_CAP} hops).
 */
export type ChainStart =
  | { readonly kind: 'root' }
  | { readonly kind: 'dangling'; readonly parentId: string }
  | { readonly kind: 'cycle'; readonly parentId: string }
  | { readonly kind: 'capped'; readonly parentId: string };

/**
 * One drawn line of the graph, pre-order: an event (`current`: the page's), a child already drawn
 * above (`loop`), or the depth cap's statement where a branch was not walked further (`bound`).
 * `depth` is levels below the start; a statement sits at the depth its missing subtree would.
 */
export type ChainRow<E extends ChainEvent = ChainEvent> =
  | {
      readonly kind: 'event';
      readonly depth: number;
      readonly event: E;
      readonly current: boolean;
    }
  | { readonly kind: 'loop'; readonly depth: number; readonly id: string }
  | { readonly kind: 'bound'; readonly depth: number };

/** One walked graph. */
export interface Chain {
  readonly start: ChainStart;
  /** The whole graph, pre-order, the start first; never empty. */
  readonly rows: readonly ChainRow<ChainEvent>[];
  /** The node cap ended the walk: there is more than {@link DOWN_NODE_CAP} events. */
  readonly capped: boolean;
  /** What the walk cost: one per hop up and one per event expanded below (not the page's own read). */
  readonly requests: number;
}

/** What the walk reads, so a spec can hand it a fake. */
export interface ChainReader {
  /** One event by its id; null when it is not held (a 404). Throws on any other failure. */
  event(id: string): Promise<ChainEvent | null>;
  /** The events `id` caused. Throws on a failure. */
  children(id: string): Promise<readonly ChainEvent[]>;
}

/** Newest first by `occurredAt`, compared as strings (exact for ISO instants), then id descending. */
export function compareNewestFirst(a: ChainEvent, b: ChainEvent): number {
  const at = a.occurredAt ?? '';
  const bt = b.occurredAt ?? '';
  if (at !== bt) return at < bt ? 1 : -1;
  const ai = a.id ?? '';
  const bi = b.id ?? '';
  return ai === bi ? 0 : ai < bi ? 1 : -1;
}

/** A node being built: its children fill level by level, its markers when a cap is met. */
interface Building {
  readonly event: ChainEvent;
  readonly children: Building[];
  readonly loops: string[];
  bound: boolean;
}

/** Up by `parentId` to the start, one request per hop; the seen-set catches a cycle by id. */
async function walkUp(
  from: ChainEvent,
  reader: ChainReader,
): Promise<{ root: ChainEvent; start: ChainStart; hops: number }> {
  const seen = new Set<string>([from.id ?? '']);
  let node = from;
  let hops = 0;
  for (;;) {
    const parentId = node.parentId;
    if (!parentId) return { root: node, start: { kind: 'root' }, hops };
    if (seen.has(parentId)) return { root: node, start: { kind: 'cycle', parentId }, hops };
    if (hops >= UP_HOP_CAP) return { root: node, start: { kind: 'capped', parentId }, hops };
    hops += 1;
    const parent = await reader.event(parentId);
    if (!parent) return { root: node, start: { kind: 'dangling', parentId }, hops };
    seen.add(parent.id ?? parentId);
    node = parent;
  }
}

/** Down from the start by `?parentId=`, breadth-first, a level's requests together. */
async function walkDown(
  root: ChainEvent,
  reader: ChainReader,
): Promise<{ root: Building; expanded: number; capped: boolean }> {
  const seen = new Set<string>([root.id ?? '']);
  const built: Building = { event: root, children: [], loops: [], bound: false };
  let level: Building[] = [built];
  let depth = 0;
  let expanded = 0;
  let capped = false;
  while (level.length > 0) {
    if (depth >= DOWN_DEPTH_CAP) {
      for (const node of level) node.bound = true;
      break;
    }
    if (seen.size >= DOWN_NODE_CAP) {
      capped = true;
      break;
    }
    const answers = await Promise.all(level.map((node) => reader.children(node.event.id ?? '')));
    expanded += level.length;
    const next: Building[] = [];
    level.forEach((parent, index) => {
      for (const child of [...answers[index]].sort(compareNewestFirst)) {
        const id = child.id ?? '';
        if (seen.has(id)) {
          parent.loops.push(id);
          continue;
        }
        if (seen.size >= DOWN_NODE_CAP) {
          capped = true;
          continue;
        }
        seen.add(id);
        const node: Building = { event: child, children: [], loops: [], bound: false };
        parent.children.push(node);
        next.push(node);
      }
    });
    depth += 1;
    level = next;
  }
  return { root: built, expanded, capped };
}

/** The built tree as drawn lines, pre-order: a node, its subtree, then its markers. */
function flatten(node: Building, depth: number, currentId: string | undefined): ChainRow[] {
  const rows: ChainRow[] = [
    { kind: 'event', depth, event: node.event, current: node.event.id === currentId },
  ];
  for (const child of node.children) rows.push(...flatten(child, depth + 1, currentId));
  for (const id of node.loops) rows.push({ kind: 'loop', depth: depth + 1, id });
  if (node.bound) rows.push({ kind: 'bound', depth: depth + 1 });
  return rows;
}

/**
 * The whole graph around `event`, which the page already read (so it is not read again): up to the
 * start, then down from there. Rejects when a read fails (but for a cause's 404).
 */
export async function walkChain(event: ChainEvent, reader: ChainReader): Promise<Chain> {
  const up = await walkUp(event, reader);
  const down = await walkDown(up.root, reader);
  return {
    start: up.start,
    rows: flatten(down.root, 0, event.id),
    capped: down.capped,
    requests: up.hops + down.expanded,
  };
}

/** `n thing` or `n things`. */
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The chain's caption, `4 events · 6 requests`: the events drawn, and what the page cost to draw
 * them (the walk's requests and the page's own read of the event).
 */
export function chainCaption(chain: Chain): string {
  const events = chain.rows.filter((row) => row.kind === 'event').length;
  return `${plural(events, 'event')} · ${plural(chain.requests + 1, 'request')}`;
}

/**
 * The walk's reads: `PROJECT_EVENT` up (a 404 is null) and `EVENT_CHILDREN` down, each through the
 * operation's `fetch`.
 */
export const PROJECT_CHAIN_READER: ChainReader = {
  async event(id) {
    const { data, error, response } = await PROJECT_EVENT.fetch({ path: { id } });
    if (response?.status === 404) return null;
    if (error !== undefined || !data?.event) throw new Error(`The cause ${id} could not be read`);
    return data.event;
  },
  async children(id) {
    const { data, error } = await EVENT_CHILDREN.fetch({ query: { parentId: id } });
    if (error !== undefined || !data) throw new Error(`What ${id} caused could not be read`);
    return data.events ?? [];
  },
};
