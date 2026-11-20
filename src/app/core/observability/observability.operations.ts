import { qitsOperation } from '@qits/angular';
import {
  listSlowSpans,
  listTelemetryErrors,
  listTelemetryMetrics,
  listTelemetrySources,
  searchTelemetryLogs,
} from '../../api/observability';
import {
  LIST_SLOW_SPANS,
  LIST_TELEMETRY_ERRORS,
  LIST_TELEMETRY_METRICS,
  LIST_TELEMETRY_SOURCES,
  SEARCH_TELEMETRY_LOGS,
} from './observability.consumes';

/**
 * qits-observability's telemetry buffer reads declared as operations (qits-2313; the errors,
 * qits-2339; the metrics, qits-2340; the slow spans, qits-2341), for the Observability section's pages, which read them through `qitsResource`;
 * `observability.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`. Every door answers `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and
 * `qits:agent` only; anyone else gets a 403.
 */

/** The buffer's sources (the platform's services, workspaces and the unscoped rest), with counts. */
export const TELEMETRY_SOURCES = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listTelemetrySources',
  method: 'GET',
  call: listTelemetrySources,
  consumes: LIST_TELEMETRY_SOURCES,
});

/** A source's buffered log lines, oldest first, narrowed by level, body text and age. */
export const TELEMETRY_LOGS = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'searchTelemetryLogs',
  method: 'GET',
  call: searchTelemetryLogs,
  consumes: SEARCH_TELEMETRY_LOGS,
});

/**
 * A source's error spans and ERROR-or-worse logs, grouped by trace (the uncorrelated rest under an
 * empty trace id), narrowed by age (qits-2339).
 */
export const TELEMETRY_ERRORS = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listTelemetryErrors',
  method: 'GET',
  call: listTelemetryErrors,
  consumes: LIST_TELEMETRY_ERRORS,
});

/**
 * A source's metric series, the latest point of each (qits-2340): the buffer keeps no history, so
 * this is a snapshot, not a time series.
 */
export const TELEMETRY_METRICS = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listTelemetryMetrics',
  method: 'GET',
  call: listTelemetryMetrics,
  consumes: LIST_TELEMETRY_METRICS,
});

/**
 * A source's spans at or above a duration floor (`thresholdMs`, default 500), slowest first or
 * (`sort=recent`) newest first, narrowed by age (qits-2341); a truncated answer keeps the slowest
 * (or newest) and says how many matched.
 */
export const TELEMETRY_SLOW_SPANS = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listSlowSpans',
  method: 'GET',
  call: listSlowSpans,
  consumes: LIST_SLOW_SPANS,
});
