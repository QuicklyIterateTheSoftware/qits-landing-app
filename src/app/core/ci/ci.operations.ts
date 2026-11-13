import { qitsOperation } from '@qits/angular';
import { getRunReport, listActiveRuns, listRunReports, listRuns } from '../../api/ci';
import { GET_RUN_REPORT, LIST_RUN_REPORTS } from './ci-reports.consumes';
import { LIST_ACTIVE_RUNS, LIST_REPOSITORY_RUNS } from './ci-runs.consumes';

/**
 * qits-ci's run and report reads declared as operations (qits-2145), read through `qitsResource`
 * (qits-2146; `CiRunsStore` and `CiReportsStore` read them before): a repository's newest runs (the
 * release request page), every queued or running run (the lightning menu's chips), and a run's
 * reports (`app-run-reports`). `ci.operations.pact.spec.ts` binds each with the same provider,
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
