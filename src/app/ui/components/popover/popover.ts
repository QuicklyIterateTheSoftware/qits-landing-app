import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

let nextPopoverId = 0;

/** Which edge of the trigger the panel lines up with. */
export type PopoverAlign = 'start' | 'end';

/**
 * A small panel below its trigger. It shows while the pointer is over the trigger, or while the
 * keyboard focus is in it. For text that explains the trigger, not for things to click.
 *
 * ```html
 * <ui-popover #popover align="end">
 *   <button type="button" [attr.aria-describedby]="popover.panelId()">Dispatch</button>
 *   <div popover-content>…what it explains…</div>
 * </ui-popover>
 * ```
 *
 * The projected content is the trigger; `[popover-content]` goes in the panel. The panel is a
 * `role="tooltip"` with the id `panelId`: give it to the trigger's `aria-describedby`, so a screen
 * reader reads the panel as the trigger's description.
 *
 * CSS alone opens it (`group-hover`, `group-focus-within`). The panel is always rendered, so the
 * server and the browser render the same markup, and it works before hydration. It is `absolute`
 * below the host, and the pointer can move onto it without closing it. `align="end"` keeps the
 * panel of a trigger at the window's right edge inside the window. Escape closes it until the
 * pointer or the focus comes back.
 */
@Component({
  selector: 'ui-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'group/popover relative inline-flex hover:z-20 focus-within:z-20',
    '(pointerenter)': 'dismissed.set(false)',
    '(focusin)': 'dismissed.set(false)',
    '(document:keydown.escape)': 'dismissed.set(true)',
  },
  template: `
    <ng-content />
    <div class="absolute top-full z-20 pt-1" [class]="panelClasses()" data-popover-panel>
      <div
        [id]="panelId()"
        role="tooltip"
        class="w-max max-w-xs rounded-lg border border-charcoal-brown-200 bg-white px-3 py-2 text-left text-sm font-normal whitespace-normal text-charcoal-brown-900 shadow-lg"
      >
        <ng-content select="[popover-content]" />
      </div>
    </div>
  `,
})
export class Popover {
  /** The panel's id, for the trigger's `aria-describedby`; unique unless given. */
  readonly panelId = input(`popover-${nextPopoverId++}`);

  /** The trigger's edge the panel lines up with: `start` (left) or `end` (right). */
  readonly align = input<PopoverAlign>('start');

  protected readonly dismissed = signal(false);

  protected readonly panelClasses = computed(
    () =>
      `${this.align() === 'end' ? 'right-0' : 'left-0'} ${
        this.dismissed()
          ? 'hidden'
          : 'hidden group-focus-within/popover:block group-hover/popover:block'
      }`,
  );
}
