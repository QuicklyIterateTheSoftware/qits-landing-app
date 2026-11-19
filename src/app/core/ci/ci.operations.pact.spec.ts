import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as ciClient } from '../../api/ci/client.gen';
import { provideHeyApiClient } from '../../api/ci/client/client.gen';
import { addGoldenInteraction } from '@qits/angular/testing';
import { ciGoldenMasters as masters, heldBy } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import {
  ACTIVE_RUNS,
  CANCEL_RUN,
  REPOSITORY_RUNS,
  REPOSITORY_SUMMARIES,
  RETRY_RUN,
  RUN,
  RUN_REPORT,
  RUN_REPORTS,
  RUNS_LIMIT,
} from './ci.operations';

/**
 * qits-landing-app's pact with qits-ci-service: `pacts/qits-landing-app_qits-ci-service.json`,
 * against qits-ci's golden masters (`@qits/ci-golden-masters`), for the operations of
 * `ci.operations.ts`: a repository's newest runs (the release request page), every queued or
 * running run (the lightning menu), and a run's reports and one report's payload
 * (`app-run-reports`); and the project's CI page (qits-2314): every repository's summary and the
 * active runs, in a state whose repositories are the ones qits-projects' "a project with 3
 * repositories" lists, and one whose runs are all of repositories outside that project (the page's
 * empty state, by the join). "no runs recorded" is not pacted: its lists are empty, which the pact
 * would bind as exactly empty, and the provider verifies against a database other test classes
 * share. The run page (qits-2321) reads one run of contract-service (qits-projects' "a project with
 * 3 repositories") finished, running and queued, and a run qits-ci does not have (404); cancels
 * the running one, runs the finished one again, and reads the finished one's reports.
 *
 * Moved here from `CiRunsStore`'s and `CiReportsStore`'s pact specs when the stores went
 * (qits-2146), unchanged: the same descriptions, states, requests and bound fields. Each test runs
 * the operation's own `fetch` against a pact mock server answering with qits-ci's golden master;
 * each interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-ci-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const RUNS_STATE = 'a repository with the runs of a release request';
const ACTIVE_STATE = 'a commit with a run in flight';
const REPORTS_STATE = 'a run with reports: failing tests and coverage';
const PROJECT_STATE = 'a project whose repositories have runs';
const OUTSIDE_STATE = 'runs only of repositories outside the project';
const FINISHED_STATE = 'a finished run of the project';
const RUNNING_STATE = 'a running run of the project';
const QUEUED_STATE = 'a queued run of the project';
const NO_RUN_STATE = 'no run with the given id';
const OPERATIONS = [
  'listRuns',
  'listActiveRuns',
  'listRunReports',
  'getRunReport',
  'listRepositorySummaries',
  'getRun',
  'cancelRun',
  'retryRun',
];

/** What an interaction takes of an operation: its provider, operationId and `consumes`. */
interface Bound {
  readonly provider: string;
  readonly operationId: string;
  readonly consumes: readonly string[];
}

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(ciClient),
    ],
  });
  ciClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-ci-service pact', () => {
  let dir = '';
  let pact: PactV4;

  const given = (state: string, op: Bound, interaction: string) => {
    if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is not ${PROVIDER}'s`);
    return addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state,
      operationId: op.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction },
      // A field under a recorded `null` (a finished run's `live`, a run without a baseline) is
      // bound in a state that has it.
      consumes: op.consumes.length
        ? heldBy(masters, state, op.operationId, op.consumes)
        : op.consumes,
    });
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-ci-pact-'));
    pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
  });

  afterAll(() => {
    ciClient.setConfig({ baseUrl: '' });
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-release-request-runs: the page reads the repository’s newest runs', () =>
    given(RUNS_STATE, REPOSITORY_RUNS, 'show-release-request-runs').executeTest(async (server) => {
      const repositoryId = masters.operation(RUNS_STATE, 'listRuns').query['repositoryId'];
      const { data, error } = await at(server.url, () =>
        REPOSITORY_RUNS.fetch({ query: { repositoryId, limit: RUNS_LIMIT } }),
      );
      expect(error).toBeUndefined();
      expect(Array.isArray(data?.runs)).toBe(true);
    }));

  it('show-release-request-active-runs: the lightning menu reads every queued or running run', () =>
    given(ACTIVE_STATE, ACTIVE_RUNS, 'show-release-request-active-runs').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => ACTIVE_RUNS.fetch({}));
        const recorded = masters.body<{ runs: { id: string; status: string }[] }>(
          ACTIVE_STATE,
          'listActiveRuns',
        );
        expect(data?.runs?.map((run) => [run.id, run.status])).toEqual(
          recorded.runs.map((run) => [run.id, run.status]),
        );
      },
    ));

  it('show-project-ci: the CI page reads every repository’s newest runs', () =>
    given(PROJECT_STATE, REPOSITORY_SUMMARIES, 'show-project-ci').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => REPOSITORY_SUMMARIES.fetch({}));
      expect(error).toBeUndefined();
      // The list is filtered to the state's rows (`listFilteredTo`): the mock answers one row per
      // recorded shape, each one of the recorded rows.
      const recorded = masters.body<{
        repositories: { repositoryId: string; lastRun: { id: string; status: string } }[];
      }>(PROJECT_STATE, 'listRepositorySummaries');
      const rows = recorded.repositories.map((row) => [row.repositoryId, row.lastRun.status]);
      expect(data?.repositories?.length).toBeGreaterThan(0);
      for (const row of data?.repositories ?? []) {
        expect(rows).toContainEqual([row.repositoryId, row.lastRun?.status]);
      }
    }));

  it('show-project-ci: the CI page reads the runs in flight, with their repositories', () =>
    given(PROJECT_STATE, ACTIVE_RUNS, 'show-project-ci').executeTest(async (server) => {
      const { data } = await at(server.url, () => ACTIVE_RUNS.fetch({}));
      const recorded = masters.body<{ runs: { id: string; repoId: string }[] }>(
        PROJECT_STATE,
        'listActiveRuns',
      );
      expect(data?.runs?.map((run) => [run.id, run.repoId])).toEqual(
        recorded.runs.map((run) => [run.id, run.repoId]),
      );
    }));

  it('show-project-ci: the CI page reads summaries of repositories outside the project only', () =>
    given(OUTSIDE_STATE, REPOSITORY_SUMMARIES, 'show-project-ci').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => REPOSITORY_SUMMARIES.fetch({}));
      expect(error).toBeUndefined();
      const recorded = masters.body<{ repositories: { repositoryId: string }[] }>(
        OUTSIDE_STATE,
        'listRepositorySummaries',
      );
      const ids = recorded.repositories.map((row) => row.repositoryId);
      expect(data?.repositories?.length).toBeGreaterThan(0);
      for (const row of data?.repositories ?? []) expect(ids).toContain(row.repositoryId);
    }));

  it('show-project-ci: the CI page reads runs in flight of repositories outside the project', () =>
    given(OUTSIDE_STATE, ACTIVE_RUNS, 'show-project-ci').executeTest(async (server) => {
      const { data } = await at(server.url, () => ACTIVE_RUNS.fetch({}));
      const recorded = masters.body<{ runs: { id: string; repoId: string }[] }>(
        OUTSIDE_STATE,
        'listActiveRuns',
      );
      expect(data?.runs?.map((run) => [run.id, run.repoId])).toEqual(
        recorded.runs.map((run) => [run.id, run.repoId]),
      );
    }));

  for (const [state, status] of [
    [FINISHED_STATE, 'FAILED'],
    [RUNNING_STATE, 'RUNNING'],
    [QUEUED_STATE, 'QUEUED'],
  ] as const) {
    it(`show-ci-run: the run page reads a run of the project, ${status.toLowerCase()}`, () =>
      given(state, RUN, 'show-ci-run').executeTest(async (server) => {
        const runId = masters.operation(state, 'getRun').params['runId'];
        const { data, error } = await at(server.url, () => RUN.fetch({ path: { runId } }));
        expect(error).toBeUndefined();
        const recorded = masters.body<{ id: string; repoId: string }>(state, 'getRun');
        expect([data?.id, data?.repoId, data?.status]).toEqual([
          recorded.id,
          recorded.repoId,
          status,
        ]);
      }));
  }

  it('show-ci-run: the run page reads a run qits-ci does not have', () =>
    // On an error the operation reads nothing from the body: its `errorConsumes` is empty.
    given(NO_RUN_STATE, { ...RUN, consumes: [] }, 'show-ci-run').executeTest(async (server) => {
      const runId = masters.operation(NO_RUN_STATE, 'getRun').params['runId'];
      const { data, response } = await at(server.url, () => RUN.fetch({ path: { runId } }));
      expect(response?.status).toBe(404);
      expect(data).toBeUndefined();
    }));

  it('show-ci-run: the run page reads a finished run’s reports', () =>
    given(FINISHED_STATE, RUN_REPORTS, 'show-ci-run').executeTest(async (server) => {
      const runId = masters.operation(FINISHED_STATE, 'listRunReports').params['runId'];
      const { data, error } = await at(server.url, () => RUN_REPORTS.fetch({ path: { runId } }));
      expect(error).toBeUndefined();
      expect(data?.reports?.map((report) => report.kind)).toEqual(['test-results']);
    }));

  it('cancel-ci-run: Cancel on the run page stops a running run', () =>
    given(RUNNING_STATE, CANCEL_RUN, 'cancel-ci-run').executeTest(async (server) => {
      const { params, body } = masters.operation(RUNNING_STATE, 'cancelRun');
      const { response, error } = await at(server.url, () =>
        CANCEL_RUN.fetch({
          path: { runId: params['runId'] },
          body: body as { reason: string },
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(202);
    }));

  it('retry-ci-run: Run again on the run page queues a new run of a finished one', () =>
    given(FINISHED_STATE, RETRY_RUN, 'retry-ci-run').executeTest(async (server) => {
      const runId = masters.operation(FINISHED_STATE, 'retryRun').params['runId'];
      const { data, error } = await at(server.url, () => RETRY_RUN.fetch({ path: { runId } }));
      expect(error).toBeUndefined();
      const recorded = masters.body<{ runId: string }>(FINISHED_STATE, 'retryRun');
      expect(data?.runId).toBe(recorded.runId);
    }));

  it('show-release-request-reports: the page reads a run’s reports', () =>
    given(REPORTS_STATE, RUN_REPORTS, 'show-release-request-reports').executeTest(
      async (server) => {
        const runId = masters.operation(REPORTS_STATE, 'listRunReports').params['runId'];
        const { data, error } = await at(server.url, () => RUN_REPORTS.fetch({ path: { runId } }));
        expect(error).toBeUndefined();
        expect(Array.isArray(data?.reports)).toBe(true);
      },
    ));

  it('show-release-request-reports: the page reads a report’s payload', () =>
    given(REPORTS_STATE, RUN_REPORT, 'show-release-request-reports').executeTest(async (server) => {
      const { runId, reportId } = masters.operation(REPORTS_STATE, 'getRunReport').params;
      const { data, error } = await at(server.url, () =>
        RUN_REPORT.fetch({ path: { runId, reportId } }),
      );
      expect(error).toBeUndefined();
      expect(data?.id).toBeTruthy();
    }));
});
