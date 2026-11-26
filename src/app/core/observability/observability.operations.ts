import { qitsOperation } from '@qits/angular';
import {
  dismissErrorIssue,
  getErrorIssue,
  getTelemetryStore,
  getTelemetryTrace,
  listErrorIssues,
  listTelemetryMetrics,
  listTelemetrySources,
  listTelemetryTraces,
  searchTelemetryLogs,
} from '../../api/observability';
import {
  DISMISSED_ERROR_ISSUE,
  ERROR_ISSUE_DETAIL,
  ERROR_ISSUE_ROWS,
  GET_TELEMETRY_STORE,
  GET_TELEMETRY_TRACE,
  LIST_TELEMETRY_METRICS,
  LIST_TELEMETRY_SOURCES,
  LIST_TELEMETRY_TRACES,
  SEARCH_TELEMETRY_LOGS,
} from './observability.consumes';

/**
 * qits-observability's telemetry buffer reads declared as operations (qits-2313; the metrics, qits-2340; the traces, qits-2342; a trace and the store, qits-2343), for the Observability section's pages, which read them through `qitsResource`;
 * `observability.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`. Every door answers `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and
 * `qits:agent` only; anyone else gets a 403. The stored error issues (qits-2538) are qits-observability's
 * own table, not the buffer: read by the same roles, dismissed by `qits:admin`, `qits:admin-agent`
 * and `qits:desk-admin` only (`qits:agent` gets a 403).
 */

/** The buffer's sources (the platform's services, workspaces and the unscoped rest), with counts. */
export const TELEMETRY_SOURCES = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listTelemetrySources',
  method: 'GET',
  call: listTelemetrySources,
  consumes: LIST_TELEMETRY_SOURCES,
});

/**
 * The buffered log lines, oldest first: every source merged when none is named (qits-2534),
 * narrowed by service, level, body text, age and trace.
 */
export const TELEMETRY_LOGS = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'searchTelemetryLogs',
  method: 'GET',
  call: searchTelemetryLogs,
  consumes: SEARCH_TELEMETRY_LOGS,
});

/**
 * The stored error issues (qits-2538), most recently seen first: OPEN by default (`state`, also
 * DISMISSED or ALL), narrowed by service. An issue belongs to the estate, not to a buffer source.
 */
export const LIST_ERROR_ISSUES = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'listErrorIssues',
  method: 'GET',
  call: listErrorIssues,
  consumes: ERROR_ISSUE_ROWS,
});

/**
 * One stored error issue by its fingerprint (qits-2538), with its sample and its hourly counts over
 * the last `hours` (default 168, seven days).
 */
export const GET_ERROR_ISSUE = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'getErrorIssue',
  method: 'GET',
  call: getErrorIssue,
  consumes: ERROR_ISSUE_DETAIL,
});

/**
 * Dismisses an OPEN issue (qits-2538), no body; the answer is the issue, DISMISSED. A later
 * occurrence opens it again as a regression.
 */
export const DISMISS_ERROR_ISSUE = qitsOperation({
  provider: 'qits-observability-service',
  operationId: 'dismissErrorIssue',
  method: 'POST',
  call: dismissErrorIssue,
  consumes: DISMISSED_ERROR_ISSUE,
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
