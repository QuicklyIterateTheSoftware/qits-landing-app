import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as mirrorClient } from '../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../api/mirror/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { isRecorded, mirrorGoldenMasters as masters } from '../../../testing/golden-masters';
import { REPOSITORY_LIST } from './repositories.operations';

/**
 * The cache roots' part of qits-landing-app's pact with qits-mirror-service (qits-2471,
 * `repositories.operations.ts`), in `pacts/qits-landing-app_qits-mirror-service.json` — the same
 * file the upstreams' and repository packages' specs own their operations of (`assertPactPart`).
 *
 * The Mirror section's Caches page lists every cache root the mirror holds
 * (`show-mirror-repositories`): in "the default caches" (central, hub, npmjs, quay, redhat), and in
 * "a mirror holding no cache roots" (`repositories: []`, recorded from qits-mirror's qits-2471
 * release on), which skips itself on an older pin. The test runs the operation's own `fetch`; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-mirror-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listRepositories'];

const DEFAULT_CACHES = 'the default caches';
const NO_ROOTS = 'a mirror holding no cache roots';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-mirror-roots-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(mirrorClient),
    ],
  });
  mirrorClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-mirror-service pact: the cache roots', () => {
  afterAll(() => {
    mirrorClient.setConfig({ baseUrl: '' });
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
    expect(REPOSITORY_LIST.provider).toBe(PROVIDER);
  });

  it('show-mirror-repositories: the page lists every cache root', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: DEFAULT_CACHES,
      operationId: REPOSITORY_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-mirror-repositories' },
      consumes: REPOSITORY_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => REPOSITORY_LIST.fetch({}));
      expect(error).toBeUndefined();
      // The mock answers each row with the recording's first by type.
      const roots = data?.repositories ?? [];
      expect(roots.length).toBeGreaterThan(0);
      expect(roots[0].name).toBe('central');
      expect(roots[0].type).toBe('maven-proxy');
    }));

  it.skipIf(!isRecorded(NO_ROOTS, REPOSITORY_LIST.operationId, masters))(
    'show-mirror-repositories: a mirror holding no cache roots lists none',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: NO_ROOTS,
        operationId: REPOSITORY_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-mirror-repositories' },
        consumes: REPOSITORY_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => REPOSITORY_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual({ repositories: [] });
      }),
  );
});
