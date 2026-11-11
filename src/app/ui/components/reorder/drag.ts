/**
 * What a drag engine and the reorder list agree on, and the visuals both the engines and the
 * keyboard mode draw. The list picks an engine by the press's `pointerType` (the mouse's in
 * `mouse-drag.ts`, where the clone follows the pointer; touch's in `touch-drag.ts`, where the page
 * moves under a fixed clone), hands it a {@link DragContext} and hears the
 * outcome once through `end`. An engine never reorders anything: it measures, draws and reports.
 */

import { paneBounds, scrollPane } from '$ui/dom/scroll-pane';

/** How a gesture ended: a plain click (it never became a drag), a cancel, or a drop at `to`. */
export type DragOutcome =
  | { readonly kind: 'click' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'drop'; readonly to: number };

/** What the list gives an engine for one gesture. */
export interface DragContext {
  readonly document: Document;
  /** The list's host element. */
  readonly list: HTMLElement;
  /** The item being moved. */
  readonly item: HTMLElement;
  /** The handle that was pressed. */
  readonly handle: HTMLElement;
  /** The item's index before the move. */
  readonly from: number;
  /** The list's items' rects in index order, read now. */
  rects(): readonly DOMRect[];
  /** The list's items' elements in index order. */
  items(): readonly HTMLElement[];
  /** The press became a drag (past the engine's threshold). */
  started(): void;
  /** The gesture is over and everything it drew is gone. Called exactly once. */
  end(outcome: DragOutcome): void;
}

/** A running gesture, as the list holds it. */
export interface DragEngine {
  /** Ends the gesture now as a cancel (or as a click when it never started). */
  cancel(): void;
}

/** Starts an engine for a press already accepted by the list. */
export type DragEngineFactory = (context: DragContext, press: PointerEvent) => DragEngine;

/** The placeholder's opacity: the item stays in the flow, dimmed, while it is moved. */
export const PLACEHOLDER_OPACITY = '0.4';

/**
 * Dims `item` into the placeholder, and returns what restores it: its own inline opacity, or none.
 */
export function placeholder(item: HTMLElement): () => void {
  const before = item.style.getPropertyValue('opacity');
  item.style.opacity = PLACEHOLDER_OPACITY;
  return () => {
    if (before) item.style.opacity = before;
    else item.style.removeProperty('opacity');
    if (!item.getAttribute('style')) item.removeAttribute('style');
  };
}

/**
 * The landing marker: a 2px line across the list's width, `position: fixed` in `document.body`,
 * drawn centred on a gap's y. Hidden until shown; `remove` takes it out of the DOM.
 */
export class Marker {
  private readonly line: HTMLElement;

  constructor(document: Document) {
    this.line = document.createElement('div');
    this.line.setAttribute('aria-hidden', 'true');
    this.line.setAttribute('data-reorder-marker', '');
    this.line.className = 'pointer-events-none fixed z-50 h-0.5 rounded-full bg-ocean-deep-600';
    this.line.style.display = 'none';
    document.body.append(this.line);
  }

  /** Draws the line across `list`'s rect, centred on `y` (viewport coordinates). */
  show(list: DOMRect, y: number): void {
    const style = this.line.style;
    style.display = '';
    style.left = `${list.left}px`;
    style.width = `${list.width}px`;
    style.top = `${y - 1}px`;
  }

  hide(): void {
    this.line.style.display = 'none';
  }

  remove(): void {
    this.line.remove();
  }
}

/**
 * The height of what is pinned at the top of the box that scrolls `element` (the shell's top bar
 * below 768px, where the document scrolls, then the page's actions, `--page-actions-h`), in px, as
 * seen from `element`: `--app-pin-top`, which the shell sets to its top bar's height where the
 * document scrolls and to 0 inside its own scrolling `<main>`, plus the actions' height; both are
 * 0 where unset. A custom property reads back unresolved (`3.5rem`), so a probe measures it.
 */
export function pinnedHeight(document: Document, element: HTMLElement): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:0;height:calc(var(--app-pin-top,0px) + var(--page-actions-h,0px))';
  element.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/** Where a drag of `list`'s items scrolls, and the part of the window it shows them in. */
export interface VisibleArea {
  /** The list's nearest scrolling ancestor (`scrollPane`), or the document's root element. */
  readonly pane: HTMLElement;
  /** The top of the visible area below what is pinned there, in viewport px. */
  readonly top: number;
  /** The bottom of the visible area, in viewport px. */
  readonly bottom: number;
}

/**
 * The box a drag of `list`'s items scrolls, and the part of the window it shows them in: the
 * list's nearest scrolling ancestor, the document when there is none (below 768px the shell lets
 * the document scroll; from 768px up its `<main>` scrolls and the window never does). The area
 * runs from the pane's top (0 for the document), below what is pinned inside it
 * ({@link pinnedHeight}), to its bottom, both clipped to the window (`paneBounds`).
 */
export function visibleArea(document: Document, list: HTMLElement): VisibleArea {
  const pane = scrollPane(list);
  const { top, bottom } = paneBounds(pane);
  return { pane, top: top + pinnedHeight(document, list), bottom };
}
