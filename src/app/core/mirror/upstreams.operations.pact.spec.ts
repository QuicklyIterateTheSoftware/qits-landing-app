import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as mirrorClient } from '../../api/mirror/client.gen';
import { provideHeyApiClient } from '../../api/mirror/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { isRecorded, mirrorGoldenMasters as masters } from '../../../testing/golden-masters';
import { UPSTREAM_LIST } from './upstreams.operations';

/**
 * qits-landing-app's pact with qits-mirror-service (qits-2357, `upstreams.operations.ts`), in
 * `pacts/qits-landing-app_qits-mirror-service.json`, which this spec owns alone.
 *
 * The Mirror section's upstreams page lists the image registries the mirror fronts
 * (`show-mirror-upstreams`): in "the default caches" (docker.io, quay.io and
 * registry.access.redhat.com), and in "a mirror fronting no registries" (`upstreams: []`, recorded
 * from `@qits/mirror-golden-masters` 2026.1120.232746 on), which skips itself on an older pin. The test runs the
 * operation's own `fetch`; the interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-mirror-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const DEFAULT_CACHES = 'the default caches';
const NO_REGISTRIES = 'a mirror fronting no registries';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-mirror-pact-'));
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

describe('qits-landing-app → qits-mirror-service pact', () => {
  afterAll(() => {
    mirrorClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('declares the provider this spec binds', () => {
    expect(UPSTREAM_LIST.provider).toBe(PROVIDER);
  });

  it('show-mirror-upstreams: the page lists the registries the mirror fronts', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: DEFAULT_CACHES,
      operationId: UPSTREAM_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-mirror-upstreams' },
      consumes: UPSTREAM_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => UPSTREAM_LIST.fetch({}));
      expect(error).toBeUndefined();
      // The mock answers each row with the recording's first by type.
      const upstreams = data?.upstreams ?? [];
      expect(upstreams.length).toBeGreaterThan(0);
      expect(upstreams[0].host).toBe('docker.io');
      expect(upstreams[0].namespace).toBe('hub');
    }));

  it.skipIf(!isRecorded(NO_REGISTRIES, UPSTREAM_LIST.operationId, masters))(
    'show-mirror-upstreams: a mirror fronting no registries lists none',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: NO_REGISTRIES,
        operationId: UPSTREAM_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-mirror-upstreams' },
        consumes: UPSTREAM_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => UPSTREAM_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual({ upstreams: [] });
      }),
  );
});
