import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { ReorderList } from './reorder-list';

/** How much of an item's text names it in announcements when it has no `reorderItemLabel`. */
const LABEL_LENGTH = 60;

/**
 * One movable element of the nearest `[uiReorderList]`, which it registers with through DI. It is
 * moved by the `[uiReorderHandle]` inside it, never by a press elsewhere on it.
 */
@Directive({ selector: '[uiReorderItem]' })
export class ReorderItem {
  /**
   * The item's name in announcements. When empty, its text trimmed to 60 characters, leaving out
   * its handle's and any list's hidden announcements and instructions.
   */
  readonly reorderItemLabel = input('');

  /** @internal */
  readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** @internal The list the item belongs to. */
  readonly list = inject(ReorderList);
  /** @internal The item's handle, which gets focus back after a drop. */
  handle?: HTMLElement;

  constructor() {
    this.list.register(this);
    inject(DestroyRef).onDestroy(() => this.list.unregister(this));
  }

  /** @internal The item's name in announcements. */
  label(): string {
    const given = this.reorderItemLabel();
    if (given) return given;
    const document = this.element.ownerDocument;
    const skip = (node: Node) => {
      const hidden = node.parentElement?.closest('[data-reorder-region], [aria-hidden="true"]');
      return (!!hidden && this.element.contains(hidden)) || !!this.handle?.contains(node);
    };
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (skip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      parts.push(node.textContent ?? '');
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, LABEL_LENGTH).trim();
  }
}
