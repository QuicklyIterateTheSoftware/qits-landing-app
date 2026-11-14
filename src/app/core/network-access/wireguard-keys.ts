import { InjectionToken } from '@angular/core';

/**
 * A WireGuard keypair, each half as `wg` prints it: 44 characters of base64 over 32 bytes.
 * Add device (qits-2262) sends only `publicKey`; `privateKey` stays in the page's memory.
 */
export interface WireGuardKeyPair {
  readonly publicKey: string;
  readonly privateKey: string;
}

/** Makes a new keypair; rejects where the browser cannot (no X25519 in its WebCrypto). */
export type WireGuardKeyMaker = () => Promise<WireGuardKeyPair>;

/**
 * How Add device makes a device's keys (qits-2262): the browser's WebCrypto by default
 * (`webCryptoKeys`). Specs and screenshot specs provide a fixed pair instead, so what they draw
 * (the QR code above all) is the same on every run.
 */
export const WIREGUARD_KEYS = new InjectionToken<WireGuardKeyMaker>('WIREGUARD_KEYS', {
  providedIn: 'root',
  factory: () => webCryptoKeys,
});

/** The placeholder the service writes where a config's private key goes. */
export const PRIVATE_KEY_PLACEHOLDER = '<PRIVATE_KEY>';

/**
 * A new X25519 keypair from WebCrypto (`generateKey({ name: 'X25519' })`): the public key is the
 * 32-byte `raw` export, the private key the JWK's `d` (RFC 8037: the 32-byte private scalar), each
 * as base64. Nothing leaves the browser here.
 */
export async function webCryptoKeys(): Promise<WireGuardKeyPair> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('This browser has no WebCrypto.');
  const pair = (await subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const { d } = await subtle.exportKey('jwk', pair.privateKey);
  const privateKey = d ? fromBase64Url(d) : new Uint8Array();
  if (publicKey.length !== 32 || privateKey.length !== 32) {
    throw new Error('WebCrypto made an X25519 key that is not 32 bytes.');
  }
  return { publicKey: toBase64(publicKey), privateKey: toBase64(privateKey) };
}

/** `config` with every {@link PRIVATE_KEY_PLACEHOLDER} replaced by `privateKey`. */
export function withPrivateKey(config: string, privateKey: string): string {
  return config.split(PRIVATE_KEY_PLACEHOLDER).join(privateKey);
}

/** Standard base64 (with padding), as `wg` prints a key. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The bytes of base64url text (a JWK member), padded or not. */
function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
