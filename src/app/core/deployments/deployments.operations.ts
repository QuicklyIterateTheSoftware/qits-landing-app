import { qitsOperation } from '@qits/angular';
import {
  approveDeploymentRequest,
  declineDeploymentRequest,
  getDeploymentRequest,
  listDeploymentRequests,
  listDeployments,
  listEnvironments,
} from '../../api/deployments';
import {
  CHANGED_DEPLOYMENT_REQUEST,
  GET_DEPLOYMENT_REQUEST,
  LIST_ENVIRONMENTS,
  LIST_PROJECT_DEPLOYMENT_REQUESTS,
  LIST_TIER_DEPLOYMENTS,
} from './deployments.consumes';

/**
 * qits-deployments' reads and writes declared as operations (qits-2315, qits-2322), for the
 * Deployments section's pages, which read them through `qitsResource` and write through
 * `qitsMutation`; `deployments.operations.pact.spec.ts` binds each with the same provider,
 * operationId and `consumes`. The deployment request doors answer `qits:admin`,
 * `qits:admin-agent`, `qits:desk-admin`, `qits:desk`, `qits:agent` and `qits:system` only; anyone
 * else gets a 403.
 */

/**
 * One project's deployment requests (`?projectId=`), newest first: every one the platform has not
 * finished with, and the ten newest settled ones (the server caps them).
 */
export const PROJECT_DEPLOYMENT_REQUESTS = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'listDeploymentRequests',
  method: 'GET',
  call: listDeploymentRequests,
  consumes: LIST_PROJECT_DEPLOYMENT_REQUESTS,
});

/**
 * One deployment request by its id (`getDeploymentRequest`), with the deployment it handed off to
 * (`null` when it queued none); 404 for an id nothing matches.
 */
export const DEPLOYMENT_REQUEST = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'getDeploymentRequest',
  method: 'GET',
  call: getDeploymentRequest,
  consumes: GET_DEPLOYMENT_REQUEST,
});

/** One tier's recorded deployments (`listDeployments?environmentId=`), newest first. */
export const TIER_DEPLOYMENTS = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'listDeployments',
  method: 'GET',
  call: listDeployments,
  consumes: LIST_TIER_DEPLOYMENTS,
});

/** Every tier (`listEnvironments`), for the name of the one a request names by id. */
export const ENVIRONMENTS = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'listEnvironments',
  method: 'GET',
  call: listEnvironments,
  consumes: LIST_ENVIRONMENTS,
});

/**
 * Approve a request held for manual approval (`approveDeploymentRequest`, no body): its deployment
 * is queued. The answer is the request and its queued deployment. 409: no longer held (settled,
 * or no longer the application's newest release); 404: no such request; 502: the released spec
 * could not be read.
 */
export const APPROVE_DEPLOYMENT_REQUEST = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'approveDeploymentRequest',
  method: 'POST',
  call: approveDeploymentRequest,
  consumes: CHANGED_DEPLOYMENT_REQUEST,
});

/**
 * Decline a request held for manual approval (`declineDeploymentRequest`, an optional `{ note }`):
 * nothing deploys, and the release request ends WITHDRAWN. The answer is the settled request, with
 * no deployment. 409: no longer held; 404: no such request.
 */
export const DECLINE_DEPLOYMENT_REQUEST = qitsOperation({
  provider: 'qits-deployments-service',
  operationId: 'declineDeploymentRequest',
  method: 'POST',
  call: declineDeploymentRequest,
  consumes: CHANGED_DEPLOYMENT_REQUEST,
});
