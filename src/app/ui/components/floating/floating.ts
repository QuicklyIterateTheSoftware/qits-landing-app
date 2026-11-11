import {
  afterNextRender,
  Directive,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { place, type FloatingAlign, type FloatingSide } from './placement';

/**
 * A panel that floats over the page next to its trigger: the dropdowns', the popovers' and the UI
 * builder's call panel (qits-2081).
 *
 * ```html
 * <button #trigger type="button">…</button>
 * <div [uiFloating]="trigger" [floatingActive]="open()" floatingAlign="end" [floatingGap]="4">…</div>
 * ```
 *
 * A panel `absolute` inside its host is cut off by every scroll container around it: the shell's
 * main column and the UI builder's columns scroll (`overflow-y: auto`, which makes `overflow-x`
 * auto as well), so a panel sticking out of one is clipped, and what sticks out to the left or the
 * top cannot even be scrolled to. While `floatingActive` the directive makes the panel `fixed`
 * instead, at coordinates it takes from the trigger's box, so no scroll container clips it. The
 * panel stays where it is in the DOM, a child of its host: the Tab order, a host's `contains()`
 * test of a click outside and a host's `:hover` all go on working.
 *
 * Where it goes is `place`'s: below the trigger on the `floatingAlign` side, on the other side or
 * above it where there is no room, inside the window 8px from its edges, and capped to scroll
 * within itself where it fits nowhere. It follows the trigger as the window resizes and as any
 * ancestor scrolls (a `scroll` listener in the capture phase), and as its own content grows (a
 * `ResizeObserver`). The side it took is the panel's `data-floating-side`, `below` or `above`.
 * Floating, it stacks over the shell's sticky top bar, as it may reach up to the window's top.
 *
 * It only listens while active, and only in the browser: on the server, and in the browser while
 * inactive, the panel has no inline style and the classes place it, so the server renders the same
 * markup as without it. Where `floatingMedia` is given and the window does not match it, the
 * directive leaves the panel to its classes too (a phone's sheet).
 */
/**
 * A floating panel's stacking order: over the shell's sticky top bar (`z-50`), which it may now
 * reach when it goes above its trigger or is clamped to the window's top. A host that makes a
 * stacking context of its own (`ui-popover`'s `z-20`) takes it too while its panel floats, or the
 * panel stays under the bar.
 */
export const FLOATING_Z = '60';

@Directive({
  selector: '[uiFloating]',
  exportAs: 'uiFloating',
  host: { '[attr.data-floating-side]': 'side()' },
})
export class Floating {
  /** The trigger the panel hangs from. */
  readonly uiFloating = input.required<HTMLElement>();

  /** Whether the panel is open and floats; while false the directive does nothing. */
  readonly floatingActive = input(false);

  /** The trigger's edge the panel lines up with: `start` (left) or `end` (right). */
  readonly floatingAlign = input<FloatingAlign>('start');

  /** The room between the trigger and the panel, in pixels. */
  readonly floatingGap = input(0);

  /** A media query the window has to match for the panel to float; any window unless given. */
  readonly floatingMedia = input<string | null>(null);

  /** The side of the trigger the panel is on while it floats; null while it does not. */
  readonly side = signal<FloatingSide | null>(null);

  private readonly panel = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      if (this.floatingActive()) onCleanup(this.follow(this.uiFloating()));
    });
  }

  /** Places the panel against the trigger now. */
  update(): void {
    const win = this.doc.defaultView;
    const media = this.floatingMedia();
    if (!win || !this.floatingActive() || (media && win.matchMedia?.(media).matches === false)) {
      this.release();
      return;
    }
    if (!this.panel.getClientRects().length) {
      // Not shown yet (its classes still hide it): the ResizeObserver calls again once it is.
      this.release();
      return;
    }
    const style = this.panel.style;
    // Measuring uncaps the panel, which drops its own scroll position: put it back afterwards.
    const scrolled = this.panel.scrollTop;
    // At the containing block's origin, uncapped, to measure the panel's own size and where that
    // origin is: the window, unless an ancestor is transformed or filtered.
    Object.assign(style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      right: 'auto',
      bottom: 'auto',
      marginTop: '0px',
      marginRight: '0px',
      marginBottom: '0px',
      marginLeft: '0px',
      maxHeight: '',
      overflowY: '',
      zIndex: FLOATING_Z,
    });
    const origin = this.panel.getBoundingClientRect();
    const root = this.doc.documentElement;
    const at = place(
      this.uiFloating().getBoundingClientRect(),
      origin,
      { width: root.clientWidth, height: root.clientHeight },
      { align: this.floatingAlign(), gap: this.floatingGap() },
    );
    style.top = `${at.top - origin.top}px`;
    style.left = `${at.left - origin.left}px`;
    if (at.maxHeight !== null) {
      style.maxHeight = `${at.maxHeight}px`;
      style.overflowY = 'auto';
      this.panel.scrollTop = scrolled;
    }
    this.side.set(at.side);
  }

  /** Listens while the panel is open; the returned function stops it and releases the panel. */
  private follow(trigger: HTMLElement): () => void {
    const win = this.doc.defaultView!;
    let frame = 0;
    // One placement a frame, whatever asked for it. A ResizeObserver's callback that resized what
    // it observes would loop; the next frame does not.
    const schedule = () => {
      frame ||= win.requestAnimationFrame(() => {
        frame = 0;
        this.update();
      });
    };
    // A scroll inside the panel (its own list, or the panel capped) does not move it.
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && this.panel.contains(event.target))) schedule();
    };
    win.addEventListener('resize', schedule);
    win.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(this.panel);
    observer?.observe(trigger);
    const first = afterNextRender(() => this.update(), { injector: this.injector });
    return () => {
      win.removeEventListener('resize', schedule);
      win.removeEventListener('scroll', onScroll, { capture: true });
      observer?.disconnect();
      first.destroy();
      if (frame) win.cancelAnimationFrame(frame);
      this.release();
    };
  }

  /** Back to the classes' placement. */
  private release(): void {
    for (const property of [
      'position',
      'top',
      'left',
      'right',
      'bottom',
      'margin',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'max-height',
      'overflow-y',
      'z-index',
    ]) {
      this.panel.style.removeProperty(property);
    }
    if (!this.panel.getAttribute('style')) this.panel.removeAttribute('style');
    this.side.set(null);
  }
}
