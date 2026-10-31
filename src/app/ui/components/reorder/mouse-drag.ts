import {
  type DragContext,
  type DragEngine,
  type DragOutcome,
  Marker,
  pinnedHeight,
  placeholder,
} from './drag';
import { edgeScrollStep, gapY, overTarget, slotAt, targetIndex } from './slots';

/** How far a mouse press must move before it is a drag, in px; anything shorter is a click. */
export const MOUSE_DRAG_THRESHOLD_PX = 4;

/** The clone's opacity while the pointer is outside the list, where a release cancels. */
const OUTSIDE_OPACITY = '0.5';

/**
 * The fine-pointer drag (`pointerType` `mouse` or `pen`), started by the reorder list for one
 * press on a handle. It captures the pointer, and once the pointer has moved
 * {@link MOUSE_DRAG_THRESHOLD_PX} it dims the item into a placeholder, puts a clone of it in
 * `document.body` that follows the pointer vertically (keeping where it was grabbed; it stays in
 * the item's column), and draws the marker in the gap the clone's middle is nearest. Over the
 * item's own gaps the marker hides and the placeholder is the preview; outside the list (its rect,
 * widened by `TARGET_SLACK_PX`) the marker hides and the clone fades. Near the top or bottom of
 * the visible area the document scrolls (`edgeScrollStep`). Everything is measured again each
 * animation frame from `getBoundingClientRect()`, so the wheel keeps working.
 *
 * It ends once: a release over a new slot is a drop, a release over its own slot or outside the
 * list a cancel; Escape, `pointercancel`, a lost capture, the window losing focus or `cancel()`
 * cancel too. A press released before the threshold is a click and is left alone. Every end
 * removes the clone, the marker, the placeholder style, the listeners and the capture before
 * `end` hears the outcome. There are no animations, so reduced motion needs no branch.
 */
export class MouseDrag implements DragEngine {
  private readonly window: Window;
  private marker?: Marker;
  private clone?: HTMLElement;
  private restoreItem?: () => void;
  private frame = 0;
  private dragging = false;
  private ended = false;
  private x: number;
  private y: number;
  /** Where in the item it was grabbed, from its top. */
  private grabY = 0;
  /** The top of the visible area, below what is pinned there. */
  private visibleTop = 0;

  constructor(
    private readonly context: DragContext,
    private readonly press: PointerEvent,
  ) {
    this.window = context.document.defaultView ?? window;
    this.x = press.clientX;
    this.y = press.clientY;
    press.preventDefault();
    context.handle.setPointerCapture?.(press.pointerId);
    const handle = context.handle;
    handle.addEventListener('pointermove', this.onMove);
    handle.addEventListener('pointerup', this.onUp);
    handle.addEventListener('pointercancel', this.onAbort);
    handle.addEventListener('lostpointercapture', this.onAbort);
    context.document.addEventListener('keydown', this.onKey, true);
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
      if (moved < MOUSE_DRAG_THRESHOLD_PX) return;
      this.start();
    }
  };

  private readonly onUp = (event: PointerEvent) => {
    if (event.pointerId !== this.press.pointerId) return;
    this.x = event.clientX;
    this.y = event.clientY;
    if (!this.dragging) {
      this.finish({ kind: 'click' });
      return;
    }
    const to = this.update();
    // The click that follows the release belongs to the drag, not to the handle.
    this.swallowClick();
    this.finish(to === undefined ? { kind: 'cancel' } : { kind: 'drop', to });
  };

  private readonly onAbort = () => this.cancel();

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };

  private start(): void {
    this.dragging = true;
    const { document, item } = this.context;
    const rect = item.getBoundingClientRect();
    this.grabY = this.press.clientY - rect.top;
    this.visibleTop = pinnedHeight(document, this.context.list);

    const clone = item.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-reorder-clone', '');
    clone.classList.add('shadow-lg');
    // A see-through item would show the rows it passes over through its clone.
    if (this.window.getComputedStyle(item).backgroundColor === 'rgba(0, 0, 0, 0)') {
      clone.classList.add('bg-white');
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
    document.body.append(clone);
    this.clone = clone;
    this.marker = new Marker(document);
    this.restoreItem = placeholder(item);
    this.context.started();
    this.update();
    this.frame = this.window.requestAnimationFrame(this.onFrame);
  }

  private readonly onFrame = () => {
    if (this.ended) return;
    this.update();
    const step = edgeScrollStep(
      this.y,
      this.visibleTop,
      this.context.document.documentElement.clientHeight,
    );
    if (step) this.window.scrollBy(0, step);
    this.frame = this.window.requestAnimationFrame(this.onFrame);
  };

  /**
   * Moves the clone and the marker to the pointer, and returns the index a release would drop the
   * item at, or `undefined` when a release would cancel.
   */
  private update(): number | undefined {
    const { item, list, from } = this.context;
    const clone = this.clone!;
    const itemRect = item.getBoundingClientRect();
    const top = this.y - this.grabY;
    clone.style.left = `${itemRect.left}px`;
    clone.style.top = `${top}px`;
    const listRect = list.getBoundingClientRect();
    if (!overTarget(listRect, this.x, this.y)) {
      clone.style.opacity = OUTSIDE_OPACITY;
      this.marker!.hide();
      return undefined;
    }
    clone.style.removeProperty('opacity');
    const rects = this.context.rects();
    const slot = slotAt(rects, top + itemRect.height / 2);
    const to = targetIndex(from, slot);
    if (to === from) {
      this.marker!.hide();
      return undefined;
    }
    this.marker!.show(listRect, gapY(rects, slot)!);
    return to;
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
    const { document, handle } = this.context;
    handle.removeEventListener('pointermove', this.onMove);
    handle.removeEventListener('pointerup', this.onUp);
    handle.removeEventListener('pointercancel', this.onAbort);
    handle.removeEventListener('lostpointercapture', this.onAbort);
    document.removeEventListener('keydown', this.onKey, true);
    this.window.removeEventListener('blur', this.onAbort);
    if (handle.hasPointerCapture?.(this.press.pointerId)) {
      handle.releasePointerCapture(this.press.pointerId);
    }
    this.window.cancelAnimationFrame(this.frame);
    this.clone?.remove();
    this.marker?.remove();
    this.restoreItem?.();
    this.context.end(outcome);
  }
}
