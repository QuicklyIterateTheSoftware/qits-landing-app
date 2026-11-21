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
import { isAnonymousVolume } from './node-volumes';
import { NODE_VOLUME_LIST } from './node-volumes.operations';

/**
 * The swarm node page's Volumes tab's part of qits-landing-app's pact with qits-system-service
 * (qits-2355, `node-volumes.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json`
 * beside the swarm's and the targets' parts (`assertPactPart`).
 *
 * The tab lists the node's volumes (`show-swarm-node-volumes`): in "a single-node swarm" (three
 * volumes: `qits-shared-m2`, in use; a runner's work volume, labelled and unused; an anonymous one,
 * unused), in "a node holding no volumes" (`[]`) and in "a swarm node this service cannot reach"
 * (a 409 `NODE_REMOTE`, binding its `code` and `message`). The recordings address the node as
 * `local`, as the state recorded it. Every row skips itself until the `@qits/system-golden-masters`
 * pin records qits-2355's states (an older pin records "a single-node swarm"'s volumes with one row
 * and no `unused`), and then the spec checks nothing of the committed file.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listNodeVolumes'];

const SWARM = 'a single-node swarm';
const NO_VOLUMES = 'a node holding no volumes';
const REMOTE = 'a swarm node this service cannot reach';

/** Whether the pin records qits-2355's volumes (its new states mark it). */
const RECORDED = isRecorded(NO_VOLUMES, 'listNodeVolumes', masters);

/** The node `state` recorded its volumes for, read off the recorded path (it has no param). */
const nodeOf = (state: string) => {
  const path: string = masters.operation(state, 'listNodeVolumes').path;
  return { path: { id: decodeURIComponent(/\/nodes\/([^/]+)\/volumes$/.exec(path)?.[1] ?? '') } };
};

/** The interaction of the tab's read in `state`, binding `consumes`. */
const given = (state: string, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: NODE_VOLUME_LIST.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-node-volumes' },
    consumes,
  });

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-node-volumes-pact-'));
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

describe('qits-landing-app → qits-system-service pact: a node’s volumes', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
    try {
      if (RECORDED) {
        assertPactPart(
          join(dir, `${CONSUMER}-${PROVIDER}.json`),
          COMMITTED,
          OPERATIONS,
          'QITS_GOLDEN_UPDATE',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('declares the provider this spec binds', () => {
    expect(NODE_VOLUME_LIST.provider).toBe(PROVIDER);
    expect(NODE_VOLUME_LIST.operationId).toBe(OPERATIONS[0]);
  });

  it.skipIf(!RECORDED)(
    'show-swarm-node-volumes: the node’s volumes, the unused and the anonymous among them',
    () =>
      given(SWARM, NODE_VOLUME_LIST.consumes).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => NODE_VOLUME_LIST.fetch(nodeOf(SWARM)));
        expect(error).toBeUndefined();
        // The recording, as the page reads it: three rows, the second and third unused, the
        // third anonymous.
        const volumes = data ?? [];
        expect(volumes).toHaveLength(3);
        expect(volumes.map((volume) => volume.unused)).toEqual([false, true, true]);
        expect(volumes.map((volume) => isAnonymousVolume(volume))).toEqual([false, false, true]);
      }),
  );

  it.skipIf(!RECORDED)('show-swarm-node-volumes: a node holding no volumes lists none', () =>
    given(NO_VOLUMES, NODE_VOLUME_LIST.consumes).executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        NODE_VOLUME_LIST.fetch(nodeOf(NO_VOLUMES)),
      );
      expect(error).toBeUndefined();
      expect(data).toEqual([]);
    }),
  );

  it.skipIf(!RECORDED)(
    'show-swarm-node-volumes: another node is a 409 NODE_REMOTE, in the service’s words',
    () =>
      given(REMOTE, NODE_VOLUME_LIST.errorConsumes).executeTest(async (server) => {
        const { data, error, response } = await at(server.url, () =>
          NODE_VOLUME_LIST.fetch(nodeOf(REMOTE)),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(409);
        expect((error as { code?: string } | undefined)?.code).toBe('NODE_REMOTE');
        expect((error as { message?: string } | undefined)?.message).toBeTruthy();
      }),
  );
});
