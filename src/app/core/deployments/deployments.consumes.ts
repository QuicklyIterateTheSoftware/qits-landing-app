import type {
  GetDeploymentRequestResponses,
  ListDeploymentRequestsResponses,
  ListDeploymentsResponses,
  ListEnvironmentsResponses,
} from '../../api/deployments';
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

/**
 * `getDeploymentRequest` (qits-2322): one request and the deployment it handed off to, as the
 * request's own page draws them: the head and the lifecycle (version, application, the tier it
 * was asked for, the repository its merge is looked up by), the request's facts (the gate, the
 * hold and who settled it, the package, the variant it deploys and the ones the release declares)
 * and the deployment's (status, commit, container, when it started and finished, the detail). A
 * request that queued nothing answers `deployment: null`. Approve and decline answer the same
 * envelope ({@link CHANGED_DEPLOYMENT_REQUEST}).
 */
export const GET_DEPLOYMENT_REQUEST = [
  'deploymentRequest.id',
  'deploymentRequest.applicationName',
  'deploymentRequest.variant',
  'deploymentRequest.variants[]',
  'deploymentRequest.version',
  'deploymentRequest.environmentId',
  'deploymentRequest.packageName',
  'deploymentRequest.repoId',
  'deploymentRequest.qualityGate',
  'deploymentRequest.gateDetail',
  'deploymentRequest.createdAt',
  'deploymentRequest.gateSettledAt',
  'deploymentRequest.deploymentStatus',
  'deploymentRequest.deployHold',
  'deploymentRequest.releaseRequestQualifiedId',
  'deploymentRequest.approvedBy',
  'deploymentRequest.approvedAt',
  'deploymentRequest.declinedBy',
  'deploymentRequest.declinedAt',
  'deployment.id',
  'deployment.status',
  'deployment.commitSha',
  'deployment.containerName',
  'deployment.detail',
  'deployment.createdAt',
  'deployment.finishedAt',
] as const;

/** `approveDeploymentRequest` and `declineDeploymentRequest`: the settled request, read as shown. */
export const CHANGED_DEPLOYMENT_REQUEST = GET_DEPLOYMENT_REQUEST;

/**
 * `listDeployments?environmentId=`: the tier's deployments, for one question: which version of
 * the request's application the tier's newest ACTIVE deployment runs.
 */
export const LIST_TIER_DEPLOYMENTS = [
  'deployments[].id',
  'deployments[].applicationName',
  'deployments[].version',
  'deployments[].status',
  'deployments[].createdAt',
] as const;

/** `listEnvironments`: every tier, for the name of the one a request names by id. */
export const LIST_ENVIRONMENTS = ['environments[].id', 'environments[].name'] as const;

/** One deployment request and its deployment, cut to what the request's page reads. */
export type DeploymentRequestAnswer = Consumed<
  GetDeploymentRequestResponses[200],
  typeof GET_DEPLOYMENT_REQUEST
>;

/** The request of {@link DeploymentRequestAnswer}. */
export type DeploymentRequestDetail = NonNullable<DeploymentRequestAnswer['deploymentRequest']>;

/** The deployment of {@link DeploymentRequestAnswer}. */
export type DeploymentDetail = NonNullable<DeploymentRequestAnswer['deployment']>;

/** One of the tier's deployments, cut to what the lifecycle reads. */
export type TierDeployment = NonNullable<
  Consumed<ListDeploymentsResponses[200], typeof LIST_TIER_DEPLOYMENTS>['deployments']
>[number];

/** One tier, cut to its id and name. */
export type TierEnvironment = NonNullable<
  Consumed<ListEnvironmentsResponses[200], typeof LIST_ENVIRONMENTS>['environments']
>[number];
