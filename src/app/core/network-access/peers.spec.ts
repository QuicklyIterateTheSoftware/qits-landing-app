import { networkAccessGoldenMaster } from '../../../testing/golden-masters';
import { filterPeers, networkAccessRefusal, REVOKE_FORBIDDEN } from './peers';
import type { PeerEntry } from './peers.consumes';

const DEVICE = 'a device peer behind an announced private edge';
const NODE = 'a joined node';

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

describe('networkAccessRefusal', () => {
  it('says the credential’s refusal on a 403, else what the status means', () => {
    expect(networkAccessRefusal(undefined, 403, REVOKE_FORBIDDEN)).toBe(REVOKE_FORBIDDEN);
    expect(networkAccessRefusal(undefined, 404, REVOKE_FORBIDDEN)).toBe(
      'The peer no longer exists.',
    );
    expect(networkAccessRefusal(undefined, 409, REVOKE_FORBIDDEN)).toBe(
      'No private edge has announced itself yet.',
    );
    expect(networkAccessRefusal({ message: 'Nope.' }, 500, REVOKE_FORBIDDEN)).toBe('Nope.');
    expect(networkAccessRefusal(undefined, 500, REVOKE_FORBIDDEN)).toBe(
      'The service refused it (HTTP 500).',
    );
    expect(networkAccessRefusal(undefined, undefined, REVOKE_FORBIDDEN)).toBe(
      'The service is unreachable.',
    );
  });
});
