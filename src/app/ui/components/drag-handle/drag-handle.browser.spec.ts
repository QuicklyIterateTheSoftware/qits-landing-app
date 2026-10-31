import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { REORDER } from '$ui/components/reorder/reorder';
import { DragHandle } from './drag-handle';

/** Two items of a reorder list, each with its handle on its corner: inline data, it is UI. */
@Component({
  imports: [DragHandle, REORDER],
  host: { class: 'block w-80 p-6' },
  template: `
    <div uiReorderList class="flex flex-col gap-8">
      @for (id of ids; track id) {
        <div
          uiReorderItem
          class="relative rounded-l-md border border-gray-200 bg-white p-3 text-sm"
        >
          {{ id }}
          <ui-drag-handle [label]="'Move ' + id" />
        </div>
      }
    </div>
  `,
})
class Items {
  readonly ids = ['qits-12', 'qits-13'];
}

describe('DragHandle (screenshots)', () => {
  it('draws the grip on its item’s bottom-right corner, centred on it', async () => {
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const item = element.querySelector('[uiReorderItem]')!.getBoundingClientRect();
    const button = element.querySelector('ui-drag-handle button')!.getBoundingClientRect();
    // Centred on the corner, within the item's 1px border.
    expect(Math.abs(button.left + button.width / 2 - item.right)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(button.top + button.height / 2 - item.bottom)).toBeLessThanOrEqual(1.5);
    expect(getComputedStyle(element.querySelector('ui-drag-handle button')!).cursor).toBe('grab');
    await expect.element(page.elementLocator(element)).toMatchScreenshot('drag-handle');
  });
});
