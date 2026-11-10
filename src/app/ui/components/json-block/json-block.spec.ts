import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JsonBlock, previewOf } from './json-block';

@Component({
  imports: [JsonBlock],
  template: `<ui-json-block [json]="json" heading="Body" />`,
})
class Host {
  json = JSON.stringify({ a: 1 }, null, 2);
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('JsonBlock', () => {
  it('shows the heading and the text, and copies the whole text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('h4')?.textContent?.trim()).toBe('Body');
      expect(element.querySelector('pre.json')?.textContent).toBe('{\n  "a": 1\n}');
      element.querySelector<HTMLButtonElement>('button.copy')!.click();
      await settle();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
      expect(element.querySelector('button.copy')?.textContent?.trim()).toBe('Copied');
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('cuts a long preview', () => {
    expect(previewOf('abcdef', 3)).toBe('abc\n…');
    expect(previewOf('abc', 3)).toBe('abc');
  });
});
