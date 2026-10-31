import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageDiff, type ImageDiffSide } from './image-diff';

const blob = (name: string) => new Blob([name], { type: 'image/png' });
const loaded = (name: string): ImageDiffSide => ({ status: 'loaded', blob: blob(name) });

@Component({
  imports: [ImageDiff],
  template: `<ui-image-diff [changeType]="changeType()" [before]="before()" [after]="after()" />`,
})
class Host {
  readonly changeType = signal<string | undefined>('MODIFIED');
  readonly before = signal<ImageDiffSide>(loaded('old'));
  readonly after = signal<ImageDiffSide>(loaded('new'));
}

describe('ImageDiff', () => {
  // jsdom has no object URLs: each blob gets a numbered one, and revoking is recorded.
  const created: Blob[] = [];
  const revoked: string[] = [];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = (made: Blob | MediaSource) => `blob:${created.push(made as Blob)}`;
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  async function render(setup: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const panes = () =>
      [...element.querySelectorAll('figure')].map((figure) => ({
        label: figure.querySelector('figcaption')?.textContent?.trim(),
        src: figure.querySelector('img')?.getAttribute('src') ?? null,
        text: figure.textContent?.replace(/\s+/g, ' ').trim(),
        busy: figure.querySelector('ui-spinner')?.getAttribute('aria-busy') === 'true',
      }));
    return { fixture, element, panes };
  }

  it('shows an added image after only', async () => {
    const { panes } = await render((host) => host.changeType.set('ADDED'));
    expect(panes().map((pane) => pane.label)).toEqual(['After']);
    expect(panes()[0].src).toBe('blob:2');
  });

  it('shows a deleted image before only', async () => {
    const { panes } = await render((host) => host.changeType.set('DELETED'));
    expect(panes().map((pane) => pane.label)).toEqual(['Before']);
    expect(panes()[0].src).toBe('blob:1');
  });

  it('shows a modified image before and after, side by side on a wide screen', async () => {
    const { panes, element } = await render();
    expect(panes().map((pane) => [pane.label, pane.src])).toEqual([
      ['Before', 'blob:1'],
      ['After', 'blob:2'],
    ]);
    expect(element.querySelector('ui-image-diff > div')?.className).toContain('sm:grid-cols-2');
    const image = element.querySelector('img')!;
    expect(image.className).toContain('max-w-full');
    expect(image.getAttribute('alt')).toBe('Before the change');
  });

  it('shows a renamed, copied or type-changed image before and after', async () => {
    for (const changeType of ['RENAMED', 'COPIED', 'TYPE_CHANGED']) {
      const { panes } = await render((host) => host.changeType.set(changeType));
      expect(panes().map((pane) => pane.label)).toEqual(['Before', 'After']);
    }
  });

  it('writes an image’s pixel size beneath it once it has loaded', async () => {
    const { fixture, element, panes } = await render();
    const image = element.querySelector('img')!;
    Object.defineProperty(image, 'naturalWidth', { value: 640 });
    Object.defineProperty(image, 'naturalHeight', { value: 480 });
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(panes()[0].text).toContain('640 × 480 px');
  });

  it('says why a side failed, in words, and draws no image for it', async () => {
    const { panes } = await render((host) =>
      host.before.set({ status: 'error', message: 'The image is too large to show (17 MiB).' }),
    );
    expect(panes()[0]).toMatchObject({
      src: null,
      text: 'Before The image is too large to show (17 MiB).',
    });
    expect(panes()[1].src).toBe('blob:1');
  });

  it('says so when the browser cannot draw the bytes, instead of a broken image', async () => {
    const { fixture, element, panes } = await render();
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(panes()[0]).toMatchObject({ src: null, text: 'Before The image could not be shown.' });
  });

  it('shows the spinner while a side is coming', async () => {
    const { panes } = await render((host) => host.after.set({ status: 'loading' }));
    expect(panes()[1]).toMatchObject({ src: null, busy: true });
    expect(panes()[0].busy).toBe(false);
  });

  it('revokes a side’s URL when its bytes change and every URL when the view goes', async () => {
    const { fixture } = await render();
    fixture.componentInstance.after.set(loaded('newer'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(revoked).toEqual(['blob:2']);
    fixture.destroy();
    expect(revoked.sort()).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });
});
