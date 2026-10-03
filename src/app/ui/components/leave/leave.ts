import { Directive, effect, ElementRef, inject, input, output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** How long the leave takes. */
export const LEAVE_MS = 250;

/**
 * Lets an element leave before it is removed: when `uiLeave` turns true, the element shrinks to
 * nothing (its height, its bottom margin and its opacity go to 0 over {@link LEAVE_MS}), then
 * `left` fires and the owner drops it. The margin goes too, so the space it took closes smoothly
 * rather than with a jump at the end. `left` fires on the transition's end, or after a fallback
 * timeout if the browser sends none; at once with `prefers-reduced-motion` or off the browser.
 * When `uiLeave` turns false again before `left` (an Undo), the element is restored and `left`
 * does not fire.
 */
@Directive({ selector: '[uiLeave]' })
export class Leave {
  readonly uiLeave = input(false);
  readonly left = output<void>();

  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private started = false;
  /** Stops a running leave: `left` will not fire. */
  private cancel?: () => void;

  constructor() {
    effect(() => {
      if (this.uiLeave() && !this.started) this.start();
      else if (!this.uiLeave() && this.started) this.restore();
    });
  }

  private restore(): void {
    this.started = false;
    this.cancel?.();
    this.cancel = undefined;
    const style = this.element.style;
    for (const name of ['max-height', 'overflow', 'transition', 'margin-bottom', 'opacity']) {
      style.removeProperty(name);
    }
  }

  private start(): void {
    this.started = true;
    const reduced =
      !this.browser || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.left.emit();
      return;
    }
    const style = this.element.style;
    style.maxHeight = `${this.element.offsetHeight}px`;
    style.overflow = 'hidden';
    style.transition = `max-height ${LEAVE_MS}ms ease-out, margin ${LEAVE_MS}ms ease-out, opacity ${LEAVE_MS}ms ease-out`;
    // Read the layout, so the start values above take effect before the end values below.
    void this.element.offsetHeight;
    style.maxHeight = '0px';
    style.marginBottom = '0px';
    style.opacity = '0';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.element.removeEventListener('transitionend', onEnd);
      this.left.emit();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === this.element && event.propertyName === 'max-height') finish();
    };
    this.element.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, LEAVE_MS + 150);
    this.cancel = () => {
      done = true;
      clearTimeout(timer);
      this.element.removeEventListener('transitionend', onEnd);
    };
  }
}
