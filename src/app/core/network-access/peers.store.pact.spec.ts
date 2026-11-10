import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as networkAccessClient } from '../../api/network-access/client.gen';
import { provideHeyApiClient } from '../../api/network-access/client/client.gen';
import { addGoldenInteraction, assertPactFile, type NonJsonResponse } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { networkAccessGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  GET_PEER_CONFIG,
  GET_PRIVATE_EDGE,
  LIST_NODES,
  LIST_PEERS,
  REVOKE_PEER,
} from './peers.consumes';
import { PeersStore } from './peers.store';

/**
 * qits-landing-app's pact with qits-network-access-service (epic qits-1977), in
 * `pacts/qits-landing-app_qits-network-access-service.json`.
 *
 * The store is the only user of the qits-network-access client, so this file is the whole pact:
 * the Network access pane's peers, nodes and private edge, a revoke, and a device's WireGuard
 * config. It binds only the `peers.consumes.ts` lists.
 *
 * The config is text (`text/plain`, read with `responseType: 'text'`); the recording holds it as a
 * JSON string, so its interaction binds the status and the media type, with the recorded text as
 * the example body (`NonJsonResponse`).
 *
 * Not here: the Mine filter's `getPeers?owner=me`. No recording holds that query, so it has no
 * interaction yet; `peers.store.spec.ts` covers it.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-network-access-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const DEVICE = 'a device peer behind an announced private edge';
const NODE = 'a joined node';
const EDGE = 'an announced private edge';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-network-access-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (
  interaction: InteractionSlug,
  state: string,
  operationId: string,
  consumes: readonly string[],
  response?: NonJsonResponse,
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
    response,
  });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(networkAccessClient),
    ],
  });
  networkAccessClient.setConfig({ baseUrl: url });
  return TestBed.inject(PeersStore);
}

describe('qits-landing-app → qits-network-access-service pact', () => {
  afterAll(() => {
    networkAccessClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-network-peers, show-network-nodes, show-private-edge: the pane’s reads', () => {
    given('show-network-peers', DEVICE, 'getPeers', LIST_PEERS);
    given('show-network-nodes', NODE, 'getNodes', LIST_NODES);
    return given('show-private-edge', EDGE, 'getPrivateEdge', GET_PRIVATE_EDGE).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        await store.load();
        expect(store.all().status).toBe('loaded');
        expect(store.all().peers.map((peer) => [peer.kind, peer.status])).toEqual([
          ['DEVICE', 'ACTIVE'],
        ]);
        expect(store.nodesStatus()).toBe('loaded');
        expect(store.nodes()[0].peer?.id).toBe(
          masters.operation(NODE, 'getNodes').params['peerId'],
        );
        const edge = store.edge();
        expect(edge.status).toBe('loaded');
        if (edge.status === 'loaded') expect(edge.edge.listenPort).toBeGreaterThan(0);
      },
    );
  });

  it('revoke-network-peer: the peer comes back REVOKED', () =>
    given('revoke-network-peer', DEVICE, 'revokePeer', REVOKE_PEER).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.revoke(masters.operation(DEVICE, 'revokePeer').params['peerId']);
      expect(outcome).toEqual({ ok: true });
    }));

  it('download-wireguard-config: the wg-quick text, private key left as a placeholder', () =>
    given('download-wireguard-config', DEVICE, 'getPeerConfig', GET_PEER_CONFIG, {
      contentType: 'text/plain',
      body: new TextEncoder().encode(masters.body<string>(DEVICE, 'getPeerConfig')),
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.config(
        masters.operation(DEVICE, 'getPeerConfig').params['peerId'],
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.text).toContain('[Interface]');
        expect(outcome.text).toContain('PrivateKey = <PRIVATE_KEY>');
      }
    }));
});
