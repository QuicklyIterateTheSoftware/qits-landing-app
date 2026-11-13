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
import { WRAPPER_CLOSINGS } from './wrapper-closings.operations';

/**
 * `WRAPPER_CLOSINGS`' part of qits-landing-app's pact with qits-projects-service (qits-1873;
 * `wrapper-closings.operations.ts`, qits-2146): the `listWrapperClosings` interaction, in the same
 * file as the other operations' (`pacts/qits-landing-app_qits-projects-service.json`, see
 * `src/testing/pact-part.ts`). It moved here from `wrapper-closings.store.pact.spec.ts` with
 * `WrapperClosingsStore` (qits-2146), unchanged: the same description, state, request and bound
 * fields.
 *
 * The test runs the operation's own `fetch` for the state's project, as a VERIFIED ticket's line
 * reads it, against a pact mock server
 * answering with qits-projects' golden master "a project with VERIFIED tickets in every wrapper
 * verdict" (one ticket per verdict, and the two CLOSING ways: LIVE and the empty wrapper's
 * withdrawal), binding only the fields in `LIST_WRAPPER_CLOSINGS` (the operation's `consumes`).
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listWrapperClosings'];
const STATE = 'a project with VERIFIED tickets in every wrapper verdict';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-wrapper-closings-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-projects-service pact: the wrapper closings operation', () => {
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

  it('declares the provider this spec binds', () => {
    expect(WRAPPER_CLOSINGS.provider).toBe(PROVIDER);
  });

  it('show-wrapper-closings: the store loads where each VERIFIED ticket’s closing stands', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: WRAPPER_CLOSINGS.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-wrapper-closings' },
      consumes: WRAPPER_CLOSINGS.consumes,
    }).executeTest(async (server) => {
      const projectId = masters.operation(STATE, 'listWrapperClosings').params['projectId'];
      const { data, error } = await at(server.url, () =>
        WRAPPER_CLOSINGS.fetch({ path: { project: projectId } }),
      );
      expect(error).toBeUndefined();
      // The rows differ in which fields are null (a NO_REQUEST row names no request), so the pact
      // binds them as one variant per shape and the mock answers one row of each; what each
      // verdict says is the line's spec.
      expect(data?.closings?.length).toBeGreaterThan(0);
    }));
});
