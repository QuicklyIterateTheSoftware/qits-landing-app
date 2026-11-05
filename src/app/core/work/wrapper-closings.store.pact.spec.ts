import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { LIST_WRAPPER_CLOSINGS } from './work.consumes';
import { WrapperClosingsStore } from './wrapper-closings.store';

/**
 * `WrapperClosingsStore`'s part of qits-landing-app's pact with qits-projects-service (qits-1873):
 * the `listWrapperClosings` interaction, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * The test drives `load(projectId)`, as a VERIFIED ticket's line does, against a pact mock server
 * answering with qits-projects' golden master "a project with VERIFIED tickets in every wrapper
 * verdict" (one ticket per verdict, and the two CLOSING ways: LIVE and the empty wrapper's
 * withdrawal), binding only the fields in `LIST_WRAPPER_CLOSINGS`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listWrapperClosings'];
const STATE = 'a project with VERIFIED tickets in every wrapper verdict';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-wrapper-closings-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store whose client talks to the mock server through a real HttpClient. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(WrapperClosingsStore);
}

describe('qits-landing-app → qits-projects-service pact: wrapper closings', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
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

  it('show-wrapper-closings: the store loads where each VERIFIED ticket’s closing stands', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'listWrapperClosings',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-wrapper-closings' },
      consumes: LIST_WRAPPER_CLOSINGS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = masters.operation(STATE, 'listWrapperClosings').params['projectId'];
      await store.load(projectId);
      const list = store.byProject()[projectId];
      expect(list?.status).toBe('loaded');
      // The rows differ in which fields are null (a NO_REQUEST row names no request), so the pact
      // binds them as one variant per shape and the mock answers one row of each; what each
      // verdict says is the line's spec.
      expect(list?.closings.length).toBeGreaterThan(0);
    }));
});
