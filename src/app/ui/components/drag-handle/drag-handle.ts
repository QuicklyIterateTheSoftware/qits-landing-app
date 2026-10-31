import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReorderHandle } from '$ui/components/reorder/reorder';

/**
 * A round six-dot grip, the finish button's twin (`ui-finish-button`): it sits on the bottom-right
 * corner of its positioned container, centred on the corner, so three quarters of it are outside;
 * a clipping ancestor would cut it, so it must have none. Its button is the `[uiReorderHandle]` of
 * the nearest `[uiReorderItem]`, so it must sit inside one: a press and a drag, or Space or Enter,
 * move that item within its list. `shown` is switched by class, never by `@if`, so a server render
 * hydrates as is.
 */
@Component({
  selector: 'ui-drag-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReorderHandle],
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      uiReorderHandle
      class="absolute -right-[0.8125rem] -bottom-[0.8125rem] z-20 size-6.5 items-center justify-center rounded-full border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))] text-charcoal-brown-500 hover:text-charcoal-brown-900 focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:outline-none"
      [class]="shown() ? 'flex' : 'hidden'"
      [attr.aria-label]="label()"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" class="size-3.5" fill="currentColor">
        <circle cx="5.5" cy="3.5" r="1.25" />
        <circle cx="10.5" cy="3.5" r="1.25" />
        <circle cx="5.5" cy="8" r="1.25" />
        <circle cx="10.5" cy="8" r="1.25" />
        <circle cx="5.5" cy="12.5" r="1.25" />
        <circle cx="10.5" cy="12.5" r="1.25" />
      </svg>
    </button>
  `,
})
export class DragHandle {
  /** What the handle moves, said for a screen reader, e.g. "Move qits-12". */
  readonly label = input.required<string>();
  readonly shown = input(true, { transform: booleanAttribute });
}
