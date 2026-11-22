import type {
  GetTelemetryStoreResponses,
  GetTelemetryTraceResponses,
  ListTelemetryErrorsResponses,
  ListTelemetryMetricsResponses,
  ListTelemetrySourcesResponses,
  ListTelemetryTracesResponses,
  SearchTelemetryLogsResponses,
} from '../../api/observability';
import type { Consumed } from '@qits/angular';

/**
 * What the Observability section reads from qits-observability's telemetry buffer (qits-2313). Each
 * operation in `observability.operations.ts` passes its list to `consume(...)`, so it cannot read
 * any other field, and `observability.operations.pact.spec.ts` passes the same list as `consumes`.
 * To read another field, add it here.
 */

/**
 * `listTelemetrySources`: the source picker's rows, each with its counts and its reach, and the
 * names of the services that reported into it (the Traces page's service lens, qits-2342).
 */
export const LIST_TELEMETRY_SOURCES = [
  'sources[].key',
  'sources[].kind',
  'sources[].label',
  'sources[].services[].name',
  'sources[].logs',
  'sources[].spans',
  'sources[].metricSeries',
  'sources[].oldestReceivedAt',
] as const;

/**
 * `searchTelemetryLogs`: each line's time, level, body, the service that wrote it and the resource
 * attributes it shows `service.version` from (read whole: a key with a dot in it is not a consumed
 * path), its trace id and the source it lives in (its trace's page is read at that source,
 * qits-2535), and whether the buffer held more than the answer.
 */
export const SEARCH_TELEMETRY_LOGS = [
  'logs[].epochNanos',
  'logs[].severityText',
  'logs[].body',
  'logs[].serviceName',
  'logs[].traceId',
  'logs[].source',
  'logs[].resourceAttributes',
  'truncated',
] as const;

/**
 * `listTelemetryErrors` (qits-2339): each group's trace id and service; its error spans' name, kind,
 * start, duration, status message, events (read whole: the `exception` flag and the
 * `exception.type` / `.message` / `.stacktrace` attributes) and resource attributes (read whole, for
 * `service.version`); its error logs' time, level, body and resource attributes; and how many groups
 * there were and whether the answer left some out.
 */
export const LIST_TELEMETRY_ERRORS = [
  'groups[].traceId',
  'groups[].serviceName',
  'groups[].errorSpans[].name',
  'groups[].errorSpans[].kind',
  'groups[].errorSpans[].startEpochNanos',
  'groups[].errorSpans[].durationMs',
  'groups[].errorSpans[].statusMessage',
  'groups[].errorSpans[].events',
  'groups[].errorSpans[].resourceAttributes',
  'groups[].errorLogs[].epochNanos',
  'groups[].errorLogs[].severityText',
  'groups[].errorLogs[].body',
  'groups[].errorLogs[].resourceAttributes',
  'total',
  'truncated',
] as const;

/**
 * `listTelemetryMetrics` (qits-2340): one latest point per series, each with its metric's name,
 * description, unit and type, its value, when it was stamped, the service that reported it and its
 * attributes (read whole: the series' identity beside the name, keyed with dots).
 */
export const LIST_TELEMETRY_METRICS = [
  'metrics[].name',
  'metrics[].description',
  'metrics[].unit',
  'metrics[].type',
  'metrics[].value',
  'metrics[].epochNanos',
  'metrics[].serviceName',
  'metrics[].attributes',
] as const;

/**
 * `getTelemetryTrace` (qits-2343): every span of the trace with what the waterfall and the span
 * detail show (its id and parent, service, scope, name, kind, start, duration, status and status
 * message, its attributes, events and resource attributes, each read whole: keys with dots, an
 * event's `exception` flag, name, time and attributes), and each correlated log's time, level,
 * body and span id.
 */
export const GET_TELEMETRY_TRACE = [
  'trace.spans[].spanId',
  'trace.spans[].parentSpanId',
  'trace.spans[].serviceName',
  'trace.spans[].scopeName',
  'trace.spans[].name',
  'trace.spans[].kind',
  'trace.spans[].startEpochNanos',
  'trace.spans[].durationMs',
  'trace.spans[].status',
  'trace.spans[].statusMessage',
  'trace.spans[].attributes',
  'trace.spans[].events',
  'trace.spans[].resourceAttributes',
  'trace.logs[].epochNanos',
  'trace.logs[].severityText',
  'trace.logs[].body',
  'trace.logs[].spanId',
] as const;

/**
 * `getTelemetryStore` (qits-2343): how many spans the buffer has evicted, which alone lets the
 * trace page offer eviction as the reason a trace answered no spans.
 */
export const GET_TELEMETRY_STORE = ['evictedSpans'] as const;

/**
 * `listTelemetryTraces` (qits-2342): each trace's id, its root span's name, service and route, the
 * services it touched, its start, duration and span count, how many of its spans are errors,
 * whether any recorded an exception and whether its root is missing from the buffer; and how many
 * traces matched and whether the answer left some out.
 */
export const LIST_TELEMETRY_TRACES = [
  'traces[].traceId',
  'traces[].rootName',
  'traces[].rootService',
  'traces[].rootRoute',
  'traces[].services',
  'traces[].startEpochNanos',
  'traces[].durationMs',
  'traces[].spanCount',
  'traces[].errorSpanCount',
  'traces[].hasException',
  'traces[].rootMissing',
  'total',
  'truncated',
] as const;

/** The buffer's sources, cut to what the picker reads. */
export type TelemetrySources = Consumed<
  ListTelemetrySourcesResponses[200],
  typeof LIST_TELEMETRY_SOURCES
>;

/** One telemetry source, cut to what the picker reads. */
export type TelemetrySourceRow = NonNullable<TelemetrySources['sources']>[number];

/** One log line, cut to what the logs page reads. */
export type TelemetryLogLine = NonNullable<
  Consumed<SearchTelemetryLogsResponses[200], typeof SEARCH_TELEMETRY_LOGS>['logs']
>[number];

/** A source's error groups, cut to what the errors page reads. */
export type TelemetryErrors = Consumed<
  ListTelemetryErrorsResponses[200],
  typeof LIST_TELEMETRY_ERRORS
>;

/** One error group: a trace's (or, under an empty trace id, no trace's) error spans and logs. */
export type TelemetryErrorGroup = NonNullable<TelemetryErrors['groups']>[number];

/** One error span of a group. */
export type TelemetryErrorSpan = NonNullable<TelemetryErrorGroup['errorSpans']>[number];

/** One error log of a group. */
export type TelemetryErrorLog = NonNullable<TelemetryErrorGroup['errorLogs']>[number];

/** A source's metric series, cut to what the metrics page reads. */
export type TelemetryMetrics = Consumed<
  ListTelemetryMetricsResponses[200],
  typeof LIST_TELEMETRY_METRICS
>;

/** One metric series at its latest point. */
export type TelemetryMetricPoint = NonNullable<TelemetryMetrics['metrics']>[number];

/** A source's traces, cut to what the traces page reads. */
export type TelemetryTraces = Consumed<
  ListTelemetryTracesResponses[200],
  typeof LIST_TELEMETRY_TRACES
>;

/** One trace's summary. */
export type TelemetryTraceSummary = NonNullable<TelemetryTraces['traces']>[number];

/** A trace, cut to what the trace page reads. */
export type TelemetryTrace = Consumed<GetTelemetryTraceResponses[200], typeof GET_TELEMETRY_TRACE>;

/** One span of a trace. */
export type TelemetryTraceSpan = NonNullable<NonNullable<TelemetryTrace['trace']>['spans']>[number];

/** One log line correlated to a trace. */
export type TelemetryTraceLog = NonNullable<NonNullable<TelemetryTrace['trace']>['logs']>[number];

/** The buffer's own state, cut to what the trace page reads. */
export type TelemetryStore = Consumed<GetTelemetryStoreResponses[200], typeof GET_TELEMETRY_STORE>;
