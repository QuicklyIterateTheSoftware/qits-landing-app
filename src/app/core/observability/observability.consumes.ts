import type {
  ListTelemetrySourcesResponses,
  SearchTelemetryLogsResponses,
} from '../../api/observability';
import type { Consumed } from '@qits/angular';

/**
 * What the Observability section reads from qits-observability's telemetry buffer (qits-2313). Each
 * operation in `observability.operations.ts` passes its list to `consume(...)`, so it cannot read
 * any other field, and `observability.operations.pact.spec.ts` passes the same list as `consumes`.
 * To read another field, add it here.
 */

/** `listTelemetrySources`: the source picker's rows, each with its counts and its reach. */
export const LIST_TELEMETRY_SOURCES = [
  'sources[].key',
  'sources[].kind',
  'sources[].label',
  'sources[].logs',
  'sources[].spans',
  'sources[].metricSeries',
  'sources[].oldestReceivedAt',
] as const;

/**
 * `searchTelemetryLogs`: each line's time, level, body and the resource attributes it shows
 * `service.version` from (read whole: a key with a dot in it is not a consumed path), and whether
 * the buffer held more than the answer.
 */
export const SEARCH_TELEMETRY_LOGS = [
  'logs[].epochNanos',
  'logs[].severityText',
  'logs[].body',
  'logs[].resourceAttributes',
  'truncated',
] as const;

/** One telemetry source, cut to what the picker reads. */
export type TelemetrySourceRow = NonNullable<
  Consumed<ListTelemetrySourcesResponses[200], typeof LIST_TELEMETRY_SOURCES>['sources']
>[number];

/** One log line, cut to what the logs page reads. */
export type TelemetryLogLine = NonNullable<
  Consumed<SearchTelemetryLogsResponses[200], typeof SEARCH_TELEMETRY_LOGS>['logs']
>[number];
