import type { TelemetrySlowSpan } from './observability.consumes';

/**
 * The Slow spans page's shaping, as pure functions over the answer and the URL (qits-2341). The
 * cases a careless rendering gets plausibly wrong, each asserted directly in the spec:
 *
 * - **The floor is always sent.** The door's own default is 500 ms, but the page sends
 *   `thresholdMs` on every read, the default included, so what it asked for is what it shows
 *   ({@link thresholdOf}: only the offered floors, anything else is the default).
 * - **The order is the door's.** Slowest first by default, newest first with `sort=recent`; a
 *   truncated answer keeps the slowest (or newest) of what matched, which the page says in so many
 *   words ({@link truncationSentence}), never re-sorted here.
 * - **A duration reads at a glance** ({@link formatSpanDuration}): milliseconds under a second,
 *   seconds with one decimal from there.
 * - **Which call** ({@link callLine}) is the span's `url.full`, else its `http.route`, else nothing:
 *   a client span knows the whole URL, a server span only its route template.
 * - **An empty answer says why** ({@link emptyReason}), in order: the source holds no spans at all;
 *   none reaches the floor (only when there is one); none falls in the time range.
 */

/** The floor the page asks for when `?threshold=` is absent, as the door's own default. */
export const DEFAULT_THRESHOLD_MS = 500;

/** The floors the page offers, in milliseconds: the default first, `0` is any duration. */
export const THRESHOLDS_MS = [DEFAULT_THRESHOLD_MS, 1000, 100, 10, 0] as const;

/** The orders the door offers: `duration` (slowest first, the default) and `recent`. */
export type SlowSpansSort = 'duration' | 'recent';

/** A floor as a duration: `500 ms`, `1 s`. */
export function floorText(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000} s`;
}

/** A floor's label: `500 ms or slower`, `1 s or slower`, `Any duration`. */
export function thresholdLabel(ms: number): string {
  return ms === 0 ? 'Any duration' : `${floorText(ms)} or slower`;
}

/** `?threshold=` as one of the offered floors, else the default. */
export function thresholdOf(value: string | null): number {
  if (value === null || value.trim() === '') return DEFAULT_THRESHOLD_MS;
  const ms = Number(value);
  return (THRESHOLDS_MS as readonly number[]).includes(ms) ? ms : DEFAULT_THRESHOLD_MS;
}

/** `?sort=` as an order: `recent`, else the default (slowest first). */
export function sortOf(value: string | null): SlowSpansSort {
  return value === 'recent' ? 'recent' : 'duration';
}

/** A span's duration: `750 ms` under a second, else seconds with one decimal (`1.2 s`). */
export function formatSpanDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return '';
  if (durationMs < 1000) return `${Number(durationMs.toFixed(1))} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

/** Which call a span made or served: its `url.full`, else its `http.route`, else empty. */
export function callLine(span: Pick<TelemetrySlowSpan, 'attributes'>): string {
  return span.attributes?.['url.full'] || span.attributes?.['http.route'] || '';
}

/** Whether any of a span's events is an exception. */
export function hasException(span: Pick<TelemetrySlowSpan, 'events'>): boolean {
  return (span.events ?? []).some((event) => event.exception === true);
}

/** `Showing the slowest 200 of 312 matching spans` (`newest` when sorted by recency). */
export function truncationSentence(shown: number, total: number, sort: SlowSpansSort): string {
  return `Showing the ${sort === 'recent' ? 'newest' : 'slowest'} ${shown} of ${total} matching spans`;
}

/**
 * Why an answer holds no span, in order: the source holds none at all (its source row counts 0
 * spans); none reaches the floor (when there is one); none falls in the time range (when one is
 * set); else simply none.
 */
export type EmptyReason = 'no-spans' | 'below-floor' | 'outside-window' | 'none';

/** What an empty answer is put down to (see {@link EmptyReason}). */
export function emptyReason(view: {
  /** The chosen source row's `spans`, undefined while that row is not known. */
  readonly sourceSpans: number | undefined;
  readonly thresholdMs: number;
  readonly sinceMinutes: number | undefined;
}): EmptyReason {
  if (view.sourceSpans === 0) return 'no-spans';
  if (view.thresholdMs > 0) return 'below-floor';
  if (view.sinceMinutes) return 'outside-window';
  return 'none';
}
