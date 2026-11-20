/**
 * The Traces page's lenses and shaping, as pure functions over the URL and the answer (qits-2342).
 * The lenses keep the retired qits-observability-frontend's query names, so its bookmarks forward
 * as they are. The cases a careless rendering gets plausibly wrong, each asserted in the spec:
 *
 * - **The default read is the source alone.** Newest first, no floor, every service and everything
 *   buffered are the door's own defaults, so none of them is sent: `sort` only for `duration`,
 *   `thresholdMs` only above 0, `service` and `sinceMinutes` only when set ({@link tracesQuery}).
 *   `limit` is never sent.
 * - **The floor is any positive whole number of ms** ({@link thresholdOf}): the page offers
 *   {@link TRACE_THRESHOLDS_MS}, but an old bookmark's typed floor still reads; anything else is 0.
 * - **The order is the door's.** A truncated answer keeps the newest (or slowest) of what matched,
 *   which the page says in so many words ({@link truncationSentence}), never re-sorted here.
 * - **An empty answer says why** ({@link emptyReason}), in order: no source is chosen; the source
 *   holds no spans; the service is not one of the source's; none reaches the floor; none falls in
 *   the time range.
 */

/** The floors the page offers, in milliseconds: `0` (any duration) first, the default. */
export const TRACE_THRESHOLDS_MS = [0, 10, 100, 500, 1000] as const;

/** The orders the door offers: `recent` (newest first, the default) and `duration`. */
export type TracesSort = 'recent' | 'duration';

/** How the list is drawn: grouped by path (the default) or one row per trace. */
export type TracesView = 'grouped' | 'flat';

/** `?sort=` as an order: `duration`, else the default (newest first). */
export function sortOf(value: string | null): TracesSort {
  return value === 'duration' ? 'duration' : 'recent';
}

/** `?view=` as a drawing: `flat`, else the default (grouped by path). */
export function viewOf(value: string | null): TracesView {
  return value === 'flat' ? 'flat' : 'grouped';
}

/** `?threshold=` as a floor in whole milliseconds; anything not a positive number is 0. */
export function thresholdOf(value: string | null): number {
  const ms = Number(value);
  return value && Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
}

/** What the page asks the traces door for, from its lenses. */
export interface TracesLenses {
  readonly source: string;
  readonly sort: TracesSort;
  readonly thresholdMs: number;
  readonly service: string | undefined;
  readonly sinceMinutes: number | undefined;
}

/** The read's query: the source, and each lens only when it differs from the door's default. */
export function tracesQuery(lenses: TracesLenses): {
  source: string;
  sort?: string;
  thresholdMs?: number;
  service?: string;
  sinceMinutes?: number;
} {
  return {
    source: lenses.source,
    ...(lenses.sort === 'duration' ? { sort: 'duration' } : {}),
    ...(lenses.thresholdMs > 0 ? { thresholdMs: lenses.thresholdMs } : {}),
    ...(lenses.service ? { service: lenses.service } : {}),
    ...(lenses.sinceMinutes ? { sinceMinutes: lenses.sinceMinutes } : {}),
  };
}

/** `Showing the newest 200 of 312 matching traces` (`slowest` when sorted by duration). */
export function truncationSentence(shown: number, total: number, sort: TracesSort): string {
  return `Showing the ${sort === 'duration' ? 'slowest' : 'newest'} ${shown} of ${total} matching traces`;
}

/**
 * Why the page shows no trace, in order: no source is chosen; the source holds no spans at all (its
 * source row counts 0); the service lens names a service the source row does not list; none reaches
 * the floor (when above 0); none falls in the time range (when set); else simply none.
 */
export type EmptyReason =
  'no-source' | 'no-spans' | 'unknown-service' | 'below-floor' | 'outside-window' | 'none';

/** What an empty answer (or no read at all) is put down to (see {@link EmptyReason}). */
export function emptyReason(view: {
  readonly source: string | undefined;
  /** The chosen source row's `spans`, undefined while that row is not known. */
  readonly sourceSpans: number | undefined;
  readonly service: string | undefined;
  /** The chosen source row's service names, undefined while that row is not known. */
  readonly services: readonly string[] | undefined;
  readonly thresholdMs: number;
  readonly sinceMinutes: number | undefined;
}): EmptyReason {
  if (!view.source) return 'no-source';
  if (view.sourceSpans === 0) return 'no-spans';
  if (view.service && view.services && !view.services.includes(view.service)) {
    return 'unknown-service';
  }
  if (view.thresholdMs > 0) return 'below-floor';
  if (view.sinceMinutes) return 'outside-window';
  return 'none';
}
