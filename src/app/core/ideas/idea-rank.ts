/**
 * The ideas' order (qits-1791), qits-projects' rule: `priority` highest first, an idea nobody
 * ranked (null) after every ranked one, then oldest first. The service answers `listIdeas` in this
 * order; the store sorts again after a drop writes new priorities into the cached list. The age is
 * not read: the sort is stable, so equal priorities (and two unranked ideas) keep the order the
 * service answered them in, which is oldest first.
 */

/** What the order reads of an idea. */
interface Ranked {
  readonly priority?: number | null;
}

/** Ideas in rank order: `priority` descending, null after every number; ties stay as they are. */
export function byIdeaRank(a: Ranked, b: Ranked): number {
  const x = a.priority ?? undefined;
  const y = b.priority ?? undefined;
  if (x !== undefined && y !== undefined) return y - x;
  if (x !== undefined) return -1;
  if (y !== undefined) return 1;
  return 0;
}

/** `ideas` in rank order, as a new array; equal ranks keep their order (a stable sort). */
export function inIdeaRank<T extends Ranked>(ideas: readonly T[]): T[] {
  return [...ideas].sort(byIdeaRank);
}

/**
 * Whether an idea can be ranked (dragged): neither archived nor DONE. qits-projects refuses a
 * priority on any other idea (409), and an anchor naming one (400).
 */
export function rankableIdea(idea: {
  readonly archived?: boolean;
  readonly status?: string;
}): boolean {
  return !idea.archived && idea.status !== 'DONE';
}
