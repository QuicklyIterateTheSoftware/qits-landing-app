import { qitsOperation } from '@qits/angular';
import { listDeploymentRequests } from '../../api/deployments';
import { LIST_PROJECT_DEPLOYMENT_REQUESTS } from './deployments.consumes';

/**
 * qits-deployments' reads declared as operations (qits-2315), for the Deployments section's pages,
 * which read them through `qitsResource`; `deployments.operations.pact.spec.ts` binds each with the
 * same provider, operationId and `consumes`. `listDeploymentRequests` answers `qits:admin`,
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
