import type { GetRunResponses, RetryRunResponses } from '../../api/ci';
import type { Consumed } from '@qits/angular';

/**
 * What the run page (qits-2321, `projects/<slug>/ci/runs/<runId>`) reads of one qits-ci run
 * (`getRun`, `RUN` in `ci.operations.ts`): the header (repository, branch, commit, status), the
 * facts (when, trigger, archetype, release request, target and lease, daemon, retry provenance,
 * cancellation, the queue's prediction), each finished step and the live one with their output.
 *
 * qits-ci's golden masters record `cancellationReason`, `supersededByRunId` and
 * `autoRetryDeferredUntil` as `null` in every state of a run of the project, so the pact binds them
 * as `null` there (as it binds `baseline.version` of a run's reports); the page shows them when a
 * run carries them.
 */
export const GET_RUN = [
  'id',
  'repoId',
  'repoName',
  'branch',
  'commitSha',
  'status',
  'createdAt',
  'startedAt',
  'finishedAt',
  'triggerType',
  'triggerEventName',
  'configPath',
  'archetypeName',
  'archetypeVersion',
  'releaseRequestId',
  'releaseRequestQualifiedId',
  'phase',
  'retryOfRunId',
  'continuedFromRunId',
  'retryReason',
  'autoRetry',
  'autoRetryDeferredUntil',
  'cancellationReason',
  'supersededByRunId',
  'queuePosition',
  'expectedStartInMillis',
  'expectedFinishInMillis',
  'leaseId',
  'targetId',
  'oomKills',
  'oomScope',
  'daemonVersion',
  'steps[].stepIndex',
  'steps[].name',
  'steps[].image',
  'steps[].status',
  'steps[].exitCode',
  'steps[].startedAt',
  'steps[].finishedAt',
  'steps[].output',
  'live.stepIndex',
  'live.startedAt',
  'live.output',
] as const;

/** One run, cut to what the run page reads. */
export type CiRunDetail = Consumed<GetRunResponses[200], typeof GET_RUN>;

/** One finished (or failed, or skipped) step of a run. */
export type CiRunStep = NonNullable<CiRunDetail['steps']>[number];

/** The step a running run is in, with the output it has written so far. */
export type CiLiveStep = NonNullable<CiRunDetail['live']>;

/** Run again (`retryRun`, 202): the new run's id, which the page goes to. */
export const RETRY_RUN_ANSWER = ['runId'] as const;

/** Run again's answer. */
export type RetriedRun = Consumed<RetryRunResponses[202], typeof RETRY_RUN_ANSWER>;
