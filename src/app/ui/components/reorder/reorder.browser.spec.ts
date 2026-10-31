import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { REORDER, type ReorderMove } from './reorder';

/** A plain list of fixed-height rows, each with its handle: inline data, it is UI. */
@Component({
  imports: [REORDER],
  host: { class: 'block p-4' },
  template: `
    <ul
      uiReorderList
      reorderLabel="Rows"
      class="m-0 w-80 list-none p-0"
      (reordered)="moves.push($event)"
      (reorderCancelled)="cancels = cancels + 1"
    >
      @for (row of rows(); track row) {
        <li
          uiReorderItem
          class="flex h-10 items-center gap-2 border-b border-gray-200 bg-white px-2"
        >
          <button
            type="button"
            uiReorderHandle
            class="h-6 w-6 rounded bg-gray-200 text-xs"
            [attr.aria-label]="'Move ' + row"
          >
            ≡
          </button>
          <span data-body>{{ row }}</span>
        </li>
      }
    </ul>
  `,
})
class Rows {
  readonly count = input(12);
  readonly moves: ReorderMove[] = [];
  cancels = 0;
  rows() {
    return Array.from({ length: this.count() }, (_, i) => `Row ${i + 1}`);
  }
}

/** Waits for `n` animation frames, so the drag has drawn its clone and marker. */
async function frames(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((done) => requestAnimationFrame(done));
}

describe('Reorder (browser)', () => {
  async function render(count = 12) {
    const fixture = TestBed.createComponent(Rows);
    fixture.componentRef.setInput('count', count);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const handles = [...root.querySelectorAll<HTMLElement>('[uiReorderHandle]')];
    const items = [...root.querySelectorAll<HTMLElement>('[uiReorderItem]')];
    const centre = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    /** The y of the gap between items `index - 1` and `index`. */
    const gap = (index: number) => items[index].getBoundingClientRect().top;
    const bodyChildren = document.body.childElementCount;
    return {
      fixture,
      host: fixture.componentInstance,
      root,
      handles,
      items,
      centre,
      gap,
      /** Nothing of the drag is left: no clone, no marker, no placeholder, no body style. */
      expectClean() {
        expect(document.body.childElementCount).toBe(bodyChildren);
        expect(document.querySelector('[data-reorder-clone], [data-reorder-marker]')).toBeNull();
        expect(items.every((item) => !item.getAttribute('style'))).toBe(true);
        expect(document.body.getAttribute('style')).toBeNull();
      },
    };
  }

  /** Presses the handle of row `index` and moves the pointer past the threshold. */
  async function pickUp(view: Awaited<ReturnType<typeof render>>, index: number) {
    const start = view.centre(view.handles[index]);
    await commands.mouse('down', start.x, start.y);
    await commands.mouse('move', start.x, start.y + 6, 3);
    await frames();
    return start;
  }

  afterEach(async () => {
    await commands.mouse('up', 0, 0);
    window.scrollTo(0, 0);
  });

  it('drags row 2 between rows 6 and 7, and reports the move', async () => {
    const view = await render();
    const start = await pickUp(view, 1);
    await commands.mouse('move', start.x, view.gap(6), 5);
    await frames();
    expect(document.querySelector('[data-reorder-clone]')).not.toBeNull();
    expect(view.items[1].style.opacity).toBe('0.4');
    expect((document.querySelector('[data-reorder-marker]') as HTMLElement).style.display).not.toBe(
      'none',
    );
    await expect.element(page.elementLocator(document.body)).toMatchScreenshot('reorder-drag');
    await commands.mouse('up', start.x, view.gap(6));
    expect(view.host.moves).toEqual([{ from: 1, to: 5 }]);
    expect(view.host.cancels).toBe(0);
    expect(view.root.querySelector('[aria-live]')?.textContent).toBe(
      'Dropped Row 2 at position 6 of 12.',
    );
    view.expectClean();
  });

  it('cancels a drag taken out and back to where it started', async () => {
    const view = await render();
    const start = await pickUp(view, 3);
    await commands.mouse('move', start.x, view.gap(8), 5);
    await frames();
    await commands.mouse('move', start.x, start.y, 5);
    await frames();
    expect((document.querySelector('[data-reorder-marker]') as HTMLElement).style.display).toBe(
      'none',
    );
    await commands.mouse('up', start.x, start.y);
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(1);
    view.expectClean();
  });

  it('dims the clone outside the list, and cancels a release there', async () => {
    const view = await render();
    const start = await pickUp(view, 2);
    const outside = view.root.querySelector('ul')!.getBoundingClientRect().right + 120;
    await commands.mouse('move', outside, view.gap(5), 5);
    await frames();
    expect((document.querySelector('[data-reorder-clone]') as HTMLElement).style.opacity).toBe(
      '0.5',
    );
    await expect.element(page.elementLocator(document.body)).toMatchScreenshot('reorder-outside');
    await commands.mouse('up', outside, view.gap(5));
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(1);
    expect(view.root.querySelector('[aria-live]')?.textContent).toBe('Move of Row 3 cancelled.');
    void start;
    view.expectClean();
  });

  it('cancels with Escape mid-drag', async () => {
    const view = await render();
    const start = await pickUp(view, 0);
    await commands.mouse('move', start.x, view.gap(4), 5);
    await frames();
    await userEvent.keyboard('{Escape}');
    expect(view.host.cancels).toBe(1);
    view.expectClean();
    await commands.mouse('up', start.x, view.gap(4));
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(1);
  });

  it('starts no drag from a press on the row outside its handle', async () => {
    const view = await render();
    const body = view.centre(view.root.querySelectorAll('[data-body]')[1]);
    await commands.mouse('down', body.x, body.y);
    await commands.mouse('move', body.x, view.gap(6), 5);
    await frames();
    expect(document.querySelector('[data-reorder-clone]')).toBeNull();
    await commands.mouse('up', body.x, view.gap(6));
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(0);
    view.expectClean();
  });

  it('picks up, moves and drops from the keyboard', async () => {
    const view = await render();
    view.handles[1].focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const marker = document.querySelector('[data-reorder-marker]') as HTMLElement;
    expect(marker.style.top).toBe(
      `${(view.gap(4) + view.items[3].getBoundingClientRect().bottom) / 2 - 1}px`,
    );
    await expect.element(page.elementLocator(document.body)).toMatchScreenshot('reorder-keyboard');
    await userEvent.keyboard('[Space]');
    expect(view.host.moves).toEqual([{ from: 1, to: 3 }]);
    view.expectClean();
  });

  it('scrolls the document while the pointer is held near the bottom edge', async () => {
    const view = await render(30);
    expect(document.documentElement.scrollHeight).toBeGreaterThan(window.innerHeight);
    const start = await pickUp(view, 0);
    await commands.mouse('move', start.x, window.innerHeight - 4, 5);
    await frames(10);
    expect(window.scrollY).toBeGreaterThan(0);
    await userEvent.keyboard('{Escape}');
    view.expectClean();
  });
});
