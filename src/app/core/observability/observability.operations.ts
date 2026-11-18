import { qitsOperation } from '@qits/angular';
import { listTelemetrySources, searchTelemetryLogs } from '../../api/observability';
import { LIST_TELEMETRY_SOURCES, SEARCH_TELEMETRY_LOGS } from './observability.consumes';

/**
 * qits-observability's telemetry buffer reads declared as operations (qits-2313), for the
 * Observability section's pages, which read them through `qitsResource`;
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
