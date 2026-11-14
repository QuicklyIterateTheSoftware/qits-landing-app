import { TestBed } from '@angular/core/testing';
import {
  PRIVATE_KEY_PLACEHOLDER,
  toBase64,
  webCryptoKeys,
  WIREGUARD_KEYS,
  withPrivateKey,
} from './wireguard-keys';

/** 44 characters of base64 over 32 bytes, as `wg genkey` prints a key. */
const KEY = /^[A-Za-z0-9+/]{43}=$/;

describe('webCryptoKeys', () => {
  it('makes an X25519 pair, each half 32 bytes of base64, and a new one each time', async () => {
    const first = await webCryptoKeys();
    const second = await webCryptoKeys();
    expect(first.publicKey).toMatch(KEY);
    expect(first.privateKey).toMatch(KEY);
    expect(first.privateKey).not.toBe(first.publicKey);
    expect(second.privateKey).not.toBe(first.privateKey);
  });

  it('is what WIREGUARD_KEYS gives by default', () => {
    expect(TestBed.inject(WIREGUARD_KEYS)).toBe(webCryptoKeys);
  });

  it('rejects where the browser has no X25519', async () => {
    const generateKey = vi
      .spyOn(crypto.subtle, 'generateKey')
      .mockRejectedValue(new DOMException('Unrecognized name.', 'NotSupportedError'));
    try {
      await expect(webCryptoKeys()).rejects.toThrow();
    } finally {
      generateKey.mockRestore();
    }
  });
});

describe('withPrivateKey', () => {
  it('puts the key where the placeholder was, and leaves the rest as it is', () => {
    const config = `[Interface]\nPrivateKey = ${PRIVATE_KEY_PLACEHOLDER}\nAddress = 100.96.0.10/32\n`;
    expect(withPrivateKey(config, 'secret=')).toBe(
      '[Interface]\nPrivateKey = secret=\nAddress = 100.96.0.10/32\n',
    );
  });
});

describe('toBase64', () => {
  it('pads as wg prints a key', () => {
    expect(toBase64(new Uint8Array(32))).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  });
});
