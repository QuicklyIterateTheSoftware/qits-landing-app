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
import { ciGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { ACTIVE_RUNS, REPOSITORY_RUNS, RUN_REPORT, RUN_REPORTS, RUNS_LIMIT } from './ci.operations';

/**
 * qits-landing-app's pact with qits-ci-service: `pacts/qits-landing-app_qits-ci-service.json`,
 * against qits-ci's golden masters (`@qits/ci-golden-masters`), for the operations of
 * `ci.operations.ts`: a repository's newest runs (the release request page), every queued or
 * running run (the lightning menu), and a run's reports and one report's payload
 * (`app-run-reports`).
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
const OPERATIONS = ['listRuns', 'listActiveRuns', 'listRunReports', 'getRunReport'];

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
      consumes: op.consumes,
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
