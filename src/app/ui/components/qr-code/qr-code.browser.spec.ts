import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { QrCode } from './qr-code';

/** Screenshots of the QR code: a short text and a WireGuard config's length, inline data. */
@Component({
  imports: [QrCode],
  host: { class: 'flex w-[40rem] items-start gap-4 p-4' },
  template: `
    <ui-qr-code class="w-32" text="qits" />
    <ui-qr-code class="w-64" [text]="config" />
  `,
})
class Variants {
  readonly config = [
    '# qits network access: laptop, DEVICE',
    '[Interface]',
    `PrivateKey = ${'A'.repeat(43)}=`,
    'Address = 100.96.0.10/32',
    'DNS = 100.96.0.1',
    '',
    '[Peer]',
    `PublicKey = ${'B'.repeat(43)}=`,
    'Endpoint = 203.0.113.1:47812',
    'AllowedIPs = 100.96.0.1/32',
  ].join('\n');
}

describe('QrCode (screenshots)', () => {
  it('draws the variants', async () => {
    const fixture = TestBed.createComponent(Variants);
    fixture.detectChanges();
    await expect
      .element(page.elementLocator(fixture.nativeElement))
      .toMatchScreenshot('variants', { kind: 'DATA' });
  });
});
