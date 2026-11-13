import { qitsOperation } from '@qits/angular';
import {
  ensureWorkspaceContainer,
  recreateWorkspaceContainer,
  stopWorkspaceContainer,
} from '../../api/workspaces';
import { REFUSAL, REFUSAL_MESSAGE } from './agent-actions.consumes';
import { ENSURE_CONTAINER, RECREATE_CONTAINER, STOP_CONTAINER } from './container-actions.consumes';

/**
 * A slot's container verbs on qits-workspaces (epic qits-1230), on the workspace page only (epic
 * qits-1667), declared as operations (qits-2145) that `app-container-actions` writes through
 * `qitsMutation` in place of the former `ContainerActionsStore` (qits-2146):
 * `…/workspaces/{id}/ensure-container|stop-container|recreate-container`. A slot whose lease
 * qits-system cannot be asked about is refused (409 `TARGET_UNAVAILABLE`); a recreate needs a
 * working tree the service can prove clean (400 otherwise). A stop and a recreate name the agents
 * they affected (`affectedAgentIds`). `container-actions.operations.pact.spec.ts` binds each.
 */

/** Start: the start the call made (or joined). */
export const CONTAINER_ENSURE = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'ensureWorkspaceContainer',
  method: 'POST',
  call: ensureWorkspaceContainer,
  consumes: ENSURE_CONTAINER,
  errorConsumes: REFUSAL,
});

/** Stop: the slot, its container now stopped, and the agents the stop affected. */
export const CONTAINER_STOP = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'stopWorkspaceContainer',
  method: 'POST',
  call: stopWorkspaceContainer,
  consumes: STOP_CONTAINER,
  errorConsumes: REFUSAL,
});

/** Recreate: the new container's start, and the agents it affected; a refusal names no code. */
export const CONTAINER_RECREATE = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'recreateWorkspaceContainer',
  method: 'POST',
  call: recreateWorkspaceContainer,
  consumes: RECREATE_CONTAINER,
  errorConsumes: REFUSAL_MESSAGE,
});
