import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { commands, page, userEvent } from 'vitest/browser';
import { REORDER, type ReorderMove } from './reorder';

/**
 * A plain list of fixed-height rows, each with its handle: inline data, it is UI. The row at
 * `tall`, if set, is taller than the viewport, with its handle at its bottom. With `pane` the list
 * sits in a 300px box that scrolls it on its own, 100px below the top of the window, as the
 * shell's `<main>` from 768px up, with room below it for the document to scroll as well.
 */
@Component({
  imports: [REORDER],
  styles: [
    '.tall { height: 1200px; align-items: flex-end; padding-bottom: 8px; }',
    ':host(.pane) { height: 300px; margin: 100px 0 1000px; overflow-y: auto; }',
  ],
  host: { class: 'block p-4', '[class.pane]': 'pane()', '[style.padding-left.px]': 'indent()' },
  template: `
    <ul
      uiReorderList
      reorderLabel="Rows"
      class="m-0 w-80 list-none p-0"
      (reordered)="moves.push($event)"
      (reorderCancelled)="cancels = cancels + 1"
    >
      @for (row of rows(); track row; let i = $index) {
        <li
          uiReorderItem
          class="flex h-10 items-center gap-2 border-b border-line bg-surface px-2"
          [class.tall]="i === tall()"
        >
          <button
            type="button"
            uiReorderHandle
            class="h-6 w-6 rounded bg-surface-active text-xs"
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
  /** Room left of the list, in px, for a finger to drag left into; the default padding if unset. */
  readonly indent = input<number | null>(null);
  /** The index of the row taller than the viewport; none if unset. */
  readonly tall = input<number | null>(null);
  /** Whether the list scrolls in a pane of its own instead of the document. */
  readonly pane = input(false);
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
  async function render(
    count = 12,
    indent: number | null = null,
    tall: number | null = null,
    pane = false,
  ) {
    const fixture = TestBed.createComponent(Rows);
    fixture.componentRef.setInput('pane', pane);
    fixture.componentRef.setInput('count', count);
    fixture.componentRef.setInput('indent', indent);
    fixture.componentRef.setInput('tall', tall);
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

  /** Puts a finger on the handle of row `index` and slides it `dy` down, past the threshold. */
  async function fingerPickUp(view: Awaited<ReturnType<typeof render>>, index: number, dy = 12) {
    const start = view.centre(view.handles[index]);
    await commands.touch('down', start.x, start.y);
    await commands.touch('move', start.x, start.y + dy, 3);
    await frames();
    return start;
  }

  const clone = () => document.querySelector<HTMLElement>('[data-reorder-clone]');

  afterEach(async () => {
    await commands.mouse('up', 0, 0);
    await commands.touch('cancel', 0, 0);
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
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-drag', { kind: 'DATA' });
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
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-outside', { kind: 'DATA' });
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
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-keyboard', { kind: 'DATA' });
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

  it('scrolls the list’s own pane, not the document, near the pane’s bottom edge', async () => {
    const view = await render(30, null, null, true);
    const pane = view.root;
    expect(pane.scrollHeight).toBeGreaterThan(pane.clientHeight);
    expect(document.documentElement.scrollHeight).toBeGreaterThan(window.innerHeight);
    const bottom = pane.getBoundingClientRect().bottom;
    // Inside the pane's bottom band, far above the window's.
    expect(bottom).toBeLessThan(window.innerHeight - 100);
    const start = await pickUp(view, 0);
    await commands.mouse('move', start.x, bottom - 4, 5);
    await frames(10);
    expect(pane.scrollTop).toBeGreaterThan(0);
    expect(window.scrollY).toBe(0);
    await userEvent.keyboard('{Escape}');
    view.expectClean();
  });

  it('scrolls the list’s own pane under a finger, and a cancel puts the pane back', async () => {
    const view = await render(30, null, null, true);
    const pane = view.root;
    const start = await fingerPickUp(view, 2);
    await commands.touch('move', start.x, start.y + 100, 5);
    await frames();
    expect(pane.scrollTop).toBe(100);
    expect(window.scrollY).toBe(0);
    await commands.touch('cancel', 0, 0);
    expect(view.host.cancels).toBe(1);
    expect(pane.scrollTop).toBe(0);
    expect(window.scrollY).toBe(0);
    view.expectClean();
  });

  it('scrolls the page under a fixed clone as a finger drags, and drops where the clone is', async () => {
    const view = await render(30);
    const at = view.items[2].getBoundingClientRect();
    const start = await fingerPickUp(view, 2);
    expect(clone()).not.toBeNull();
    expect(view.items[2].style.opacity).toBe('0.4');
    await commands.touch('move', start.x + 20, start.y + 150, 5);
    await frames();
    // Down by 150 scrolls down by 150; the clone stays where the row was picked up.
    expect(window.scrollY).toBe(150);
    expect(clone()!.style.top).toBe(`${at.top}px`);
    expect(clone()!.getBoundingClientRect().top).toBe(at.top);
    await commands.touch('up', start.x + 20, start.y + 150);
    // Row 3's middle has moved 150px past rows 4 to 6, so it lands below row 6.
    expect(view.host.moves).toEqual([{ from: 2, to: 5 }]);
    expect(view.host.cancels).toBe(0);
    expect(view.root.querySelector('[aria-live]')?.textContent).toBe(
      'Dropped Row 3 at position 6 of 30.',
    );
    expect(window.scrollY).toBe(150);
    view.expectClean();
  });

  it('arms the cancel when a finger drags left, and a release then puts the page back', async () => {
    const view = await render(30, 160);
    const start = await fingerPickUp(view, 2, 100);
    await frames();
    expect(window.scrollY).toBe(100);
    const label = () => clone()!.querySelector<HTMLElement>('[data-reorder-cancel]')!;
    await commands.touch('move', start.x - 80, start.y + 100, 4);
    await frames();
    expect(label().style.display).toBe('');
    await expect.element(page.getByText('Release to cancel')).toBeVisible();
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-touch-cancel', { kind: 'DATA' });
    await commands.touch('move', start.x - 20, start.y + 100, 2);
    expect(label().style.display).toBe('none');
    await commands.touch('move', start.x - 70, start.y + 100, 2);
    await commands.touch('up', start.x - 70, start.y + 100);
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(1);
    expect(view.root.querySelector('[aria-live]')?.textContent).toBe('Move of Row 3 cancelled.');
    expect(window.scrollY).toBe(0);
    view.expectClean();
  });

  it('cancels and puts the page back when the browser abandons the touch', async () => {
    const view = await render(30);
    await fingerPickUp(view, 4, 80);
    await frames();
    expect(window.scrollY).toBe(80);
    await commands.touch('cancel', 0, 0);
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(1);
    expect(window.scrollY).toBe(0);
    view.expectClean();
  });

  it('leaves a tap on the handle alone', async () => {
    const view = await render(30);
    const start = view.centre(view.handles[1]);
    let clicks = 0;
    view.handles[1].addEventListener('click', () => clicks++);
    await commands.touch('down', start.x, start.y);
    await commands.touch('up', start.x + 3, start.y + 3);
    await frames();
    expect(clone()).toBeNull();
    expect(view.host.moves).toEqual([]);
    expect(view.host.cancels).toBe(0);
    expect(clicks).toBe(1);
    view.expectClean();
  });

  it('draws the marker in the gap under the clone, and hides it over the own slot', async () => {
    const view = await render(30);
    window.scrollTo(0, 200);
    const marker = () => document.querySelector<HTMLElement>('[data-reorder-marker]')!;
    const start = await fingerPickUp(view, 8, 0);
    await commands.touch('move', start.x, start.y - 100, 4);
    await frames();
    expect(window.scrollY).toBe(100);
    // Row 9's middle is now over row 6's: it would land between rows 6 and 7.
    expect(marker().style.display).not.toBe('none');
    expect(marker().style.top).toBe(`${view.gap(6) - 1}px`);
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-touch-marker', { kind: 'DATA' });
    await commands.touch('move', start.x, start.y, 4);
    await frames();
    expect(window.scrollY).toBe(200);
    expect(marker().style.display).toBe('none');
    await commands.touch('move', start.x, start.y - 100, 4);
    await commands.touch('up', start.x, start.y - 100);
    expect(view.host.moves).toEqual([{ from: 8, to: 6 }]);
    expect(window.scrollY).toBe(100);
    view.expectClean();
  });

  it('shifts the rows down at the top of the page, so the first slot is reached', async () => {
    const view = await render(30);
    const at = view.items[5].getBoundingClientRect();
    const middle = at.top + at.height / 2;
    const start = await fingerPickUp(view, 5, 0);
    // Into the top edge band: the page cannot scroll up, so the rows come down instead.
    await commands.touch('move', start.x, 20, 6);
    await frames(30);
    expect(window.scrollY).toBe(0);
    // Just far enough: the first row's top 1px below the clone's middle.
    expect(view.items[0].getBoundingClientRect().top).toBe(middle + 1);
    expect(view.items[29].style.transform).toBe(view.items[0].style.transform);
    const marker = document.querySelector<HTMLElement>('[data-reorder-marker]')!;
    expect(marker.style.top).toBe(`${middle}px`);
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot('reorder-touch-end', { kind: 'DATA' });
    await commands.touch('up', start.x, 20);
    expect(view.host.moves).toEqual([{ from: 5, to: 0 }]);
    view.expectClean();
  });

  it('keeps scrolling while a finger is held near the bottom edge, then shifts to the last slot', async () => {
    const view = await render(30);
    const at = view.items[12].getBoundingClientRect();
    const middle = at.top + at.height / 2;
    const start = await fingerPickUp(view, 12, 0);
    await commands.touch('move', start.x, window.innerHeight - 10, 4);
    await frames(5);
    const scrolled = window.scrollY;
    await frames(5);
    expect(window.scrollY).toBeGreaterThan(scrolled);
    await frames(120);
    expect(window.scrollY).toBe(document.documentElement.scrollHeight - window.innerHeight);
    expect(view.items[29].getBoundingClientRect().bottom).toBe(middle - 1);
    await commands.touch('up', start.x, window.innerHeight - 10);
    expect(view.host.moves).toEqual([{ from: 12, to: 29 }]);
    view.expectClean();
  });
  /**
   * Renders 30 rows with row 6 taller than the viewport, and scrolls until its bottom, where its
   * handle is, sits 100px below the top of the viewport: its middle is far above the screen.
   */
  async function renderTall() {
    const view = await render(30, null, 5);
    const rect = view.items[5].getBoundingClientRect();
    expect(rect.height).toBeGreaterThan(window.innerHeight);
    window.scrollTo(0, window.scrollY + rect.bottom - 100);
    const at = view.items[5].getBoundingClientRect();
    expect(at.bottom).toBe(100);
    expect(at.top + at.height / 2).toBeLessThan(0);
    return view;
  }

  /** The marker is drawn, and on the screen. */
  function expectMarkerOnScreen() {
    const marker = document.querySelector<HTMLElement>('[data-reorder-marker]')!;
    expect(marker.style.display).not.toBe('none');
    const top = marker.getBoundingClientRect().top;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(window.innerHeight);
  }

  it('reads the slot of a row taller than the viewport at the middle of its visible part (touch)', async () => {
    const view = await renderTall();
    const scrolled = window.scrollY;
    const start = await fingerPickUp(view, 5, 0);
    // The visible part is 0–100, so the line is at 50; 90 down carries it past row 7's middle.
    await commands.touch('move', start.x, start.y + 90, 4);
    await frames();
    expect(window.scrollY).toBe(scrolled + 90);
    expectMarkerOnScreen();
    expect(document.querySelector<HTMLElement>('[data-reorder-marker]')!.style.top).toBe(
      `${view.gap(7) - 1}px`,
    );
    await commands.touch('up', start.x, start.y + 90);
    expect(view.host.moves).toEqual([{ from: 5, to: 6 }]);
    view.expectClean();
  });

  it('reads the slot of a row taller than the viewport at the middle of its visible part (mouse)', async () => {
    const view = await renderTall();
    const start = await pickUp(view, 5);
    // The clone's visible part becomes 0–280, so the line is at 140: between rows 7 and 8.
    await commands.mouse('move', start.x, start.y + 180, 5);
    await frames();
    expectMarkerOnScreen();
    expect(document.querySelector<HTMLElement>('[data-reorder-marker]')!.style.top).toBe(
      `${view.gap(7) - 1}px`,
    );
    await commands.mouse('up', start.x, start.y + 180);
    expect(view.host.moves).toEqual([{ from: 5, to: 6 }]);
    view.expectClean();
  });
});
