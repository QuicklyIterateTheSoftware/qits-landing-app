import type {
  GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashBuildsResponses,
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdArtifactsResponses,
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdCommitsResponses,
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `ReleaseRequestStore` reads from each qits-projects answer about one release request. The
 * store passes these lists to `consume(...)`, so it cannot read any other field, and its pact spec
 * binds exactly these fields. To read another field, add it here.
 */

/**
 * The request itself, as its page shows it: the head (state, priority, summary), the facts, the
 * sources, the conflict, the pipeline with its gates and automations, the approval and the release.
 */
export const GET_RELEASE_REQUEST = [
  'request.id',
  'request.repoId',
  'request.repoName',
  'request.backingBranch',
  'request.sources[].kind',
  'request.sources[].name',
  'request.sources[].ref',
  'request.sources[].implicit',
  'request.sources[].priority',
  'request.priority',
  'request.mergedSha',
  'request.state',
  'request.summary',
  'request.requester',
  'request.unattended',
  'request.gateTicketId',
  'request.detail',
  'request.approvalRequired',
  'request.approvalState',
  'request.approvedBy',
  'request.approvedAt',
  'request.gates[].kind',
  'request.gates[].state',
  'request.gates[].detail',
  'request.automations[].kind',
  'request.automations[].label',
  'request.automations[].state',
  'request.automations[].foldSha',
  'request.automations[].runId',
  'request.automations[].branch',
  'request.automations[].detail',
  'request.automations[].updatedAt',
  'request.conflict.target',
  'request.conflict.conflicts[].path',
  'request.conflict.conflicts[].head',
  'request.conflict.conflicts[].headSha',
  'request.conflict.conflicts[].reason',
  'request.conflict.conflicts[].kind',
  'request.conflict.conflicts[].ours',
  'request.conflict.conflicts[].theirs',
  'request.version',
  'request.supersededBy',
  'request.releasedSha',
  'request.mergedToMainAt',
  'request.retryable',
  'request.createdAt',
  'request.updatedAt',
  'request.pipeline.phases[].phase',
  'request.pipeline.phases[].state',
  'request.pipeline.phases[].runId',
  'request.pipeline.gates[].between',
  'request.pipeline.gates[].kind',
  'request.pipeline.gates[].state',
  'request.pipeline.gates[].detail',
] as const;

/** The commits the request's fold brought in (`mergedSha^1..mergedSha`). */
export const LIST_RELEASE_REQUEST_COMMITS = [
  'commits[].hash',
  'commits[].shortHash',
  'commits[].author',
  'commits[].date',
  'commits[].message',
  'detail',
] as const;

/** The CI verdicts on the fold's commit, newest first: what the build gate decides on. */
export const LIST_COMMIT_BUILDS = [
  'builds[].runId',
  'builds[].status',
  'builds[].branch',
  'builds[].finishedAt',
] as const;

/** What the release published and whether anything deploys it; read once a tag is cut. */
export const GET_RELEASE_ARTIFACTS = [
  'deployable',
  'artifacts[].type',
  'artifacts[].name',
  'artifacts[].version',
  'detail',
] as const;

/** One release request, cut to what its page reads. */
export type ReleaseRequest = NonNullable<
  Consumed<
    GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdResponses[200],
    typeof GET_RELEASE_REQUEST
  >['request']
>;

/** One source branch of a request. */
export type ReleaseSource = NonNullable<ReleaseRequest['sources']>[number];

/** One automation row of a request. */
export type ReleaseAutomation = NonNullable<ReleaseRequest['automations']>[number];

/** The conflict a request's fold ran into. */
export type ReleaseConflict = NonNullable<ReleaseRequest['conflict']>;

/** One conflicted path of a fold. */
export type ConflictedPath = NonNullable<ReleaseConflict['conflicts']>[number];

/** One phase of a request's release pipeline. */
export type ReleasePhase = NonNullable<NonNullable<ReleaseRequest['pipeline']>['phases']>[number];

/** One gate of a request's release pipeline. */
export type ReleasePipelineGate = NonNullable<
  NonNullable<ReleaseRequest['pipeline']>['gates']
>[number];

/** The commits answer. */
export type ReleaseCommits = Consumed<
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdCommitsResponses[200],
  typeof LIST_RELEASE_REQUEST_COMMITS
>;

/** One CI verdict on a commit. */
export type CommitBuild = NonNullable<
  Consumed<
    GetProjectsApiRepositoriesByRepoIdCommitsByCommitHashBuildsResponses[200],
    typeof LIST_COMMIT_BUILDS
  >['builds']
>[number];

/** The artifacts answer. */
export type ReleaseArtifacts = Consumed<
  GetProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdArtifactsResponses[200],
  typeof GET_RELEASE_ARTIFACTS
>;

/** One published artifact. */
export type ReleaseArtifact = NonNullable<ReleaseArtifacts['artifacts']>[number];

/**
 * A change's answer (approve, decline, withdraw, rerun a phase, set a priority, waive): the whole
 * request, which takes the shown one's place, so the same fields as {@link GET_RELEASE_REQUEST}.
 */
export const CHANGED_RELEASE_REQUEST = GET_RELEASE_REQUEST;
