import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { ImageDiff, type ImageDiffSide } from './image-diff';

/** A flat `width` x `height` PNG of one colour, drawn here so every run has the same bytes. */
async function png(width: number, height: number, colour: string): Promise<ImageDiffSide> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = colour;
  context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!)));
  return { status: 'loaded', blob };
}

/**
 * Screenshots of a changed image: modified (side by side, the wider one fitted to its column),
 * added (after only), and a modified one whose sides failed and is still coming.
 */
@Component({
  imports: [ImageDiff],
  host: { class: 'flex w-[44rem] flex-col gap-4 p-4' },
  template: `
    <ui-image-diff changeType="MODIFIED" [before]="small()" [after]="wide()" />
    <ui-image-diff changeType="ADDED" [after]="small()" />
    <ui-image-diff
      changeType="RENAMED"
      [before]="{ status: 'error', message: 'The image is too large to show (17 MiB).' }"
      [after]="{ status: 'loading' }"
    />
  `,
})
class Variants {
  readonly small = signal<ImageDiffSide>({ status: 'loading' });
  readonly wide = signal<ImageDiffSide>({ status: 'loading' });
}

describe('ImageDiff (screenshots)', () => {
  it('draws added, modified, failed and loading sides', async () => {
    const [small, wide] = [await png(120, 80, '#2563eb'), await png(800, 200, '#16a34a')];
    const fixture = TestBed.createComponent(Variants);
    fixture.componentInstance.small.set(small);
    fixture.componentInstance.wide.set(wide);
    // Each image's pixel size is written from its load event, after the first render; the
    // locator is made after that, as it is found by the view's text.
    fixture.autoDetectChanges();
    const element = fixture.nativeElement as HTMLElement;
    await expect.poll(() => element.textContent).toContain('800 × 200 px');
    await expect.poll(() => element.textContent?.split('120 × 80 px').length).toBe(3);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchScreenshot('variants');
  });
});
