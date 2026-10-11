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
import { LIST_REPOSITORY_RUNS } from './ci-runs.consumes';
import { CiRunsStore } from './ci-runs.store';

/**
 * qits-landing-app's pact with qits-ci-service: `pacts/qits-landing-app_qits-ci-service.json`,
 * against qits-ci's golden masters (`@qits/ci-golden-masters`).
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-ci-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const STATE = 'a repository with the runs of a release request';
const OPERATIONS = ['listRuns'];

describe('qits-landing-app → qits-ci-service pact', () => {
  let dir = '';
  let pact: PactV4;

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
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listRuns',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-release-request-runs' },
      consumes: LIST_REPOSITORY_RUNS,
    }).executeTest(async (server) => {
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'server' },
          provideHttpClient(withFetch()),
          provideHeyApiClient(ciClient),
        ],
      });
      ciClient.setConfig({ baseUrl: server.url });
      const store = TestBed.inject(CiRunsStore);
      const repoId = masters.operation(STATE, 'listRuns').query['repositoryId'];
      await store.load(repoId);
      expect(store.byRepository()[repoId]?.status).toBe('loaded');
    }));
});
