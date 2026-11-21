import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as systemClient } from '../../api/system/client.gen';
import { provideHeyApiClient } from '../../api/system/client/client.gen';
import { addGoldenInteraction, assertPactPart, examplePath } from '@qits/angular/testing';
import { isRecorded, systemGoldenMasters as masters } from '../../../testing/golden-masters';
import { NODE_NETWORKS_REFUSAL } from './node-networks.consumes';
import { NODE_NETWORK_LIST } from './node-networks.operations';

/**
 * The node networks' part of qits-landing-app's pact with qits-system-service (qits-2354,
 * `node-networks.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the same
 * file the swarm's and the targets' pact specs own their operations of (`assertPactPart`).
 *
 * A swarm node's Networks tab lists the docker networks of the node qits-system runs on
 * (`show-swarm-node-networks`): in "a single-node swarm" (its networks, `qits-net` first), in "a
 * node listing no networks" (`[]`) and in "a swarm node this service cannot reach" (409
 * `NODE_REMOTE` with its `message`, binding both: the tab shows the message beside its note). The
 * last two skip themselves until the `@qits/system-golden-masters` pin records them. Each test runs
 * the operation's own `fetch`, addressed at the node the state recorded its read for; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listNodeNetworks'];

const SWARM = 'a single-node swarm';
const NO_NETWORKS = 'a node listing no networks';
const REMOTE = 'a swarm node this service cannot reach';

/** The node `state` recorded its read for, as the tab addresses it (`/system/api/nodes/<id>/…`). */
const nodeOf = (state: string) => {
  const path = examplePath(masters.operation(state, NODE_NETWORK_LIST.operationId));
  const id = /\/nodes\/([^/]+)\/networks$/.exec(path)?.[1] ?? '';
  return { path: { id: decodeURIComponent(id) } };
};

/** The interaction of the tab's read in `state`, binding `consumes`. */
const given = (state: string, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: NODE_NETWORK_LIST.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-node-networks' },
    consumes,
  });

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-node-networks-pact-'));
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

describe('qits-landing-app → qits-system-service pact: a node’s networks', () => {
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
    expect(NODE_NETWORK_LIST.provider).toBe(PROVIDER);
  });

  it('show-swarm-node-networks: the tab lists the node’s networks in docker’s order', () =>
    given(SWARM, NODE_NETWORK_LIST.consumes).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => NODE_NETWORK_LIST.fetch(nodeOf(SWARM)));
      expect(error).toBeUndefined();
      // The mock answers each row with the recording's first by type, as many as recorded.
      const networks = data ?? [];
      expect(networks).toHaveLength(masters.body<unknown[]>(SWARM, 'listNodeNetworks').length);
      expect(networks[0].name).toBe('qits-net');
      expect(typeof networks[0].internal).toBe('boolean');
      expect(networks[0].createdAt).toBeTruthy();
    }));

  it.skipIf(!isRecorded(NO_NETWORKS, 'listNodeNetworks', masters))(
    'show-swarm-node-networks: a node listing no networks lists none',
    () =>
      given(NO_NETWORKS, NODE_NETWORK_LIST.consumes).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          NODE_NETWORK_LIST.fetch(nodeOf(NO_NETWORKS)),
        );
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(REMOTE, 'listNodeNetworks', masters))(
    'show-swarm-node-networks: another node is refused, NODE_REMOTE',
    () =>
      given(REMOTE, NODE_NETWORKS_REFUSAL).executeTest(async (server) => {
        const { error, response } = await at(server.url, () =>
          NODE_NETWORK_LIST.fetch(nodeOf(REMOTE)),
        );
        expect(response?.status).toBe(409);
        const body = error as { code?: string; message?: string } | undefined;
        expect(body?.code).toBe('NODE_REMOTE');
        expect(body?.message).toBeTruthy();
      }),
  );
});
