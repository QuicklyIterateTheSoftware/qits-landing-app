import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as githostClient } from '../../api/githost/client.gen';
import { provideHeyApiClient } from '../../api/githost/client/client.gen';
import { addGoldenInteraction, exampleQuery } from '@qits/angular/testing';
import { assertPactPart } from '../../../testing/pact-part';
import { githostGoldenMasters as masters } from '../../../testing/golden-masters';
import { GET_RAW } from './raw-images.consumes';
import { RawImagesStore } from './raw-images.store';

/**
 * `RawImagesStore`'s part of qits-landing-app's pact with qits-githost-service (qits-734), in
 * `pacts/qits-landing-app_qits-githost-service.json` beside `loc.store.pact.spec.ts`'s.
 *
 * One interaction: an image's bytes, from qits-githost's state `a repository with an image on
 * main` (a 1x1 PNG at `docs/screenshot.png`). The answer is no JSON, so it binds the status, the
 * `Content-Type` and that the body is a PNG (`response`), never the bytes. The recording reads the
 * image at `rev=main`, so the request does too; the app itself always passes a full commit sha.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-githost-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const STATE = 'a repository with an image on main';

let dir = '';
let pact: PactV4;

function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(githostClient),
    ],
  });
  githostClient.setConfig({ baseUrl: url });
  return TestBed.inject(RawImagesStore);
}

/** Waits until the read under `key` has an answer. */
async function answered(store: InstanceType<typeof RawImagesStore>, key: string) {
  for (let i = 0; i < 100 && store.read(key)?.status === 'loading'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return store.read(key);
}

describe('qits-landing-app → qits-githost-service pact: raw images', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
    pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
  });

  afterAll(() => {
    githostClient.setConfig({ baseUrl: '' });
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        ['getRaw'],
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-changed-image: an image’s bytes at a revision', () => {
    const op = masters.operation(STATE, 'getRaw');
    // The state's own bytes, so the mock server answers with a real PNG.
    const png = Uint8Array.from(atob(op.params['body']), (c) => c.charCodeAt(0));
    return addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: STATE,
      operationId: 'getRaw',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-changed-image' },
      consumes: GET_RAW,
      response: { contentType: 'image/png', body: png },
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { rev, path } = exampleQuery(op);
      const read = await answered(store, store.image(op.params['repositoryId'], rev, path));
      expect(read?.status).toBe('loaded');
      const blob = read?.status === 'loaded' ? read.blob : undefined;
      expect(blob?.type).toMatch(/^image\/png/);
      expect(blob?.size).toBe(png.length);
    });
  });
});
