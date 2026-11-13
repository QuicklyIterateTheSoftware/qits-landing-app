import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile, type NonJsonResponse } from '@qits/angular/testing';
import { client as networkAccessClient } from '../../api/network-access/client.gen';
import { provideHeyApiClient } from '../../api/network-access/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { networkAccessGoldenMasters as masters } from '../../../testing/golden-masters';
import { AS_TEXT } from './peers';
import { NODE_LIST, PEER_CONFIG, PEER_LIST, PEER_REVOKE, PRIVATE_EDGE } from './peers.operations';

/**
 * qits-landing-app's pact with qits-network-access-service (epic qits-1977), in
 * `pacts/qits-landing-app_qits-network-access-service.json`: the Network access pane's operations
 * (`peers.operations.ts`, qits-2146), its peers, nodes and private edge, a revoke, and a device's
 * WireGuard config. The operations are the only users of the qits-network-access client, so this
 * file is the whole pact. Moved here from `peers.store.pact.spec.ts` with `PeersStore`, unchanged.
 *
 * The config is text (`text/plain`, read with `responseType: 'text'`); the recording holds it as a
 * JSON string, so its interaction binds the status and the media type, with the recorded text as
 * the example body (`NonJsonResponse`).
 *
 * Not here: the Mine filter's `getPeers?owner=me`. No recording holds that query, so it has no
 * interaction yet; `network-access.page.spec.ts` covers it.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-network-access-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const DEVICE = 'a device peer behind an announced private edge';
const NODE = 'a joined node';
const EDGE = 'an announced private edge';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-network-access-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(networkAccessClient),
    ],
  });
  networkAccessClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction for `op` in `state`, triggered by `interaction`; `op` must be `PROVIDER`'s. */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
  response?: NonJsonResponse,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: op.consumes,
    response,
  });
};

/** `state`'s param `name` for `operationId`, as the golden masters froze it. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

describe('qits-landing-app → qits-network-access-service pact: the Network access pane’s operations', () => {
  afterAll(() => {
    networkAccessClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-network-peers, show-network-nodes, show-private-edge: the pane’s reads', () => {
    given(PEER_LIST, DEVICE, 'show-network-peers');
    given(NODE_LIST, NODE, 'show-network-nodes');
    return given(PRIVATE_EDGE, EDGE, 'show-private-edge').executeTest(async (server) => {
      const [peers, nodes, edge] = await at(server.url, () =>
        Promise.all([PEER_LIST.fetch({}), NODE_LIST.fetch({}), PRIVATE_EDGE.fetch({})]),
      );
      expect((peers.data ?? []).map((peer) => [peer.kind, peer.status])).toEqual([
        ['DEVICE', 'ACTIVE'],
      ]);
      expect(nodes.data?.[0]?.peer?.id).toBe(param(NODE, 'getNodes', 'peerId'));
      expect(edge.data?.listenPort).toBeGreaterThan(0);
    });
  });

  it('revoke-network-peer: the peer comes back REVOKED', () =>
    given(PEER_REVOKE, DEVICE, 'revoke-network-peer').executeTest(async (server) => {
      const peerId = param(DEVICE, 'revokePeer', 'peerId');
      const { data } = await at(server.url, () => PEER_REVOKE.fetch({ path: { peerId } }));
      expect(data?.status).toBe('REVOKED');
    }));

  it('download-wireguard-config: the wg-quick text, private key left as a placeholder', () =>
    given(PEER_CONFIG, DEVICE, 'download-wireguard-config', {
      contentType: 'text/plain',
      body: new TextEncoder().encode(masters.body<string>(DEVICE, 'getPeerConfig')),
    }).executeTest(async (server) => {
      const peerId = param(DEVICE, 'getPeerConfig', 'peerId');
      const { data } = await at(server.url, () =>
        PEER_CONFIG.fetch({ path: { peerId }, ...AS_TEXT }),
      );
      const text = data as unknown;
      expect(typeof text).toBe('string');
      expect(text).toContain('[Interface]');
      expect(text).toContain('PrivateKey = <PRIVATE_KEY>');
    }));
});
