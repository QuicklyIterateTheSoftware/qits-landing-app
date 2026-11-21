import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as systemClient } from '../../api/system/client.gen';
import { provideHeyApiClient } from '../../api/system/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { isRecorded, systemGoldenMasters as masters } from '../../../testing/golden-masters';
import { imageShortId, inUse } from './node-images';
import { NODE_IMAGE_LIST } from './node-images.operations';

/**
 * A swarm node's images, its part of qits-landing-app's pact with qits-system-service (qits-2353,
 * `node-images.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the file
 * the targets', swarm's, swarm service's and leases' specs own their parts of (`assertPactPart`).
 *
 * The node page's Images tab lists the node's images (`show-swarm-node-images`): in "a single-node
 * swarm" (one image, `qits-ci:3e501b6`, three containers using it, created at docker's `+0200
 * CEST`), in "a swarm node holding no images" (`[]`) and in "a swarm node this service cannot
 * reach" (a 409 `NODE_REMOTE`, binding its `code` and `message`). The last two skip themselves
 * until the `@qits/system-golden-masters` pin records them. Each test runs the operation's own
 * `fetch`, addressed by the node the recording read (`local`, or a node qits-system does not run
 * on); the interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listNodeImages'];

const SWARM = 'a single-node swarm';
const NO_IMAGES = 'a swarm node holding no images';
const REMOTE = 'a swarm node this service cannot reach';

/**
 * The node `state` read the images of, as the tab addresses it: the recorded path names it
 * literally (`/system/api/nodes/local/images`), with no `{param}` to resolve.
 */
const nodeOf = (state: string) => {
  const path = masters.operation(state, NODE_IMAGE_LIST.operationId).path;
  const id = /\/nodes\/([^/]+)\/images$/.exec(path)?.[1];
  if (!id) throw new Error(`${state} records listNodeImages at ${path}, not a node's images`);
  return { path: { id: decodeURIComponent(id) } };
};

/** The tab's interaction in `state`, binding `consumes`. */
const given = (state: string, consumes: readonly string[] = NODE_IMAGE_LIST.consumes) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: NODE_IMAGE_LIST.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-node-images' },
    consumes,
  });

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-node-images-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(systemClient),
    ],
  });
  systemClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-system-service pact: a swarm node’s images', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
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
    expect(NODE_IMAGE_LIST.provider).toBe(PROVIDER);
  });

  it('show-swarm-node-images: the tab lists the node’s images, each with its containers', () =>
    given(SWARM).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => NODE_IMAGE_LIST.fetch(nodeOf(SWARM)));
      expect(error).toBeUndefined();
      const images = data ?? [];
      expect(images).toHaveLength(1);
      expect(imageShortId(images[0].id)).toBe('14beaf669b73');
      expect(images[0].repository).toBe('registry.dev.localhost:8080/qits/qits-ci');
      expect(images[0].tag).toBe('3e501b6');
      expect(images[0].sizeBytes).toBe(325_000_000);
      expect(inUse(images[0].containers)).toBe(3);
    }));

  it.skipIf(!isRecorded(NO_IMAGES, OPERATIONS[0], masters))(
    'show-swarm-node-images: a node holding no images lists none',
    () =>
      given(NO_IMAGES).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          NODE_IMAGE_LIST.fetch(nodeOf(NO_IMAGES)),
        );
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(REMOTE, OPERATIONS[0], masters))(
    'show-swarm-node-images: a node qits-system does not run on is a 409 NODE_REMOTE',
    () =>
      given(REMOTE, NODE_IMAGE_LIST.errorConsumes).executeTest(async (server) => {
        const { data, error, response } = await at(server.url, () =>
          NODE_IMAGE_LIST.fetch(nodeOf(REMOTE)),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(409);
        expect((error as { code?: string } | undefined)?.code).toBe('NODE_REMOTE');
      }),
  );
});
