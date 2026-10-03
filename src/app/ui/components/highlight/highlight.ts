import { DestroyRef, Directive, ElementRef, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/** How long a highlight stays at full strength, then how long it fades. */
export const HIGHLIGHT_MS = 2_000;
export const HIGHLIGHT_FADE_MS = 1_000;

/** The attribute that marks an element as one that can be highlighted: a card, a lane, a row. */
export const HIGHLIGHT_TARGET = 'data-highlight-target';

/**
 * The outline of a highlighted element. An outline takes no room, so nothing moves. Written out
 * in full so that Tailwind finds the classes.
 */
const STRONG = ['outline-3', 'outline-offset-2', 'outline-ocean-deep-600'];
const FADING = ['outline-transparent', 'transition-[outline-color]', 'duration-1000'];

/**
 * Highlights one element at a time: a strong outline for {@link HIGHLIGHT_MS}, then fading out
 * over {@link HIGHLIGHT_FADE_MS}. Highlighting another element takes it off the previous one.
 */
@Injectable({ providedIn: 'root' })
export class Highlighter {
  private current?: HTMLElement;
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** The element highlighted now, if any. */
  get highlighted(): HTMLElement | undefined {
    return this.current;
  }

  highlight(element: HTMLElement): void {
    this.clear();
    this.current = element;
    element.classList.add(...STRONG);
    this.timers = [
      setTimeout(() => {
        element.classList.remove('outline-ocean-deep-600');
        element.classList.add(...FADING);
      }, HIGHLIGHT_MS),
      setTimeout(() => this.clear(), HIGHLIGHT_MS + HIGHLIGHT_FADE_MS),
    ];
  }

  clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.current?.classList.remove(...STRONG, ...FADING);
    this.current = undefined;
  }
}

/** The highlight target (`data-highlight-target`) that holds `node`, within `root`. */
export function targetOf(node: Node | null, root: HTMLElement): HTMLElement | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const target = element?.closest<HTMLElement>(`[${HIGHLIGHT_TARGET}]`);
  return target && root.contains(target) ? target : undefined;
}

/**
 * On a board or a list: highlights the card, row or lane the text selection starts in, as it
 * moves (`selectionchange`), so a find-in-page step shows which card it is in. One listener per
 * board or list, not per card. To drop the behaviour, remove the directive from its hosts.
 */
@Directive({ selector: '[uiSelectionHighlight]' })
export class SelectionHighlight {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly highlighter = inject(Highlighter);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const document = inject(DOCUMENT);
    const listener = () => this.select(document.getSelection()?.anchorNode ?? null);
    document.addEventListener('selectionchange', listener);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('selectionchange', listener));
  }

  /** Highlights the target that holds `node`, unless it is the one highlighted already. */
  select(node: Node | null): void {
    const target = targetOf(node, this.host);
    if (target && target !== this.highlighter.highlighted) this.highlighter.highlight(target);
  }
}
