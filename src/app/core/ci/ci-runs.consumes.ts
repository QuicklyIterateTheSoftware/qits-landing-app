import type {
  ListActiveRunsResponses,
  ListRepositorySummariesResponses,
  ListRunsResponses,
} from '../../api/ci';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-ci's run lists: `REPOSITORY_RUNS` and `ACTIVE_RUNS`
 * (`ci.operations.ts`) declare these as `consumes`, so nothing else can be read, and their pact
 * spec binds exactly these fields.
 */

/**
 * A repository's newest runs: the release request page links the runs of the request (by
 * `releaseRequestId`, or by an id the request names) and says what each one is. The repository's
 * CI page (qits-2320) lists them all: how each was triggered (`triggerType`; an `EVENT` run's
 * `triggerEventName` and `configPath`), when it started (`startedAt`, for its duration), and why a
 * cancelled one was cancelled (`cancellationReason`) and by which run (`supersededByRunId`).
 */
export const LIST_REPOSITORY_RUNS = [
  'runs[].id',
  'runs[].branch',
  'runs[].commitSha',
  'runs[].status',
  'runs[].createdAt',
  'runs[].startedAt',
  'runs[].finishedAt',
  'runs[].releaseRequestId',
  'runs[].phase',
  'runs[].triggerType',
  'runs[].triggerEventName',
  'runs[].configPath',
  'runs[].cancellationReason',
  'runs[].supersededByRunId',
] as const;

/** One run, cut to what the release request page and the repository's CI page read. */
export type CiRun = NonNullable<
  Consumed<ListRunsResponses[200], typeof LIST_REPOSITORY_RUNS>['runs']
>[number];

/**
 * Every queued or running run, all repositories: the lightning menu marks each pending request
 * with its active runs (`activeRunsOf`), and links them. The project's CI page (qits-2314) lists
 * the ones of the project's repositories (`repoId`) under "Running now", with when each was
 * queued (`createdAt`) and started (`startedAt`).
 */
export const LIST_ACTIVE_RUNS = [
  'runs[].id',
  'runs[].repoId',
  'runs[].status',
  'runs[].branch',
  'runs[].releaseRequestId',
  'runs[].createdAt',
  'runs[].startedAt',
] as const;

/** One active run, cut to what the menu and the CI page read. */
export type ActiveCiRun = NonNullable<
  Consumed<ListActiveRunsResponses[200], typeof LIST_ACTIVE_RUNS>['runs']
>[number];

/**
 * Each repository's newest run and newest run on main, all repositories
 * (`/ci/api/repositories/summary`): the project's CI page (qits-2314) joins the rows to the
 * project's repositories by `repositoryId` (never by the row's `projectId`, which qits-ci knows
 * only for a push on the public address), and shows each run's status, branch, commit and when it
 * was queued and finished.
 */
export const LIST_REPOSITORY_SUMMARIES = [
  'repositories[].repositoryId',
  'repositories[].lastRun.id',
  'repositories[].lastRun.status',
  'repositories[].lastRun.branch',
  'repositories[].lastRun.commitSha',
  'repositories[].lastRun.createdAt',
  'repositories[].lastRun.finishedAt',
  'repositories[].lastMainRun.id',
  'repositories[].lastMainRun.status',
  'repositories[].lastMainRun.branch',
  'repositories[].lastMainRun.commitSha',
  'repositories[].lastMainRun.createdAt',
  'repositories[].lastMainRun.finishedAt',
] as const;

/** One repository's summary, cut to what the CI page reads. */
export type CiRepositorySummary = NonNullable<
  Consumed<ListRepositorySummariesResponses[200], typeof LIST_REPOSITORY_SUMMARIES>['repositories']
>[number];

/** A summary's run (its newest, or its newest on main), cut to what the CI page reads. */
export type CiSummaryRun = NonNullable<CiRepositorySummary['lastRun']>;
