import { networkAccessGoldenMaster } from '../../../testing/golden-masters';
import {
  ADD_FORBIDDEN,
  addDeviceRefusal,
  asCreatedPeer,
  filterPeers,
  isDeviceName,
  networkAccessRefusal,
  REVOKE_FORBIDDEN,
} from './peers';
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

describe('addDeviceRefusal', () => {
  it('says the service’s own words on a 400 or a 409, and the credential’s refusal on a 403', () => {
    const name =
      'name must be a DNS label: lower-case letters, digits and inner dashes, at most 63';
    expect(addDeviceRefusal({ message: name }, 400)).toBe(name);
    expect(addDeviceRefusal({ message: 'you already have an active peer of this name' }, 409)).toBe(
      'you already have an active peer of this name',
    );
    expect(addDeviceRefusal({ message: 'the tunnel address pool is exhausted' }, 409)).toBe(
      'the tunnel address pool is exhausted',
    );
    expect(addDeviceRefusal(undefined, 403)).toBe(ADD_FORBIDDEN);
    // Not the private edge's 409, which is the config read's.
    expect(addDeviceRefusal(undefined, 409)).toBe('The service refused it (HTTP 409).');
    expect(addDeviceRefusal(undefined, undefined)).toBe('The service is unreachable.');
  });
});

describe('isDeviceName', () => {
  it('takes a DNS label, as the service does', () => {
    for (const name of ['laptop', 'a', 'my-phone-2', 'x'.repeat(63)]) {
      expect(isDeviceName(name)).toBe(true);
    }
    for (const name of ['', 'Laptop', '-phone', 'phone-', 'my phone', 'my_phone', 'x'.repeat(64)]) {
      expect(isDeviceName(name)).toBe(false);
    }
  });
});

describe('asCreatedPeer', () => {
  it('reads the new peer, and nothing without an id', () => {
    const created = networkAccessGoldenMaster<object>('an announced private edge', 'createPeer');
    expect(asCreatedPeer(created)?.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(asCreatedPeer({})).toBeUndefined();
    expect(asCreatedPeer('laptop')).toBeUndefined();
    expect(asCreatedPeer(null)).toBeUndefined();
  });
});
