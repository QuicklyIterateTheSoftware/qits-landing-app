import type { ListDeploymentRequestsResponses } from '../../api/deployments';
import type { Consumed } from '@qits/angular';

/**
 * What the Deployments section reads from qits-deployments (qits-2315). Each operation in
 * `deployments.operations.ts` passes its list to `consume(...)`, so it cannot read any other field,
 * and `deployments.operations.pact.spec.ts` passes the same list as `consumes`. To read another
 * field, add it here.
 */

/**
 * `listDeploymentRequests?projectId=`: each request's row (its version, priority, application, when
 * it was asked, its gate and the status of the deployment it handed off to), and the fields the
 * pending/completed split and the gate's word are decided by (`deployment-requests.ts`).
 */
export const LIST_PROJECT_DEPLOYMENT_REQUESTS = [
  'deploymentRequests[].id',
  'deploymentRequests[].applicationName',
  'deploymentRequests[].version',
  'deploymentRequests[].priority',
  'deploymentRequests[].repoId',
  'deploymentRequests[].qualityGate',
  'deploymentRequests[].gateDetail',
  'deploymentRequests[].createdAt',
  'deploymentRequests[].gateSettledAt',
  'deploymentRequests[].deploymentStatus',
  'deploymentRequests[].deployHold',
] as const;

/** One deployment request, cut to what the requests page reads. */
export type DeploymentRequestRow = NonNullable<
  Consumed<
    ListDeploymentRequestsResponses[200],
    typeof LIST_PROJECT_DEPLOYMENT_REQUESTS
  >['deploymentRequests']
>[number];
