import {
  type DragContext,
  type DragEngine,
  type DragOutcome,
  Marker,
  placeholder,
  type VisibleArea,
  visibleArea,
} from './drag';
import { REORDER_MESSAGES } from './reorder-messages';
import { edgeScrollStep, gapY, referenceY, slotAt, type SlotRect, targetIndex } from './slots';

/** How far a touch must move before it is a drag, in px; anything shorter is a tap. */
export const TOUCH_DRAG_THRESHOLD_PX = 8;

/** How far left of where it was pressed the finger must go to arm the cancel, in px. */
export const TOUCH_CANCEL_PX = 64;

/**
 * Whether a finger at `x`, pressed at `startX`, has gone far enough left that a release cancels:
 * {@link TOUCH_CANCEL_PX} or more.
 */
export function cancelArmed(startX: number, x: number): boolean {
  return startX - x >= TOUCH_CANCEL_PX;
}

/**
 * How far past the ends of the page the items may be shifted, as the range of the overscroll (px
 * the content has moved up beyond the bottom of the page, negative beyond the top), so the line at
 * `y` (the middle of the clone's visible part, `referenceY`) can reach the first and the last
 * slot: the first item's top, or the last item's bottom, just past `y` and no further. `rects` are
 * the items' rects unshifted.
 */
export function overscrollRange(
  rects: readonly SlotRect[],
  y: number,
): { readonly min: number; readonly max: number } {
  if (rects.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(0, rects[0].top - y - 1),
    max: Math.max(0, rects[rects.length - 1].bottom - y + 1),
  };
}

/**
 * The touch drag (`pointerType` `touch`), started by the reorder list for one press on a handle.
 * It is inverted: the item does not follow the finger, the page moves under the item. It captures
 * the pointer, and once the finger has moved {@link TOUCH_DRAG_THRESHOLD_PX} it dims the item into
 * a placeholder and puts a clone of it in `document.body`, fixed where the item was on the screen;
 * the clone stays there until the end. Moving the finger down scrolls the list's scrolling box
 * down by as much (and up, up), in the next animation frame, so the rows pass under the clone: its
 * nearest scrolling ancestor, which from 768px up is the shell's `<main>`, or the document where
 * none scrolls, as below 768px (`visibleArea`; "the page" below is that box). The slot under
 * the middle of the clone's visible part (`referenceY`, taken at the pick-up: its middle unless the
 * item is taller than the visible area or partly off it) is where it lands, and the marker shows
 * its gap (hidden over the item's own slot), so the marker stays on the screen. Held near the top
 * or bottom of the visible area, the finger keeps the page scrolling (`edgeScrollStep`). Where the
 * page can scroll no further, the rest of the movement shifts the items (`translateY` on each),
 * just far enough that the first and the last slot can be reached (`overscrollRange`). Moving the
 * finger sideways means nothing, except that {@link TOUCH_CANCEL_PX} or more to the left of the
 * press arms the cancel: a veil over the clone fades it and says "Release to cancel", and the
 * marker hides, until the finger comes back.
 *
 * It ends once: a release over a new slot is a drop and leaves the page where it is; a release
 * with the cancel armed or over its own slot is a cancel, and scrolls the page back to where it
 * was at the pick-up. `pointercancel`, a lost capture, the window losing focus or `cancel()`
 * cancel the same way. A touch lifted before the threshold is a tap and is left alone. Every end
 * removes the clone, the marker, the placeholder style, the items' shift, the listeners, the
 * capture and the pending frame before `end` hears the outcome. There are no animations, so
 * reduced motion needs no branch.
 */
export class TouchDrag implements DragEngine {
  private readonly window: Window;
  private marker?: Marker;
  private clone?: HTMLElement;
  private label?: HTMLElement;
  private restoreItem?: () => void;
  private frame = 0;
  private dragging = false;
  private ended = false;
  private armed = false;
  private x: number;
  private y: number;
  /** The finger's y the scroll has been asked to follow up to. */
  private followedY: number;
  /** The scroll the finger has asked for and the next frame applies, in px (down is positive). */
  private pending = 0;
  /** The scrolling box's scroll at the pick-up, restored by a cancel. */
  private startScrollTop = 0;
  /**
   * The line the slot is read at, in viewport coordinates: the middle of the clone's visible part
   * at the pick-up (`referenceY`), fixed for the whole drag as the clone is.
   */
  private lineY = 0;
  /** The box that scrolls the list, and the part of the window it shows (`visibleArea`). */
  private area?: VisibleArea;
  /** The list's items, shifted past the ends of the page, and their own inline transforms. */
  private shifted: readonly { readonly element: HTMLElement; readonly transform: string }[] = [];
  /** How far the items are shifted up past the end of the page, in px (negative: down). */
  private overscroll = 0;

  constructor(
    private readonly context: DragContext,
    private readonly press: PointerEvent,
  ) {
    this.window = context.document.defaultView ?? window;
    this.x = press.clientX;
    this.y = press.clientY;
    this.followedY = press.clientY;
    press.preventDefault();
    try {
      context.handle.setPointerCapture?.(press.pointerId);
    } catch {
      // A synthetic press has no active pointer to capture; the handle still hears its events.
    }
    const handle = context.handle;
    handle.addEventListener('pointermove', this.onMove);
    handle.addEventListener('pointerup', this.onUp);
    handle.addEventListener('pointercancel', this.onAbort);
    handle.addEventListener('lostpointercapture', this.onAbort);
    this.window.addEventListener('blur', this.onAbort);
  }

  cancel(): void {
    this.finish(this.dragging ? { kind: 'cancel' } : { kind: 'click' });
  }

  private readonly onMove = (event: PointerEvent) => {
    if (event.pointerId !== this.press.pointerId) return;
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.dragging) {
      const moved = Math.hypot(this.x - this.press.clientX, this.y - this.press.clientY);
      if (moved < TOUCH_DRAG_THRESHOLD_PX) return;
      this.start();
    }
    this.follow();
    this.arm(cancelArmed(this.press.clientX, this.x));
  };

  private readonly onUp = (event: PointerEvent) => {
    if (event.pointerId !== this.press.pointerId) return;
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.dragging) {
      this.finish({ kind: 'click' });
      return;
    }
    this.follow();
    this.scroll();
    const to = this.target();
    // The click that follows the release belongs to the drag, not to the handle.
    this.swallowClick();
    this.finish(to === undefined ? { kind: 'cancel' } : { kind: 'drop', to });
  };

  private readonly onAbort = () => this.cancel();

  private start(): void {
    this.dragging = true;
    const { document, item } = this.context;
    const rect = item.getBoundingClientRect();
    const area = visibleArea(document, this.context.list);
    this.area = area;
    this.startScrollTop = area.pane.scrollTop;
    this.lineY = referenceY(rect.top, rect.bottom, area.top, area.bottom);
    this.shifted = this.context.items().map((element) => ({
      element,
      transform: element.style.getPropertyValue('transform'),
    }));

    const clone = item.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-reorder-clone', '');
    clone.classList.add('shadow-lg');
    // A see-through item would show the rows passing under it through its clone.
    if (this.window.getComputedStyle(item).backgroundColor === 'rgba(0, 0, 0, 0)') {
      clone.classList.add('bg-surface');
    }
    Object.assign(clone.style, {
      position: 'fixed',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      margin: '0',
      zIndex: '50',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    const label = document.createElement('div');
    label.setAttribute('data-reorder-cancel', '');
    label.className =
      'absolute inset-0 flex items-center justify-center gap-1.5 bg-surface/70 text-sm font-semibold text-fg';
    label.style.display = 'none';
    const cross = document.createElement('span');
    cross.textContent = '×';
    label.append(cross, REORDER_MESSAGES.releaseToCancel);
    clone.append(label);
    document.body.append(clone);
    this.clone = clone;
    this.label = label;
    this.marker = new Marker(document);
    this.restoreItem = placeholder(item);
    this.context.started();
    this.draw();
    this.frame = this.window.requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = () => {
    if (this.ended) return;
    this.pending += edgeScrollStep(this.y, this.area!.top, this.area!.bottom);
    this.scroll();
    this.draw();
    this.frame = this.window.requestAnimationFrame(this.onFrame);
  };

  /** Adds the finger's vertical travel since the last move to the scroll the next frame applies. */
  private follow(): void {
    this.pending += this.y - this.followedY;
    this.followedY = this.y;
  }

  /**
   * Applies the pending scroll in whole px, keeping the fraction for later: the browser rounds
   * every scroll, and rounding each small step would drift from the finger. A movement back first
   * takes back the items' shift, then scrolls the page; what the page cannot take shifts
   * the items, within `overscrollRange`.
   */
  private scroll(): void {
    let step = Math.round(this.pending);
    this.pending -= step;
    if (!step) return;
    if (this.overscroll && Math.sign(step) !== Math.sign(this.overscroll)) {
      const back = Math.sign(step) * Math.min(Math.abs(step), Math.abs(this.overscroll));
      this.shift(this.overscroll + back);
      step -= back;
    }
    if (step) {
      const pane = this.area!.pane;
      const before = pane.scrollTop;
      pane.scrollBy({ top: step, behavior: 'instant' });
      step -= pane.scrollTop - before;
    }
    if (step) {
      const unshifted = this.context.rects().map((rect) => ({
        top: rect.top + this.overscroll,
        bottom: rect.bottom + this.overscroll,
      }));
      const { min, max } = overscrollRange(unshifted, this.lineY);
      this.shift(Math.max(min, Math.min(max, this.overscroll + step)));
    }
  }

  /** Shifts the items up by `overscroll` px (down when negative) over their own transforms. */
  private shift(overscroll: number): void {
    if (overscroll === this.overscroll) return;
    this.overscroll = overscroll;
    for (const { element, transform } of this.shifted) {
      const own = transform && transform !== 'none' ? `${transform} ` : '';
      element.style.transform = overscroll ? `${own}translateY(${-overscroll}px)` : transform;
    }
  }

  /** Puts the items' own transforms back, and drops a `style` the shift alone left. */
  private unshift(): void {
    for (const { element, transform } of this.shifted) {
      if (transform) element.style.transform = transform;
      else element.style.removeProperty('transform');
      if (!element.getAttribute('style')) element.removeAttribute('style');
    }
  }

  /**
   * Draws the marker in the gap under the middle of the clone's visible part; hidden over its own
   * slot or armed.
   */
  private draw(): void {
    const rects = this.context.rects();
    const slot = slotAt(rects, this.lineY);
    if (this.armed || targetIndex(this.context.from, slot) === this.context.from) {
      this.marker!.hide();
      return;
    }
    this.marker!.show(this.context.list.getBoundingClientRect(), gapY(rects, slot)!);
  }

  /**
   * Shows the cancel label over the clone while `armed`, and hides it when not. The label is a
   * pale veil across the whole clone, so it fades the clone's content; the clone itself stays
   * opaque, or the rows moving under it would show through it.
   */
  private arm(armed: boolean): void {
    if (armed === this.armed) return;
    this.armed = armed;
    this.label!.style.display = armed ? '' : 'none';
    this.draw();
  }

  /** The index a release now drops the item at, or `undefined` when a release cancels. */
  private target(): number | undefined {
    if (this.armed) return undefined;
    const { from } = this.context;
    const to = targetIndex(from, slotAt(this.context.rects(), this.lineY));
    return to === from ? undefined : to;
  }

  private swallowClick(): void {
    const swallow = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    this.window.addEventListener('click', swallow, true);
    setTimeout(() => this.window.removeEventListener('click', swallow, true));
  }

  private finish(outcome: DragOutcome): void {
    if (this.ended) return;
    this.ended = true;
    const { handle } = this.context;
    handle.removeEventListener('pointermove', this.onMove);
    handle.removeEventListener('pointerup', this.onUp);
    handle.removeEventListener('pointercancel', this.onAbort);
    handle.removeEventListener('lostpointercapture', this.onAbort);
    this.window.removeEventListener('blur', this.onAbort);
    if (handle.hasPointerCapture?.(this.press.pointerId)) {
      handle.releasePointerCapture(this.press.pointerId);
    }
    this.window.cancelAnimationFrame(this.frame);
    this.clone?.remove();
    this.marker?.remove();
    this.unshift();
    this.restoreItem?.();
    const pane = this.area?.pane;
    if (outcome.kind === 'cancel' && pane && pane.scrollTop !== this.startScrollTop) {
      pane.scrollTo({ left: pane.scrollLeft, top: this.startScrollTop, behavior: 'instant' });
    }
    this.context.end(outcome);
  }
}
