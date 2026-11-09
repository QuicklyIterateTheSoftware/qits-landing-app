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
  isArtifactsRecorded,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { asEntityMap } from './entity-map';
import { GET_DOCS_FILE, LIST_DOCS_SITES, LIST_DOCS_VERSIONS } from './entity-map.consumes';
import { contractsSitesOf, entityMapOf } from './entity-map.store';

/**
 * qits-landing-app's pact with qits-artifacts-service, the entity map's part (qits-1950):
 * `pacts/qits-landing-app_qits-artifacts-service.json`, shared with `routes-bundle.store.pact.spec.ts`.
 * This spec owns the docs-store operations' interactions for `show-ui-builder-entities` alone.
 *
 * Against a pact mock server answering with qits-artifacts' recording of `a published contracts
 * bundle with an entity map`: a catalog with `@routes/qits-landing` and `@contracts/qits-projects`,
 * the contracts site's versions (its newest naming `qits-projects-service`) and its
 * `entities.json`. A path from a provider state matches any path, so each test adds at most one
 * interaction with a path parameter and makes the one step of `EntityMapStore` it answers.
 * `listDocsSites` is bound by its recorded first element (the list is "at least the recorded
 * count" of that shape), so the mock server repeats that site: the provider lists sites by
 * name, and `@contracts/qits-projects` sorts before `@routes/qits-landing`, so it is the contracts
 * site the store goes on to read.
 * `getDocsFile` answers a file: its interaction binds the status and the media type
 * (`NonJsonResponse`), its example body the recorded map.
 *
 * The state is recorded from qits-1950's qits-artifacts release on; until qits-maintenance bumps
 * `@qits/artifacts-golden-masters` past it, the whole spec skips itself.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-artifacts-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const SLUG: InteractionSlug = 'show-ui-builder-entities';
const OPERATIONS: readonly OwnedOperation[] = [
  'listDocsSites',
  'listDocsVersions',
  'getDocsFile',
].map((operationId) => ({ operationId, interactions: [SLUG] }));

const RECORDED = isArtifactsRecorded(CONTRACTS, 'getDocsFile');

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

describe.skipIf(!RECORDED)('qits-landing-app → qits-artifacts-service pact: entity maps', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-artifacts-entities-pact-'));
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

  it('show-ui-builder-entities: finds each contracts site’s repository by its newest version’s metadata', () => {
    given('listDocsSites', LIST_DOCS_SITES);
    return given('listDocsVersions', LIST_DOCS_VERSIONS).executeTest(async (server) => {
      const found = await at(server.url, () => contractsSitesOf());
      // The catalog is bound by its recorded first element at the recorded length, so the mock
      // server repeats `@contracts/qits-projects`: each entry is that site, read from its versions.
      expect(found?.unreadable).toEqual([]);
      expect(found?.sites.length).toBeGreaterThan(0);
      expect(new Set(found?.sites.map((site) => JSON.stringify(site)))).toEqual(
        new Set([
          JSON.stringify({
            site: params('listDocsVersions')['site'],
            version: params('getDocsFile')['version'],
            repository: 'qits-projects-service',
          }),
        ]),
      );
    });
  });

  it('show-ui-builder-entities: reads the version’s entity map', () =>
    given('getDocsFile', GET_DOCS_FILE, {
      contentType: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(masters.body(CONTRACTS, 'getDocsFile'))),
    }).executeTest(async (server) => {
      const map = await at(server.url, () =>
        entityMapOf({
          site: params('getDocsFile')['site'],
          version: params('getDocsFile')['version'],
        }),
      );
      expect(map).not.toBeNull();
      expect(map).toEqual(asEntityMap(masters.body(CONTRACTS, 'getDocsFile')));
    }));
});
