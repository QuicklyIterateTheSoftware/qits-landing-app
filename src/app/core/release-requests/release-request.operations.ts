import { NOTHING, qitsOperation } from '@qits/angular';
import {
  approveReleaseRequest,
  declineReleaseRequest,
  getProjectReleaseRequest,
  getReleaseRequestApprovalEligibility,
  getReleaseRequestArtifacts,
  listCommitBuilds,
  listReleaseRequestCommits,
  moveReleaseRequestSource,
  overrideReleaseRequestUpstream,
  rerunReleasePipelinePhase,
  rerunReleaseRequestAutomation,
  setReleaseSourcePriority,
  waiveReleaseRequestAutomations,
  withdrawReleaseRequest,
} from '../../api/projects';
import {
  CHANGED_RELEASE_REQUEST,
  GET_APPROVAL_ELIGIBILITY,
  GET_PROJECT_RELEASE_REQUEST,
  GET_RELEASE_ARTIFACTS,
  LIST_COMMIT_BUILDS,
  LIST_RELEASE_REQUEST_COMMITS,
  MOVED_RELEASE_REQUEST_SOURCE,
} from './release-request.consumes';

/**
 * qits-projects' doors about one release request, declared as operations (qits-2145): the release
 * request page's reads, which it makes through its own `qitsResource`s, and the changes a person
 * makes on it, made through `qitsMutation` (qits-2146; `ReleaseRequestStore` made them before).
 * `release-request.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`; the writes' requests are built by `release-request-writes.ts`, for the patterns and the
 * pact spec alike.
 */

/**
 * The request, read through its project by the reference the page's URL names, its uuid or its
 * logical id (`getProjectReleaseRequest`): the page's whole head, facts and lifecycle.
 */
export const RELEASE_REQUEST = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getProjectReleaseRequest',
  method: 'GET',
  call: getProjectReleaseRequest,
  consumes: GET_PROJECT_RELEASE_REQUEST,
});

/** The commits the request's fold brought in (`listReleaseRequestCommits`): the Commits tab's graph. */
export const RELEASE_COMMITS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listReleaseRequestCommits',
  method: 'GET',
  call: listReleaseRequestCommits,
  consumes: LIST_RELEASE_REQUEST_COMMITS,
});

/** The CI verdicts on the fold's commit (`listCommitBuilds`): the Builds tab and the reports. */
export const COMMIT_BUILDS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listCommitBuilds',
  method: 'GET',
  call: listCommitBuilds,
  consumes: LIST_COMMIT_BUILDS,
});

/** What the release published (`getReleaseRequestArtifacts`), read once a tag is cut. */
export const RELEASE_ARTIFACTS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getReleaseRequestArtifacts',
  method: 'GET',
  call: getReleaseRequestArtifacts,
  consumes: GET_RELEASE_ARTIFACTS,
});

/**
 * Which requirements on the fold the viewer may satisfy (`getReleaseRequestApprovalEligibility`,
 * epic qits-1038): the approval's offer.
 */
export const APPROVAL_ELIGIBILITY = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'getReleaseRequestApprovalEligibility',
  method: 'GET',
  call: getReleaseRequestApprovalEligibility,
  consumes: GET_APPROVAL_ELIGIBILITY,
});

/** Approve the fold on show (`approveReleaseRequest`); the answer is the request. */
export const APPROVE_RELEASE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'approveReleaseRequest',
  method: 'POST',
  call: approveReleaseRequest,
  consumes: CHANGED_RELEASE_REQUEST,
});

/** Decline the fold on show (`declineReleaseRequest`); the answer is the request. */
export const DECLINE_RELEASE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'declineReleaseRequest',
  method: 'POST',
  call: declineReleaseRequest,
  consumes: CHANGED_RELEASE_REQUEST,
});

/** Call the request off (`withdrawReleaseRequest`); the answer is the request. */
export const WITHDRAW_RELEASE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'withdrawReleaseRequest',
  method: 'POST',
  call: withdrawReleaseRequest,
  consumes: CHANGED_RELEASE_REQUEST,
});

/**
 * Start QA without waiting for one upstream request (`overrideReleaseRequestUpstream`, epic
 * qits-897); the answer is the request.
 */
export const OVERRIDE_UPSTREAM = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'overrideReleaseRequestUpstream',
  method: 'POST',
  call: overrideReleaseRequestUpstream,
  consumes: CHANGED_RELEASE_REQUEST,
});

/** Run a pipeline phase again (`rerunReleasePipelinePhase`); the answer is the request. */
export const RERUN_PHASE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'rerunReleasePipelinePhase',
  method: 'POST',
  call: rerunReleasePipelinePhase,
  consumes: CHANGED_RELEASE_REQUEST,
});

/** Set a source branch's priority (`setReleaseSourcePriority`); the answer is the request. */
export const SET_SOURCE_PRIORITY = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'setReleaseSourcePriority',
  method: 'POST',
  call: setReleaseSourcePriority,
  consumes: CHANGED_RELEASE_REQUEST,
});

/**
 * Move a source branch to the request queued after this one (`moveReleaseRequestSource`,
 * qits-1665); the answer is both requests, `from` and `to`.
 */
export const MOVE_SOURCE = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'moveReleaseRequestSource',
  method: 'POST',
  call: moveReleaseRequestSource,
  consumes: MOVED_RELEASE_REQUEST_SOURCE,
});

/** Waive the automations gate for the fold (`waiveReleaseRequestAutomations`); the request. */
export const WAIVE_AUTOMATIONS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'waiveReleaseRequestAutomations',
  method: 'POST',
  call: waiveReleaseRequestAutomations,
  consumes: CHANGED_RELEASE_REQUEST,
});

/** Dispatch a run of one automation (`rerunReleaseRequestAutomation`): 202, no body read. */
export const RERUN_AUTOMATION = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'rerunReleaseRequestAutomation',
  method: 'POST',
  call: rerunReleaseRequestAutomation,
  consumes: NOTHING,
});
