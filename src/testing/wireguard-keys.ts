import type { WireGuardKeyMaker, WireGuardKeyPair } from '$core/network-access/wireguard-keys';

/**
 * A fixed WireGuard keypair for Add device's specs (qits-2262), in place of WebCrypto's new one
 * each run, so a request, a config and a QR code are the same every time. The public key is the
 * one `createPeer` was recorded with ("an announced private edge"); the private key is 32 bytes of
 * ASCII, `placeholder-private-key-for-spec`, which no real device holds.
 */
export const FIXED_WIREGUARD_KEYS: WireGuardKeyPair = {
  publicKey: 'AAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAc=',
  privateKey: 'cGxhY2Vob2xkZXItcHJpdmF0ZS1rZXktZm9yLXNwZWM=',
};

/** `WIREGUARD_KEYS` answering {@link FIXED_WIREGUARD_KEYS}. */
export const fixedWireGuardKeys: WireGuardKeyMaker = () => Promise.resolve(FIXED_WIREGUARD_KEYS);

/** `WIREGUARD_KEYS` where the browser has no X25519: WebCrypto's refusal. */
export const noX25519: WireGuardKeyMaker = () =>
  Promise.reject(new DOMException('Unrecognized name.', 'NotSupportedError'));
