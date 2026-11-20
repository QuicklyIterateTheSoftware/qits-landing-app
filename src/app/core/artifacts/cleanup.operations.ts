import { qitsOperation } from '@qits/angular';
import {
  planArtifactsCleanupRepository,
  sweepArtifactsCleanupRepository,
} from '../../api/orchestrator';
import { PLAN_ARTIFACTS_CLEANUP, SWEEP_ARTIFACTS_CLEANUP } from './cleanup.consumes';

/**
 * qits-orchestrator's artifacts cleanup doors declared as operations (qits-2329), for the Artifacts
 * section's cleanup page (`ArtifactsCleanupPage`), which reads the plan through `qitsResource` and
 * sweeps through `qitsMutation`; `cleanup.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`. qits-orchestrator reads the platform's live pins and asks
 * qits-artifacts, whose answer it returns verbatim. Both doors answer `qits:admin`,
 * `qits:admin-agent`, `qits:desk-admin`, `qits:system` and `qits:agent` only; anyone else gets a
 * 403.
 */

/**
 * One store repository's collection plan (`planArtifactsCleanupRepository`): nothing is deleted.
 * 404: qits-artifacts has no such repository; 502: it could not be asked.
 */
export const ARTIFACTS_CLEANUP_PLAN = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'planArtifactsCleanupRepository',
  method: 'GET',
  call: planArtifactsCleanupRepository,
  consumes: PLAN_ARTIFACTS_CLEANUP,
});

/**
 * Sweep one store repository (`sweepArtifactsCleanupRepository`): the service computes a fresh plan
 * inside the request and applies that one, and answers with its receipt. It deletes, so the page
 * never queues it offline and never sends it again by itself. 404: no such repository; 409: a gc
 * run is active; 502: qits-artifacts could not be asked (an answer lost after the sweep began
 * looks the same).
 */
export const ARTIFACTS_CLEANUP_SWEEP = qitsOperation({
  provider: 'qits-orchestrator-service',
  operationId: 'sweepArtifactsCleanupRepository',
  method: 'POST',
  call: sweepArtifactsCleanupRepository,
  consumes: SWEEP_ARTIFACTS_CLEANUP,
});
