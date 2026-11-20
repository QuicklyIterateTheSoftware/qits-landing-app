import type { TelemetryTrace } from './observability.consumes';

/**
 * The Traces page's list folded into one entry per path, as a pure function over the answer
 * (qits-2342, ported from the retired qits-observability-frontend's `trace-group.ts`).
 *
 * **The key is the route, not the span name.** `GET /users` and `POST /users` are one path: the
 * method stays readable on the member rows, whose `rootName` is conventionally "METHOD /route".
 * Only when a trace carries no route at all (a non-HTTP root, or a root the buffer evicted along
 * with its attributes) does the name stand in as the key, and with no name either `(unnamed span)`,
 * so every trace has a key and there is no "unknown" bucket to invent ({@link groupKey}).
 *
 * **Nothing is re-sorted here.** Groups appear in the order their first member holds in the
 * server-sorted list, and members keep the server's order inside them. Newest first, that puts the
 * group with the newest trace first; slowest first, the group holding the slowest. A re-sort here
 * would make the two orders lie.
 *
 * A field the answer leaves out reads as nothing: no route, no name, 0, false or no services.
 */

/** One path's entry: the figures its row draws, and its member traces left untouched underneath. */
export interface TraceGroupView {
  /** The grouping key: the route, else the root name, else `(unnamed span)`. */
  readonly key: string;
  /** Whether the key came from a member's route rather than standing in from the span name. */
  readonly routed: boolean;
  /** The member traces, in the server's order. */
  readonly traces: readonly TelemetryTrace[];
  /** How many member traces hold at least one ERROR span. */
  readonly erroredTraces: number;
  /** Whether any member trace recorded an exception event. */
  readonly hasException: boolean;
  /** The slowest member's whole-trace duration. */
  readonly maxDurationMs: number;
  /** The newest member's start, for the row's time. */
  readonly latestStartEpochNanos: number;
  /** Every service seen across the members, in first-seen order. */
  readonly services: readonly string[];
}

/** The key one trace groups under: its route, else its root name, else `(unnamed span)`. */
export function groupKey(trace: Pick<TelemetryTrace, 'rootRoute' | 'rootName'>): string {
  return trace.rootRoute || trace.rootName || '(unnamed span)';
}

/** The answer folded into groups, in first-appearance order: one pass, no re-sort. */
export function viewTraceGroups(traces: readonly TelemetryTrace[]): readonly TraceGroupView[] {
  const groups = new Map<
    string,
    {
      routed: boolean;
      traces: TelemetryTrace[];
      erroredTraces: number;
      hasException: boolean;
      maxDurationMs: number;
      latestStartEpochNanos: number;
      services: Set<string>;
    }
  >();
  for (const trace of traces) {
    const key = groupKey(trace);
    let group = groups.get(key);
    if (!group) {
      group = {
        routed: false,
        traces: [],
        erroredTraces: 0,
        hasException: false,
        maxDurationMs: 0,
        latestStartEpochNanos: 0,
        services: new Set<string>(),
      };
      groups.set(key, group);
    }
    group.traces.push(trace);
    group.routed ||= !!trace.rootRoute;
    if ((trace.errorSpanCount ?? 0) > 0) group.erroredTraces++;
    group.hasException ||= trace.hasException === true;
    group.maxDurationMs = Math.max(group.maxDurationMs, trace.durationMs ?? 0);
    group.latestStartEpochNanos = Math.max(group.latestStartEpochNanos, trace.startEpochNanos ?? 0);
    for (const service of trace.services ?? []) group.services.add(service);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    routed: group.routed,
    traces: group.traces,
    erroredTraces: group.erroredTraces,
    hasException: group.hasException,
    maxDurationMs: group.maxDurationMs,
    latestStartEpochNanos: group.latestStartEpochNanos,
    services: [...group.services],
  }));
}
