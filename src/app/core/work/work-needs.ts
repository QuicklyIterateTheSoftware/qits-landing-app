/**
 * What a work item needs (epic qits-1899): other items of its project, each at a status. A need is
 * met once the needed item is at or past that status along the walk (DROPPED meets only a DROPPED
 * need); qits-projects computes `met` on every read, and `unmetNeeds` counts the rest. Ordering is
 * this link and nothing else: none of it is a block or an agent's wait, and nothing here says
 * "waiting".
 */

/** One need as the reads carry it, cut to what the views show. */
export interface NeedView {
  /** The needed item's id, when the read carries it. */
  readonly id?: string;
  /** The needed item, by qualified id (`qits-1897`). */
  readonly qualifiedId?: string;
  /** The status it must reach. */
  readonly status?: string;
  /** Where it stands now. */
  readonly currentStatus?: string;
  readonly met?: boolean;
}

/**
 * The statuses a need can name: the walk, then DROPPED. The status select offers them in this
 * order; qits-projects refuses any other word.
 */
export const NEED_STATUSES = [
  'REPORTED',
  'REFINED',
  'READY_FOR_DEV',
  'IMPLEMENTING',
  'IMPLEMENTED',
  'VERIFYING',
  'VERIFIED',
  'DONE',
  'DROPPED',
] as const;

/** The needs that are not met yet, in their order. */
export function unmetNeeds(needs: readonly NeedView[] | null | undefined): readonly NeedView[] {
  return (needs ?? []).filter((need) => need.met === false);
}

/**
 * How many needs are not met: the read's own `unmetNeeds` when it carries one, else the count of
 * the needs marked unmet.
 */
export function unmetCount(
  needs: readonly NeedView[] | null | undefined,
  unmet: number | null | undefined,
): number {
  return typeof unmet === 'number' ? unmet : unmetNeeds(needs).length;
}

/** A need in one line: `qits-1897 at VERIFIED (now REFINED)`; without a current status, no "now". */
export function needLine(need: NeedView): string {
  const now = need.currentStatus ? ` (now ${need.currentStatus})` : '';
  return `${need.qualifiedId ?? '?'} at ${need.status ?? '?'}${now}`;
}

/** Whether an item has a need not met yet: its "needs" badge then shows. */
export function hasUnmetNeeds(entry: {
  readonly needs?: readonly NeedView[] | null;
  readonly unmetNeeds?: number | null;
}): boolean {
  return unmetCount(entry.needs, entry.unmetNeeds) > 0;
}
