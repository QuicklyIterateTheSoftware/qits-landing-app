import type { TelemetryTraceLog, TelemetryTraceSpan } from './observability.consumes';

/**
 * A trace, turned into rows a template draws with two percentages and an indent (qits-2343,
 * ported from the retired qits-observability-frontend's `traces/trace-layout.ts`).
 *
 * A pure function over the spans, kept out of the page on purpose: each rule below is one a
 * bounded buffer forces, each can regress silently on screen, and a function is something a spec
 * can put a malformed trace into and read the answer out of. No chart library: a row is a `div`
 * with a `left` and a `width` in percent.
 *
 * - **A parent can be missing.** Eviction removes spans one at a time, and a client span whose
 *   server parent lives in another source is ordinary. Such a span is drawn at the top level with
 *   {@link WaterfallRow.parentMissing} set, and is never re-parented: an invented parent draws a
 *   plausible tree that misstates who called whom.
 * - **Every buffered span is drawn.** After the walk, anything not emitted (a parent cycle) is
 *   appended at the top level with the same marker rather than dropped.
 * - **`durationMs` may be 0** for a sub-millisecond span: its width stays an honest 0 and the bar
 *   is floored in CSS; {@link traceDuration} says `<1 ms`.
 * - **Nanosecond stamps exceed `Number.MAX_SAFE_INTEGER`**: JSON hands them to a double, losing
 *   tens of nanoseconds. Every arithmetic here lands in milliseconds, far above that error.
 */

const NANOS_PER_MS = 1_000_000;

/** How many levels a row is indented at most; deeper rows stay at this indent. */
export const MAX_INDENT_DEPTH = 12;

/** One span, placed. `leftPercent` and `widthPercent` are the whole geometry. */
export interface WaterfallRow {
  readonly span: TelemetryTraceSpan;
  /** How deep in the call tree, from 0. Purely an indent; it never changes the bar. */
  readonly depth: number;
  /** Where the bar starts, as a percentage of the trace's own window. */
  readonly leftPercent: number;
  /** How long the bar is, as a percentage of that window. Honestly 0 for a sub-ms span. */
  readonly widthPercent: number;
  /** It names a parent that is not buffered (or is in a cycle), so it is drawn at the top level. */
  readonly parentMissing: boolean;
  /** The service reported `ERROR` status on it. */
  readonly isError: boolean;
  /** It carries an event the service marked as an exception. */
  readonly hasException: boolean;
  /** How many correlated log records name this span. */
  readonly logCount: number;
}

/** The whole trace, laid out. */
export interface Waterfall {
  readonly rows: readonly WaterfallRow[];
  /** The earliest instant any buffered span starts at: the left edge of every bar. */
  readonly startEpochNanos: number;
  /** How wide the window is, in milliseconds (earliest start to latest end); 0 when empty. */
  readonly windowMs: number;
  /**
   * No buffered span lacks a parent: the root is not buffered, and the top row is the earliest
   * survivor rather than the call that began the work.
   */
  readonly rootMissing: boolean;
  /** Every service that reported a span, in first-seen order. */
  readonly services: readonly string[];
  /** Spans with `ERROR` status. */
  readonly errorCount: number;
}

/** The empty answer, which is what an unknown and an evicted trace both look like. */
export const EMPTY_WATERFALL: Waterfall = {
  rows: [],
  startEpochNanos: 0,
  windowMs: 0,
  rootMissing: false,
  services: [],
  errorCount: 0,
};

/**
 * Lays a trace out. `logs` is read only for each row's log count; the page lists the logs itself,
 * oldest first, because a log's place in a trace is when it happened.
 */
export function layOutTrace(
  spans: readonly TelemetryTraceSpan[],
  logs: readonly TelemetryTraceLog[] = [],
): Waterfall {
  if (spans.length === 0) return EMPTY_WATERFALL;

  const idOf = (span: TelemetryTraceSpan): string => span.spanId ?? '';
  const startOf = (span: TelemetryTraceSpan): number => span.startEpochNanos ?? 0;
  const durationOf = (span: TelemetryTraceSpan): number => span.durationMs ?? 0;

  const byId = new Map<string, TelemetryTraceSpan>();
  for (const span of spans) byId.set(idOf(span), span);

  /** Top level: no parent, itself as its parent, or a parent nobody buffered. */
  const isTopLevel = (span: TelemetryTraceSpan): boolean =>
    !span.parentSpanId || span.parentSpanId === span.spanId || !byId.has(span.parentSpanId);

  const children = new Map<string, TelemetryTraceSpan[]>();
  const roots: TelemetryTraceSpan[] = [];
  for (const span of spans) {
    if (isTopLevel(span)) {
      roots.push(span);
      continue;
    }
    const parent = span.parentSpanId ?? '';
    const siblings = children.get(parent);
    if (siblings) siblings.push(span);
    else children.set(parent, [span]);
  }

  const byStart = (left: TelemetryTraceSpan, right: TelemetryTraceSpan): number =>
    startOf(left) - startOf(right) || idOf(left).localeCompare(idOf(right));
  roots.sort(byStart);
  for (const siblings of children.values()) siblings.sort(byStart);

  const windowStart = spans.reduce(
    (earliest, span) => Math.min(earliest, startOf(span)),
    Number.POSITIVE_INFINITY,
  );
  const windowEnd = spans.reduce(
    (latest, span) => Math.max(latest, startOf(span) + durationOf(span) * NANOS_PER_MS),
    Number.NEGATIVE_INFINITY,
  );
  const windowMs = Math.max(0, (windowEnd - windowStart) / NANOS_PER_MS);

  const logCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.spanId) logCounts.set(log.spanId, (logCounts.get(log.spanId) ?? 0) + 1);
  }

  const rows: WaterfallRow[] = [];
  const emitted = new Set<string>();

  const place = (span: TelemetryTraceSpan, depth: number, parentMissing: boolean): WaterfallRow => {
    const offsetMs = (startOf(span) - windowStart) / NANOS_PER_MS;
    const left = windowMs > 0 ? clamp((offsetMs / windowMs) * 100, 0, 100) : 0;
    const width = windowMs > 0 ? clamp((durationOf(span) / windowMs) * 100, 0, 100 - left) : 0;
    return {
      span,
      depth,
      leftPercent: left,
      widthPercent: width,
      parentMissing,
      isError: span.status === 'ERROR',
      hasException: (span.events ?? []).some((event) => event.exception === true),
      logCount: logCounts.get(idOf(span)) ?? 0,
    };
  };

  // Iterative, not recursive: a malformed trace must not blow the stack. `emitted` is what ends a
  // cycle: a span already drawn is not drawn again beneath itself.
  const walk = (root: TelemetryTraceSpan): void => {
    const stack: { span: TelemetryTraceSpan; depth: number }[] = [{ span: root, depth: 0 }];
    while (stack.length > 0) {
      const { span, depth } = stack.pop()!;
      if (emitted.has(idOf(span))) continue;
      emitted.add(idOf(span));
      rows.push(place(span, depth, depth === 0 && !!span.parentSpanId));
      const kids = children.get(idOf(span)) ?? [];
      for (let index = kids.length - 1; index >= 0; index -= 1) {
        stack.push({ span: kids[index], depth: depth + 1 });
      }
    }
  };
  for (const root of roots) walk(root);

  // Whatever a cycle swallowed: unreachable from any top-level span, so drawn at the top level
  // with the marker. A span in the wrong place is recoverable; a span not shown is not.
  for (const span of [...spans].sort(byStart)) {
    if (!emitted.has(idOf(span))) {
      emitted.add(idOf(span));
      rows.push(place(span, 0, true));
    }
  }

  const services: string[] = [];
  for (const span of spans) {
    if (span.serviceName && !services.includes(span.serviceName)) services.push(span.serviceName);
  }

  return {
    rows,
    startEpochNanos: windowStart,
    windowMs,
    rootMissing: !spans.some((span) => !span.parentSpanId),
    services,
    errorCount: spans.filter((span) => span.status === 'ERROR').length,
  };
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/**
 * A span's (or the trace's) length: `<1 ms` for 0 (the store's milliseconds have nothing finer),
 * `750 ms` under a second, else seconds (`1.50 s`, `65.0 s`); empty when unknown.
 */
export function traceDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return '';
  if (durationMs === 0) return '<1 ms';
  if (durationMs < 1000) return `${Number(durationMs.toFixed(1))} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
}

/** How far into the trace an instant is: `+50 ms`, from the window's start; empty when unknown. */
export function traceOffset(epochNanos: number | undefined, startEpochNanos: number): string {
  if (epochNanos === undefined || !Number.isFinite(epochNanos)) return '';
  const ms = Math.max(0, Math.round((epochNanos - startEpochNanos) / NANOS_PER_MS));
  return `+${ms.toLocaleString('en-US')} ms`;
}

/** A row's indent, in levels: its depth, at most {@link MAX_INDENT_DEPTH}. */
export function indentLevels(depth: number): number {
  return Math.min(Math.max(depth, 0), MAX_INDENT_DEPTH);
}

/** `1 span`, `2 spans`. */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The trace's header line: its span and service counts, its total duration (the window) and,
 * when any, how many spans are ERROR: `2 spans · 1 service · 750 ms · 1 error span`.
 */
export function traceSummary(layout: Waterfall): string {
  const parts = [
    counted(layout.rows.length, 'span'),
    counted(layout.services.length, 'service'),
    traceDuration(Math.round(layout.windowMs * 1000) / 1000),
  ];
  if (layout.errorCount > 0) parts.push(counted(layout.errorCount, 'error span'));
  return parts.join(' · ');
}
