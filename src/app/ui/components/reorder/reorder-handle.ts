import { computed, DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { ReorderItem } from './reorder-item';

/**
 * The handle that moves the nearest `[uiReorderItem]`: a press and a drag on it with a mouse or a
 * pen, or Space or Enter while it has focus. The owner makes it a `<button type="button">` with
 * its own `aria-label` and look. The directive adds `touch-action: none`, the grab cursor
 * (`grabbing` while its item moves), `aria-roledescription="drag handle"` and
 * `aria-describedby` naming the list's instructions. A disabled list ignores it.
 */
@Directive({
  selector: '[uiReorderHandle]',
  host: {
    'aria-roledescription': 'drag handle',
    '[attr.aria-describedby]': 'item.list.instructionsId',
    '[style.touch-action]': "'none'",
    '[style.cursor]': 'cursor()',
    '(pointerdown)': 'item.list.press(item, element, $event)',
    '(keydown)': 'item.list.key(item, $event)',
    '(focusout)': 'item.list.blurred(item)',
  },
})
export class ReorderHandle {
  protected readonly item = inject(ReorderItem);
  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  protected readonly cursor = computed(() => {
    const list = this.item.list;
    if (list.reorderDisabled()) return null;
    return list.moving() === this.item ? 'grabbing' : 'grab';
  });

  constructor() {
    this.item.handle = this.element;
    inject(DestroyRef).onDestroy(() => {
      if (this.item.handle === this.element) this.item.handle = undefined;
    });
  }
}
