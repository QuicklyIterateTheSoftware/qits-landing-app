import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REORDER, type ReorderMove } from './reorder';
import { REORDER_MESSAGES } from './reorder-messages';
import { edgeScrollStep, EDGE_SCROLL_MAX_PX, gapY, slotAt, targetIndex } from './slots';

/** Rects stacked from y = 0 with the given heights and a 10px gap between them. */
function stack(...heights: number[]) {
  let top = 0;
  return heights.map((height) => {
    const rect = { top, bottom: top + height };
    top += height + 10;
    return rect;
  });
}

describe('slotAt', () => {
  const rects = stack(40, 40, 40);

  it('is slot 0 above the first item', () => {
    expect(slotAt(rects, -30)).toBe(0);
    expect(slotAt(rects, 15)).toBe(0);
  });

  it('is the gap between the two items nearest the y', () => {
    expect(slotAt(rects, 25)).toBe(1);
    expect(slotAt(rects, 45)).toBe(1);
    expect(slotAt(rects, 69)).toBe(1);
    expect(slotAt(rects, 71)).toBe(2);
  });

  it('is slot n after the last item', () => {
    expect(slotAt(rects, 125)).toBe(3);
    expect(slotAt(rects, 500)).toBe(3);
  });

  it('follows the middles of items of uneven heights', () => {
    // 0–20, 30–130, 140–150: middles at 10, 80 and 145.
    const uneven = stack(20, 100, 10);
    expect(slotAt(uneven, 11)).toBe(1);
    expect(slotAt(uneven, 79)).toBe(1);
    expect(slotAt(uneven, 81)).toBe(2);
    expect(slotAt(uneven, 146)).toBe(3);
  });

  it('has one slot in an empty list', () => {
    expect(slotAt([], 100)).toBe(0);
    expect(gapY([], 0)).toBeUndefined();
  });

  it('puts the gap halfway between its neighbours', () => {
    expect(gapY(rects, 0)).toBe(0);
    expect(gapY(rects, 1)).toBe(45);
    expect(gapY(rects, 3)).toBe(140);
  });
});

describe('targetIndex', () => {
  it('moves down: the slot less the item itself', () => {
    expect(targetIndex(1, 6)).toBe(5);
    expect(targetIndex(0, 3)).toBe(2);
  });

  it('moves up: the slot', () => {
    expect(targetIndex(4, 0)).toBe(0);
    expect(targetIndex(4, 2)).toBe(2);
  });

  it('gives no move for both of its own slots', () => {
    expect(targetIndex(2, 2)).toBe(2);
    expect(targetIndex(2, 3)).toBe(2);
  });
});

describe('edgeScrollStep', () => {
  it('scrolls only near the edges, faster with depth', () => {
    expect(edgeScrollStep(300, 0, 600)).toBe(0);
    expect(edgeScrollStep(590, 0, 600)).toBeGreaterThan(0);
    expect(edgeScrollStep(600, 0, 600)).toBe(EDGE_SCROLL_MAX_PX);
    expect(edgeScrollStep(560, 0, 600)).toBeLessThan(edgeScrollStep(590, 0, 600));
    expect(edgeScrollStep(60, 56, 600)).toBeLessThan(0);
  });
});

@Component({
  imports: [REORDER],
  template: `
    <ul
      uiReorderList
      reorderLabel="Fruit"
      [reorderDisabled]="disabled()"
      (reordered)="moves.push($event)"
      (reorderCancelled)="cancels = cancels + 1"
    >
      @for (fruit of fruits(); track fruit) {
        <li uiReorderItem>
          <button type="button" uiReorderHandle [attr.aria-label]="'Move ' + fruit">≡</button>
          <span data-body>{{ fruit }}</span>
        </li>
      }
    </ul>
  `,
})
class Fruits {
  readonly fruits = signal(['Apple', 'Banana', 'Cherry', 'Date']);
  readonly disabled = signal(false);
  readonly moves: ReorderMove[] = [];
  cancels = 0;
}

@Component({
  imports: [REORDER],
  template: `
    <ul uiReorderList reorderLabel="Groups" (reordered)="outer.push($event)">
      @for (group of groups; track group) {
        <li uiReorderItem [reorderItemLabel]="group">
          <button type="button" uiReorderHandle aria-label="Move group">≡</button>
          <ol uiReorderList reorderLabel="Children" (reordered)="inner.push($event)">
            @for (child of [1, 2, 3]; track child) {
              <li uiReorderItem>
                <button type="button" uiReorderHandle aria-label="Move child">≡</button>
                {{ group }}.{{ child }}
              </li>
            }
          </ol>
        </li>
      }
    </ul>
  `,
})
class Nested {
  readonly groups = ['A', 'B'];
  readonly outer: ReorderMove[] = [];
  readonly inner: ReorderMove[] = [];
}

function key(target: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function pointer(target: Element, type: string, init: PointerEventInit): void {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }),
  );
}

describe('Reorder directives', () => {
  function render() {
    const fixture = TestBed.createComponent(Fruits);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const handles = () => [...root.querySelectorAll<HTMLElement>('[uiReorderHandle]')];
    const items = () => [...root.querySelectorAll<HTMLElement>('[uiReorderItem]')];
    const live = () => root.querySelector('[aria-live="polite"]')?.textContent ?? '';
    return { fixture, host: fixture.componentInstance, root, handles, items, live };
  }

  afterEach(() => {
    expect(document.querySelector('[data-reorder-marker], [data-reorder-clone]')).toBeNull();
  });

  it('describes each handle by the list instructions', () => {
    const { root, handles } = render();
    const id = handles()[0].getAttribute('aria-describedby')!;
    expect(root.querySelector(`[id="${id}"]`)?.textContent).toBe(REORDER_MESSAGES.instructions);
    expect(handles()[0].getAttribute('aria-roledescription')).toBe('drag handle');
    expect(handles()[0].style.touchAction).toBe('none');
    expect(handles()[0].style.cursor).toBe('grab');
  });

  it('picks up with Space, moves with the arrows, and drops with Space', () => {
    const { host, handles, items, live } = render();
    const handle = handles()[1];
    expect(key(handle, ' ').defaultPrevented).toBe(true);
    expect(live()).toBe('Picked up Banana. Position 2 of 4 in Fruit.');
    expect(items()[1].style.opacity).toBe('0.4');
    expect(document.querySelector('[data-reorder-marker]')).not.toBeNull();
    expect(key(handle, 'ArrowDown').defaultPrevented).toBe(true);
    expect(live()).toBe('Position 3 of 4.');
    key(handle, 'ArrowDown');
    key(handle, 'ArrowDown');
    expect(live()).toBe('Position 4 of 4.');
    key(handle, ' ');
    expect(host.moves).toEqual([{ from: 1, to: 3 }]);
    expect(live()).toBe('Dropped Banana at position 4 of 4.');
    expect(items()[1].getAttribute('style')).toBeNull();
  });

  it('moves to the ends with Home and End and drops with Enter', () => {
    const { host, handles, live } = render();
    const handle = handles()[2];
    key(handle, 'Enter');
    key(handle, 'Home');
    expect(live()).toBe('Position 1 of 4.');
    key(handle, 'ArrowUp');
    expect(live()).toBe('Position 1 of 4.');
    key(handle, 'End');
    expect(live()).toBe('Position 4 of 4.');
    key(handle, 'Home');
    key(handle, 'Enter');
    expect(host.moves).toEqual([{ from: 2, to: 0 }]);
  });

  it('cancels a drop where the item already was', () => {
    const { host, handles, live } = render();
    const handle = handles()[0];
    key(handle, ' ');
    key(handle, 'ArrowDown');
    key(handle, 'ArrowUp');
    key(handle, ' ');
    expect(host.moves).toEqual([]);
    expect(host.cancels).toBe(1);
    expect(live()).toBe('Move of Apple cancelled.');
  });

  it('cancels with Escape', () => {
    const { host, handles, items } = render();
    key(handles()[3], ' ');
    key(handles()[3], 'ArrowUp');
    expect(key(handles()[3], 'Escape').defaultPrevented).toBe(true);
    expect(host.cancels).toBe(1);
    expect(host.moves).toEqual([]);
    expect(items()[3].getAttribute('style')).toBeNull();
  });

  it('cancels with Tab, and when focus leaves the handle', () => {
    const { host, handles } = render();
    key(handles()[0], ' ');
    expect(key(handles()[0], 'Tab').defaultPrevented).toBe(false);
    expect(host.cancels).toBe(1);
    key(handles()[1], ' ');
    handles()[1].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(host.cancels).toBe(2);
  });

  it('ignores the arrows on a handle that has not picked up its item', () => {
    const { host, handles, live } = render();
    expect(key(handles()[0], 'ArrowDown').defaultPrevented).toBe(false);
    expect(live()).toBe('');
    expect(host.moves).toEqual([]);
  });

  it('uses the item label in announcements when one is given', () => {
    const fixture = TestBed.createComponent(Nested);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const outerHandle = root.querySelector<HTMLElement>('[aria-label="Move group"]')!;
    key(outerHandle, ' ');
    expect(root.querySelector('ul > [aria-live]')?.textContent).toBe(
      'Picked up A. Position 1 of 2 in Groups.',
    );
    key(outerHandle, 'Escape');
  });

  it('a disabled list ignores its handles', () => {
    const { fixture, host, handles, items, live } = render();
    host.disabled.set(true);
    fixture.detectChanges();
    expect(key(handles()[0], ' ').defaultPrevented).toBe(false);
    key(handles()[0], 'ArrowDown');
    key(handles()[0], ' ');
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 5, clientY: 5 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 5, clientY: 50 });
    expect(document.querySelector('[data-reorder-clone]')).toBeNull();
    pointer(handles()[0], 'pointerup', { pointerType: 'mouse', clientX: 5, clientY: 50 });
    expect(items()[0].getAttribute('style')).toBeNull();
    expect(live()).toBe('');
    expect(host.moves).toEqual([]);
    expect(host.cancels).toBe(0);
    expect(handles()[0].style.cursor).toBe('');
  });

  it('a nested list moves only its own items', () => {
    const fixture = TestBed.createComponent(Nested);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const child = root.querySelectorAll<HTMLElement>('[aria-label="Move child"]')[4];
    key(child, ' ');
    expect(root.querySelectorAll('ol')[1].querySelector('[aria-live]')?.textContent).toBe(
      'Picked up B.2. Position 2 of 3 in Children.',
    );
    key(child, 'ArrowDown');
    key(child, ' ');
    expect(host.inner).toEqual([{ from: 1, to: 2 }]);
    expect(host.outer).toEqual([]);
    const group = root.querySelectorAll<HTMLElement>('[aria-label="Move group"]')[1];
    key(group, ' ');
    key(group, 'Home');
    key(group, ' ');
    expect(host.outer).toEqual([{ from: 1, to: 0 }]);
    expect(host.inner).toEqual([{ from: 1, to: 2 }]);
  });

  it('a touch press on a handle starts nothing', () => {
    const { host, handles, items } = render();
    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
    });
    handles()[1].dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    pointer(handles()[1], 'pointermove', { pointerType: 'touch', clientX: 0, clientY: 80 });
    expect(document.querySelector('[data-reorder-clone]')).toBeNull();
    pointer(handles()[1], 'pointerup', { pointerType: 'touch', clientX: 0, clientY: 80 });
    expect(items()[1].getAttribute('style')).toBeNull();
    expect(host.moves).toEqual([]);
    expect(host.cancels).toBe(0);
  });

  it('a mouse press elsewhere on the item starts nothing', () => {
    const { host, root } = render();
    const body = root.querySelector('[data-body]')!;
    pointer(body, 'pointerdown', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    pointer(body, 'pointermove', { pointerType: 'mouse', clientX: 0, clientY: 80 });
    expect(document.querySelector('[data-reorder-clone]')).toBeNull();
    pointer(body, 'pointerup', { pointerType: 'mouse', clientX: 0, clientY: 80 });
    expect(host.cancels).toBe(0);
  });

  it('a mouse press shorter than the threshold is a click', () => {
    const { host, handles } = render();
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 12, clientY: 12 });
    expect(document.querySelector('[data-reorder-clone]')).toBeNull();
    pointer(handles()[0], 'pointerup', { pointerType: 'mouse', clientX: 12, clientY: 12 });
    expect(host.moves).toEqual([]);
    expect(host.cancels).toBe(0);
  });

  it('a mouse drag draws a clone, and a release outside the list cancels and cleans up', () => {
    const { host, handles, items, live } = render();
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 40 });
    expect(document.querySelector('[data-reorder-clone]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(items()[0].style.opacity).toBe('0.4');
    // jsdom lays nothing out: every rect is empty, so the pointer is outside the list.
    pointer(handles()[0], 'pointerup', { pointerType: 'mouse', clientX: 10, clientY: 40 });
    expect(host.cancels).toBe(1);
    expect(live()).toBe('Move of Apple cancelled.');
    expect(items()[0].getAttribute('style')).toBeNull();
  });

  it('Escape during a mouse drag cancels it', () => {
    const { host, handles } = render();
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 40 });
    key(document.body, 'Escape');
    expect(host.cancels).toBe(1);
  });

  it('a pointercancel during a mouse drag cancels it', () => {
    const { host, handles } = render();
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 40 });
    pointer(handles()[0], 'pointercancel', { pointerType: 'mouse' });
    expect(host.cancels).toBe(1);
  });

  it('a pointer press cancels a keyboard move', () => {
    const { host, handles } = render();
    key(handles()[0], ' ');
    pointer(handles()[2], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(host.cancels).toBe(1);
    pointer(handles()[2], 'pointerup', { pointerType: 'mouse', clientX: 10, clientY: 10 });
  });

  it('a list destroyed mid-drag leaves nothing behind', () => {
    const { fixture, handles } = render();
    pointer(handles()[0], 'pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    pointer(handles()[0], 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 40 });
    fixture.destroy();
  });
});
