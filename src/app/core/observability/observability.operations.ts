import { qitsOperation } from '@qits/angular';
import {
  getTelemetryStore,
  getTelemetryTrace,
  listSlowSpans,
  listTelemetryErrors,
  listTelemetryMetrics,
  listTelemetrySources,
  listTelemetryTraces,
  searchTelemetryLogs,
} from '../../api/observability';
import {
  GET_TELEMETRY_STORE,
  GET_TELEMETRY_TRACE,
  LIST_SLOW_SPANS,
  LIST_TELEMETRY_ERRORS,
  LIST_TELEMETRY_METRICS,
  LIST_TELEMETRY_SOURCES,
  LIST_TELEMETRY_TRACES,
  SEARCH_TELEMETRY_LOGS,
} from './observability.consumes';

/**
 * qits-observability's telemetry buffer reads declared as operations (qits-2313; the errors,
 * qits-2339; the metrics, qits-2340; the slow spans, qits-2341; the traces, qits-2342; a trace and the store, qits-2343), for the Observability section's pages, which read them through `qitsResource`;
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

/**
 * One trace of a source, its spans by start and its correlated logs by time (qits-2343), asked
 * by the trace id in the path and `source` alone. An unknown or evicted trace is a 200 with no
 * spans, never a 404.
 */
export const TELEMETRY_TRACE = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'getTelemetryTrace',
  method: 'GET',
  call: getTelemetryTrace,
  consumes: GET_TELEMETRY_TRACE,
});

/**
 * The buffer's own state (qits-2343): the trace page reads it only after a trace answered no
 * spans, for whether anything was ever evicted (`evictedSpans`).
 */
export const TELEMETRY_STORE = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'getTelemetryStore',
  method: 'GET',
  call: getTelemetryStore,
  consumes: GET_TELEMETRY_STORE,
});

/**
 * A source's traces, each summarised by its root span (qits-2342): newest first or (`sort=duration`)
 * slowest first, at or above a duration floor (`thresholdMs`, default 0), narrowed to the traces any
 * of whose spans is one service's (`service`) and by age; a truncated answer keeps the newest (or
 * slowest) and says how many matched.
 */
export const TELEMETRY_TRACES = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listTelemetryTraces',
  method: 'GET',
  call: listTelemetryTraces,
  consumes: LIST_TELEMETRY_TRACES,
});
