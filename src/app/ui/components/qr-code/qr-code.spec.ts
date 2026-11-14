import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QrCode, qrDrawing } from './qr-code';

@Component({
  imports: [QrCode],
  template: `<ui-qr-code [text]="text" label="A config" />`,
})
class Host {
  text = '[Interface]\nAddress = 100.96.0.10/32\n';
}

describe('QrCode', () => {
  it('draws the text as an SVG image of dark modules inside a four-module quiet zone', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('A config');
    const drawing = qrDrawing(fixture.componentInstance.text);
    // 38 bytes need version 3 at error correction M: 29 modules, plus 4 on each side.
    expect(drawing?.size).toBe(37);
    expect(svg?.getAttribute('viewBox')).toBe('0 0 37 37');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(drawing?.path);
    // The top-left finder's corner module is dark, just inside the quiet zone.
    expect(drawing?.path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });

  it('draws a WireGuard config with its key, and nothing for a text no version holds', () => {
    const config = `[Interface]\nPrivateKey = ${'A'.repeat(43)}=\n`.repeat(4);
    expect(qrDrawing(config)?.size).toBeGreaterThan(37);
    expect(qrDrawing('x'.repeat(4000))).toBeUndefined();
  });
});
