import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as networkAccessClient } from '../../api/network-access/client.gen';
import { provideHeyApiClient } from '../../api/network-access/client/client.gen';
import { networkAccessGoldenMaster } from '../../../testing/golden-masters';
import type { PeerEntry } from './peers.consumes';
import { filterPeers, PeersStore, REVOKE_FORBIDDEN } from './peers.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const DEVICE = 'a device peer behind an announced private edge';
const NODE = 'a joined node';
const EDGE = 'an announced private edge';

const PEERS = '/network-access/api/peers';
const MINE = '/network-access/api/peers?owner=me';
const NODES = '/network-access/api/nodes';
const PRIVATE_EDGE = '/network-access/api/private-edge';
const PEER_ID = '00000000-0000-4000-8000-000000000001';

describe('PeersStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(networkAccessClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(edge: 'recorded' | 404 = 'recorded') {
    const store = TestBed.inject(PeersStore);
    const loading = store.load();
    await settle();
    http.expectOne(PEERS).flush(networkAccessGoldenMaster(DEVICE, 'getPeers'));
    http.expectOne(NODES).flush(networkAccessGoldenMaster(NODE, 'getNodes'));
    const request = http.expectOne(PRIVATE_EDGE);
    if (edge === 404) request.flush(null, { status: 404, statusText: 'Not Found' });
    else request.flush(networkAccessGoldenMaster(EDGE, 'getPrivateEdge'));
    await loading;
    return store;
  }

  it('reads the peers, the nodes and the private edge once', async () => {
    const store = await loaded();
    expect(store.all()).toEqual({
      status: 'loaded',
      peers: networkAccessGoldenMaster(DEVICE, 'getPeers'),
    });
    expect(store.nodes()[0].name).toBe('node-a');
    expect(store.edge().status).toBe('loaded');
    void store.load();
    await settle();
    http.expectNone(PEERS);
    http.expectNone(NODES);
    http.expectNone(PRIVATE_EDGE);
  });

  it('takes the private edge’s 404 for none announced, and keeps it', async () => {
    const store = await loaded(404);
    expect(store.edge()).toEqual({ status: 'none' });
    void store.load();
    await settle();
    http.expectNone(PRIVATE_EDGE);
  });

  it('is an error when the peers cannot be read, and reads them again on the next load', async () => {
    const store = TestBed.inject(PeersStore);
    let loading = store.load();
    await settle();
    http.expectOne(PEERS).flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(NODES).flush(networkAccessGoldenMaster(NODE, 'getNodes'));
    http.expectOne(PRIVATE_EDGE).flush(null, { status: 500, statusText: 'Server Error' });
    await loading;
    expect(store.all().status).toBe('error');
    expect(store.edge().status).toBe('error');

    loading = store.load();
    await settle();
    http.expectOne(PEERS).flush(networkAccessGoldenMaster(DEVICE, 'getPeers'));
    http.expectOne(PRIVATE_EDGE).flush(networkAccessGoldenMaster(EDGE, 'getPrivateEdge'));
    http.expectNone(NODES);
    await loading;
    expect(store.all().status).toBe('loaded');
  });

  it('reads the visitor’s own peers with owner=me, once', async () => {
    const store = TestBed.inject(PeersStore);
    const loading = store.loadMine();
    await settle();
    // The recorded list (no recording holds the `owner=me` query; the service answers the same
    // shape, narrowed to the caller).
    http.expectOne(MINE).flush(networkAccessGoldenMaster(DEVICE, 'getPeers'));
    await loading;
    expect(store.mine().status).toBe('loaded');
    expect(store.mine().peers).toHaveLength(1);
    void store.loadMine();
    await settle();
    http.expectNone(MINE);
  });

  it('revokes a peer', async () => {
    const store = TestBed.inject(PeersStore);
    const revoking = store.revoke(PEER_ID);
    await settle();
    const request = http.expectOne(`${PEERS}/${PEER_ID}/revoke`);
    expect(request.request.method).toBe('POST');
    request.flush(networkAccessGoldenMaster(DEVICE, 'revokePeer'));
    expect(await revoking).toEqual({ ok: true });
  });

  it('says the credential may not revoke peers on a 403', async () => {
    const store = TestBed.inject(PeersStore);
    const revoking = store.revoke(PEER_ID);
    await settle();
    http
      .expectOne(`${PEERS}/${PEER_ID}/revoke`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    expect(await revoking).toEqual({ ok: false, refusal: REVOKE_FORBIDDEN });
  });

  it('reads a peer’s config as text, with the private key placeholder', async () => {
    const store = TestBed.inject(PeersStore);
    const reading = store.config(PEER_ID);
    await settle();
    const request = http.expectOne(`${PEERS}/${PEER_ID}/config`);
    expect(request.request.responseType).toBe('text');
    request.flush(networkAccessGoldenMaster<string>(DEVICE, 'getPeerConfig'));
    const outcome = await reading;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toContain('PrivateKey = <PRIVATE_KEY>');
  });

  it('says why a config could not be read', async () => {
    const store = TestBed.inject(PeersStore);
    const reading = store.config(PEER_ID);
    await settle();
    http
      .expectOne(`${PEERS}/${PEER_ID}/config`)
      .flush(null, { status: 409, statusText: 'Conflict' });
    expect(await reading).toEqual({
      ok: false,
      refusal: 'No private edge has announced itself yet.',
    });
  });
});

describe('filterPeers', () => {
  // The recorded device, and the recorded node's peer, each as recorded; the revoked one is the
  // revoke's recorded answer.
  const device = networkAccessGoldenMaster<PeerEntry>(DEVICE, 'getPeer');
  const node = networkAccessGoldenMaster<{ peer: PeerEntry }>(NODE, 'getNode').peer;
  const revoked = networkAccessGoldenMaster<PeerEntry>(DEVICE, 'revokePeer');
  const peers = [device, node, revoked];

  it('narrows by kind and by status', () => {
    expect(filterPeers(peers, 'all')).toEqual(peers);
    expect(filterPeers(peers, 'devices')).toEqual([device, revoked]);
    expect(filterPeers(peers, 'nodes')).toEqual([node]);
    expect(filterPeers(peers, 'revoked')).toEqual([revoked]);
  });
});
