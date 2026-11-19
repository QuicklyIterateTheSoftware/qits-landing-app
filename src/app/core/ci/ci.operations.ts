import { NOTHING, qitsOperation } from '@qits/angular';
import {
  cancelRun,
  getRun,
  getRunReport,
  listActiveRuns,
  listRepositorySummaries,
  listRunReports,
  listRuns,
  retryRun,
} from '../../api/ci';
import { GET_RUN_REPORT, LIST_RUN_REPORTS } from './ci-reports.consumes';
import { GET_RUN, RETRY_RUN_ANSWER } from './ci-run.consumes';
import {
  LIST_ACTIVE_RUNS,
  LIST_REPOSITORY_RUNS,
  LIST_REPOSITORY_SUMMARIES,
} from './ci-runs.consumes';

/**
 * qits-ci's run and report reads declared as operations (qits-2145), read through `qitsResource`
 * (qits-2146; `CiRunsStore` and `CiReportsStore` read them before): a repository's newest runs (the
 * release request page), every queued or running run (the lightning menu's chips and the project's
 * CI page), each repository's newest runs (the project's CI page, qits-2314), a run's reports
 * (`app-run-reports`), and one run with its steps, cancelled or run again (the run page,
 * qits-2321). `ci.operations.pact.spec.ts` binds each with the same provider,
 * operationId and `consumes`. Each reader reads again after `BUILD_EVENTS` (`build-events.ts`)
 * naming its repository or run.
 */

/** How many of a repository's newest runs are read. */
export const RUNS_LIMIT = 100;

/** A repository's newest {@link RUNS_LIMIT} runs, newest first (`listRuns?repositoryId=`). */
export const REPOSITORY_RUNS = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'listRuns',
  method: 'GET',
  call: listRuns,
  consumes: LIST_REPOSITORY_RUNS,
});

/** Every queued or running run, all repositories (`/ci/api/runs/active`). */
export const ACTIVE_RUNS = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'listActiveRuns',
  method: 'GET',
  call: listActiveRuns,
  consumes: LIST_ACTIVE_RUNS,
});

/**
 * Each repository's newest run and newest run on main, every repository qits-ci knows
 * (`/ci/api/repositories/summary`, one bounded answer): the project's CI page (qits-2314).
 */
export const REPOSITORY_SUMMARIES = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'listRepositorySummaries',
  method: 'GET',
  call: listRepositorySummaries,
  consumes: LIST_REPOSITORY_SUMMARIES,
});

/** A run's reports with their highlights. */
export const RUN_REPORTS = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'listRunReports',
  method: 'GET',
  call: listRunReports,
  consumes: LIST_RUN_REPORTS,
});

/** One report with its payload, for the kinds the page draws in full. */
export const RUN_REPORT = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'getRunReport',
  method: 'GET',
  call: getRunReport,
  consumes: GET_RUN_REPORT,
});

/** One run with its steps and the live step's output (`/ci/api/runs/{runId}`): the run page. */
export const RUN = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'getRun',
  method: 'GET',
  call: getRun,
  consumes: GET_RUN,
});

/**
 * Cancel on the run page (`/ci/api/runs/{runId}/cancel`, 202 with no body): qits-ci stops the run,
 * or asks its runner to; the next read (its `BuildStatusChanged`) shows it CANCELLED.
 */
export const CANCEL_RUN = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'cancelRun',
  method: 'POST',
  call: cancelRun,
  consumes: NOTHING,
});

/** Run again on the run page (`/ci/api/runs/{runId}/retry`, 202): the new run's id. */
export const RETRY_RUN = qitsOperation({
  provider: 'qits-ci-service',
  operationId: 'retryRun',
  method: 'POST',
  call: retryRun,
  consumes: RETRY_RUN_ANSWER,
});
