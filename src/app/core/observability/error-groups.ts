import type { TelemetryErrorGroup, TelemetryErrorSpan } from './observability.consumes';
import { versionOf } from './telemetry';

/**
 * What one error group says about itself, as pure functions over the group (qits-2339, ported from
 * the retired qits-observability-frontend's `error-group.ts`). Three shapes a careless rendering
 * gets plausibly wrong, each asserted directly in the spec:
 *
 * - **A group's trace id can be empty, and then it is not a trace.** The service groups the
 *   evidence it could not correlate (a log written outside an active span) under `traceId: ""`,
 *   usually with no spans at all: a headline taken from `errorSpans[0]` would be blank on the one
 *   group most in need of a sentence. It is listed last, so it is not read as one more trace.
 * - **The headline is the exception's, when there is one.** A span event carries the service's own
 *   `exception` verdict, and its attributes `exception.type` and `exception.message`. Without one,
 *   a span's `statusMessage`, then an ERROR log's body; with nothing at all the group says so.
 * - **The latest instant is derived.** A group has no timestamp of its own: it is the newest end of
 *   its evidence, a span's start plus its duration or a log's own stamp. A span's start alone would
 *   date a slow failure to when it began rather than when it failed.
 */

/** A span event, as the errors read gives it (read whole). */
export type ErrorSpanEvent = NonNullable<TelemetryErrorSpan['events']>[number];

/** Where a group's headline came from. */
export type HeadlineKind = 'exception' | 'status' | 'log' | 'none';

/** One group, with the figures its row shows, and its members untouched underneath. */
export interface ErrorGroupView {
  /** The group itself, for the members an expanded row lists. */
  readonly group: TelemetryErrorGroup;
  /** The trace id, or the empty string for the uncorrelated group. */
  readonly traceId: string;
  /** Whether this group is evidence the service could not correlate to a trace. */
  readonly uncorrelated: boolean;
  /** The service that produced the evidence. */
  readonly serviceName: string;
  /** The exception, the status message or the log body, in that order; empty when none. */
  readonly headline: string;
  /** What the headline came from, so a row never presents a log line as an exception. */
  readonly headlineKind: HeadlineKind;
  /** How many spans the service marked ERROR. */
  readonly spanCount: number;
  /** How many ERROR-or-worse log records are grouped here. */
  readonly logCount: number;
  /** The newest instant across every member, in epoch milliseconds; 0 for an empty group. */
  readonly latestEpochMillis: number;
  /** The first `service.version` the evidence carries (spans first), or empty. */
  readonly version: string;
}

/**
 * The groups in the order the list shows them: the service's own (the same answer its
 * `telemetryErrors` MCP tool gives an agent), with the uncorrelated group moved last.
 */
export function viewErrorGroups(groups: readonly TelemetryErrorGroup[]): readonly ErrorGroupView[] {
  const views = groups.map(viewErrorGroup);
  return [
    ...views.filter((view) => !view.uncorrelated),
    ...views.filter((view) => view.uncorrelated),
  ];
}

/** One group's row figures. */
export function viewErrorGroup(group: TelemetryErrorGroup): ErrorGroupView {
  const spans = group.errorSpans ?? [];
  const logs = group.errorLogs ?? [];
  const headline = headlineOf(group);
  return {
    group,
    traceId: group.traceId ?? '',
    uncorrelated: !group.traceId,
    serviceName: group.serviceName ?? '',
    headline: headline.text,
    headlineKind: headline.kind,
    spanCount: spans.length,
    logCount: logs.length,
    latestEpochMillis: latestOf(group),
    version:
      [...spans, ...logs]
        .map((member) => versionOf(member.resourceAttributes))
        .find((version) => version !== '') ?? '',
  };
}

/** The exception event of the first span that has one: the service's own `exception` verdict. */
export function firstException(spans: readonly TelemetryErrorSpan[]): ErrorSpanEvent | undefined {
  for (const span of spans) {
    const event = (span.events ?? []).find((candidate) => candidate.exception === true);
    if (event) return event;
  }
  return undefined;
}

/** One attribute of an event, or the empty string. */
export function attribute(event: ErrorSpanEvent | undefined, key: string): string {
  return event?.attributes?.[key] ?? '';
}

/** An exception as one sentence: `type: message`, or whichever of the two it has. */
export function exceptionText(event: ErrorSpanEvent | undefined): string {
  const type = attribute(event, 'exception.type');
  const message = attribute(event, 'exception.message');
  return type && message ? `${type}: ${message}` : type || message;
}

/** A group's headline and where it came from. */
export function headlineOf(group: TelemetryErrorGroup): { text: string; kind: HeadlineKind } {
  const spans = group.errorSpans ?? [];
  const exception = exceptionText(firstException(spans));
  if (exception) return { text: exception, kind: 'exception' };
  const status = spans.find((span) => (span.statusMessage ?? '').trim() !== '');
  if (status) return { text: status.statusMessage ?? '', kind: 'status' };
  const log = (group.errorLogs ?? []).find((record) => (record.body ?? '').trim() !== '');
  if (log) return { text: log.body ?? '', kind: 'log' };
  return { text: '', kind: 'none' };
}

/**
 * The newest instant across a group's evidence, in milliseconds: a span ends at its start plus its
 * (integer millisecond) duration, a log at its own stamp.
 */
export function latestOf(group: TelemetryErrorGroup): number {
  let latest = 0;
  for (const span of group.errorSpans ?? []) {
    latest = Math.max(latest, (span.startEpochNanos ?? 0) / 1e6 + (span.durationMs ?? 0));
  }
  for (const log of group.errorLogs ?? []) {
    latest = Math.max(latest, (log.epochNanos ?? 0) / 1e6);
  }
  return latest;
}

/** How much evidence a group holds, both counts always: `1 error span · 0 error logs`. */
export function evidenceCounts(view: Pick<ErrorGroupView, 'spanCount' | 'logCount'>): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(view.spanCount, 'error span')} · ${plural(view.logCount, 'error log')}`;
}
