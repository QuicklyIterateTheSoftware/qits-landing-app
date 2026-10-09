import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as ciClient } from '../../api/ci/client.gen';
import { provideHeyApiClient } from '../../api/ci/client/client.gen';
import { addGoldenInteraction, goldenMasters, type GoldenMasters } from '@qits/angular/testing';
import { assertPactPart } from '../../../testing/pact-part';
import { GET_RUN_REPORT, LIST_RUN_REPORTS } from './ci-reports.consumes';
import { CiReportsStore, reportKey } from './ci-reports.store';

/**
 * `CiReportsStore`'s part of qits-landing-app's pact with qits-ci-service
 * (`pacts/qits-landing-app_qits-ci-service.json`).
 *
 * TODO(qits-112): skipped. qits-ci-service publishes no golden masters yet; it needs the
 * operationIds `listRunReports` (`GET /ci/api/runs/{runId}/reports`) and `getRunReport`
 * (`GET /ci/api/runs/{runId}/reports/{reportId}`), and the state "a run with reports: failing
 * tests and coverage" (a test-results report with a failure, a coverage report with a diff, and
 * one report of another kind). Then add the package and drop the skip.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-ci-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const STATE = 'a run with reports: failing tests and coverage';
const OPERATIONS = ['listRunReports', 'getRunReport'];

describe.skip('qits-landing-app → qits-ci-service pact: run reports', () => {
  let masters: GoldenMasters;
  let dir = '';
  let pact: PactV4;

  beforeAll(() => {
    masters = goldenMasters('@qits/ci-golden-masters', 'qits-ci');
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-ci-reports-pact-'));
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

  function storeAt(url: string) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(withFetch()),
        provideHeyApiClient(ciClient),
      ],
    });
    ciClient.setConfig({ baseUrl: url });
    return TestBed.inject(CiReportsStore);
  }

  const settled = async (read: () => { status: string } | undefined) => {
    for (let i = 0; i < 100 && read()?.status === 'loading'; i++) {
      await new Promise((done) => setTimeout(done, 10));
    }
    return read();
  };

  it('show-release-request-reports: the page reads a run’s reports', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listRunReports',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-release-request-reports' },
      consumes: LIST_RUN_REPORTS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const runId = masters.operation(STATE, 'listRunReports').params['runId'];
      store.loadRun(runId);
      expect((await settled(() => store.runs()[runId]))?.status).toBe('loaded');
    }));

  it('show-release-request-reports: the page reads a report’s payload', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'getRunReport',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-release-request-reports' },
      consumes: GET_RUN_REPORT,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { runId, reportId } = masters.operation(STATE, 'getRunReport').params;
      store.loadReport(runId, reportId);
      expect((await settled(() => store.reports()[reportKey(runId, reportId)]))?.status).toBe(
        'loaded',
      );
    }));
});
