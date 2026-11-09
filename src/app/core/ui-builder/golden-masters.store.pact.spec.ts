import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, type NonJsonResponse } from '@qits/angular/testing';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { literalDocsPaths } from './docs-paths';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { GET_DOCS_FILE } from './entity-map.consumes';
import { contractsFileOf } from './golden-masters.store';

/**
 * qits-landing-app's pact with qits-artifacts-service, the call popover's part (qits-1999):
 * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with `entity-map.store.pact.spec.ts`
 * and `routes-bundle.store.pact.spec.ts`. This spec owns `getDocsFile`'s interaction for
 * `show-ui-builder-call-details` alone.
 *
 * The popover reads two files of a contracts site, `golden-masters/index.json` and one recorded
 * response. Both are `getDocsFile`: a file as published, so the interaction binds its status and
 * media type (`NonJsonResponse`), never a field. A path from a provider state matches any path, so
 * qits-artifacts' recording of `a published contracts bundle with an entity map` answers it; its
 * example body is that state's recorded file.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-artifacts-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const SLUG: InteractionSlug = 'show-ui-builder-call-details';
const OPERATIONS: readonly OwnedOperation[] = [
  { operationId: 'getDocsFile', interactions: [SLUG] },
];

const given = (operationId: string, consumes: readonly string[], response?: NonJsonResponse) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state: CONTRACTS,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: SLUG },
    consumes,
    response,
  });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(artifactsClient),
    ],
  });
  artifactsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

const params = (operationId: string) => masters.operation(CONTRACTS, operationId).params;

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

let dir = '';
let pact: PactV4;

describe('qits-landing-app → qits-artifacts-service pact: call details', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-call-details-pact-'));
    pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
  });

  afterAll(() => {
    artifactsClient.setConfig({ baseUrl: '' });
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

  it('show-ui-builder-call-details: reads a file of the contracts site’s version', () =>
    given('getDocsFile', GET_DOCS_FILE, {
      contentType: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(masters.body(CONTRACTS, 'getDocsFile'))),
    }).executeTest(async (server) => {
      const file = await at(server.url, () =>
        contractsFileOf(
          {
            site: params('getDocsFile')['site'],
            version: params('getDocsFile')['version'],
            repository: 'qits-projects-service',
          },
          'golden-masters/index.json',
        ),
      );
      expect(file).toEqual(masters.body(CONTRACTS, 'getDocsFile'));
    }));
});
