import type {
  ListCommitBuildsResponses,
  GetReleaseRequestArtifactsResponses,
  ListReleaseRequestCommitsResponses,
  GetReleaseRequestResponses,
  GetProjectReleaseRequestResponses,
  GetReleaseRequestApprovalEligibilityResponses,
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
 * Epic qits-1580 (the soft feature freeze): the freeze in force (`featureFreeze`), the request it
 * is queued behind or the one queued behind it (`queuedBehind*`, `queuedNext*`, null otherwise),
 * and per source whether it counts toward the freeze (`feature`) or joined a frozen request by name
 * (`explicitJoin`).
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
  'request.sources[].feature',
  'request.sources[].explicitJoin',
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
  'request.approvalNote',
  'request.approvalRequirements[].id',
  'request.approvalRequirements[].reason',
  'request.approvalRequirements[].admits',
  'request.approvalRequirements[].excludesAuthors',
  'request.approvalRequirements[].detail',
  'request.approvalRequirements[].satisfied',
  'request.approvalRequirements[].satisfiedBy.approver',
  'request.approvalRequirements[].satisfiedBy.roles',
  'request.approvalRequirements[].satisfiedBy.at',
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
  'request.automations[].failure.stepIndex',
  'request.automations[].failure.image',
  'request.automations[].failure.exitCode',
  'request.automations[].failure.excerpt',
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
  'request.pipeline.phases[].startedAt',
  'request.pipeline.phases[].finishedAt',
  'request.pipeline.phases[].detail',
  'request.pipeline.gates[].between',
  'request.pipeline.gates[].kind',
  'request.pipeline.gates[].state',
  'request.pipeline.gates[].detail',
  'request.qualityGates[].kind',
  'request.qualityGates[].label',
  'request.qualityGates[].position',
  'request.qualityGates[].state',
  'request.qualityGates[].detail',
  'request.qualityGates[].checks[].name',
  'request.qualityGates[].checks[].state',
  'request.qualityGates[].checks[].detail',
  'request.qualityGates[].runId',
  'request.featureFreeze.features',
  'request.featureFreeze.threshold',
  'request.featureFreeze.frozen',
  'request.featureFreeze.source',
  'request.queuedBehind',
  'request.queuedBehindQualifiedId',
  'request.queuedNext',
  'request.queuedNextQualifiedId',
] as const;

/**
 * The request read through its project by the reference the page's URL names (its uuid or its
 * logical id): the same fields as {@link GET_RELEASE_REQUEST}, plus the logical id the page's head
 * names it by.
 */
export const GET_PROJECT_RELEASE_REQUEST = [...GET_RELEASE_REQUEST, 'request.qualifiedId'] as const;

/**
 * The commits the request's fold brought in (`mergedSha^1..mergedSha`), with their parents and
 * which of them are fold merges, and each source's tip: what the branch graph lays out.
 */
export const LIST_RELEASE_REQUEST_COMMITS = [
  'commits[].hash',
  'commits[].shortHash',
  'commits[].author',
  'commits[].date',
  'commits[].message',
  'commits[].parents',
  'commits[].fold',
  'sources[].name',
  'sources[].tipSha',
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
  Consumed<GetReleaseRequestResponses[200], typeof GET_RELEASE_REQUEST>['request']
>;

/** One release request as its project answers it: {@link ReleaseRequest} and its logical id. */
export type ProjectReleaseRequest = NonNullable<
  Consumed<GetProjectReleaseRequestResponses[200], typeof GET_PROJECT_RELEASE_REQUEST>['request']
>;

/**
 * One approval requirement of a request's current fold (epic qits-1038): why it holds, the approval
 * roles that may satisfy it (`person`, `agent`, `agent@<project slug>`), whether the request's own
 * authors are shut out, and who satisfied it. Every field may be absent: an older qits-projects
 * answers none of them.
 */
export type ApprovalRequirement = NonNullable<ReleaseRequest['approvalRequirements']>[number];

/**
 * What the viewer may approve on a request (`GET …/{requestId}/approval-eligibility`, epic
 * qits-1038): the ids of the requirements on its current fold whose roles the viewer holds. The
 * door answers them under `eligibility`; the page reads nothing else of it (`viewer`,
 * `heldRoles`).
 */
export const GET_APPROVAL_ELIGIBILITY = ['eligibility.eligibleRequirementIds'] as const;

/** The eligibility answer's `eligibility`, cut to what the page reads. */
export type ApprovalEligibility = NonNullable<
  Consumed<
    GetReleaseRequestApprovalEligibilityResponses[200],
    typeof GET_APPROVAL_ELIGIBILITY
  >['eligibility']
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
  ListReleaseRequestCommitsResponses[200],
  typeof LIST_RELEASE_REQUEST_COMMITS
>;

/** One CI verdict on a commit. */
export type CommitBuild = NonNullable<
  Consumed<ListCommitBuildsResponses[200], typeof LIST_COMMIT_BUILDS>['builds']
>[number];

/** The artifacts answer. */
export type ReleaseArtifacts = Consumed<
  GetReleaseRequestArtifactsResponses[200],
  typeof GET_RELEASE_ARTIFACTS
>;

/** One published artifact. */
export type ReleaseArtifact = NonNullable<ReleaseArtifacts['artifacts']>[number];

/**
 * A change's answer (approve, decline, withdraw, rerun a phase, set a priority, waive): the whole
 * request, which takes the shown one's place, so the same fields as {@link GET_RELEASE_REQUEST}.
 */
export const CHANGED_RELEASE_REQUEST = GET_RELEASE_REQUEST;
