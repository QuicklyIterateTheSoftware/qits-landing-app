import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { outcomeMark } from '@qits/angular';
import { Popover } from '$ui/components/popover/popover';
import { Action } from './action';

/** Where a button sits in a row of joined buttons: its rounded corners follow. */
export type ActionJoin = 'none' | 'start' | 'middle' | 'end';

const VARIANTS = {
  success: 'border-success bg-success text-fg-on-accent hover:bg-success/90',
  danger: 'border-danger bg-danger text-fg-on-accent hover:bg-danger/90',
  muted: 'border-line-strong bg-surface text-fg-soft hover:bg-surface-muted hover:text-fg',
} as const;

const JOINS = {
  none: 'rounded-md',
  start: 'rounded-l-md',
  middle: '-ml-px',
  end: '-ml-px rounded-r-md',
} as const;

/**
 * One action as a button: its label, its variant's colours, and its callback on click.
 *
 * ```html
 * <ui-action-button [action]="{ label: 'Retry', variant: 'success', callback: retry }" />
 * ```
 *
 * `join` rounds only the outer corners of a row of joined buttons (`app-page-layout` uses it for an
 * action group).
 *
 * An action with `details` shows them in a `ui-popover` while the button is hovered or focused: the
 * title, then the items as an ordered list. The panel lines up with the button's right edge, as
 * actions mostly sit at the right of the page. The button names the panel in `aria-describedby`.
 *
 * An action with `outcomes` marks its button with them (`data-qits-outcome`, `outcomeMark`), so a
 * screenshot shows which declared outcomes the button triggers (epic qits-2000).
 */
@Component({
  selector: 'ui-action-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Popover],
  host: { class: 'inline-flex' },
  template: `
    @if (action().details; as details) {
      <ui-popover #popover align="end">
        <ng-container *ngTemplateOutlet="button; context: { describedBy: popover.panelId() }" />
        <div popover-content>
          @if (details.title) {
            <p class="m-0 mb-1 font-semibold">{{ details.title }}</p>
          }
          <ol class="m-0 list-decimal pl-5">
            @for (item of details.items; track $index) {
              <li>{{ item }}</li>
            }
          </ol>
        </div>
      </ui-popover>
    } @else {
      <ng-container *ngTemplateOutlet="button; context: { describedBy: null }" />
    }
    <ng-template #button let-describedBy="describedBy">
      <button
        type="button"
        class="relative inline-flex h-8 cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-60 border px-3 text-sm font-semibold whitespace-nowrap focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        [class]="classes()"
        [disabled]="action().disabled ?? false"
        [attr.data-variant]="action().variant"
        [attr.data-qits-outcome]="mark()"
        [attr.aria-describedby]="describedBy"
        (click)="action().callback()"
      >
        {{ action().label }}
      </button>
    </ng-template>
  `,
})
export class ActionButton {
  readonly action = input.required<Action>();

  readonly join = input<ActionJoin>('none');

  /** The trigger mark of the action's outcomes, or `null` (no attribute) when it has none. */
  protected readonly mark = computed(() => {
    const outcomes = this.action().outcomes ?? [];
    return outcomes.length ? outcomeMark(...outcomes) : null;
  });

  protected readonly classes = computed(
    () => `${VARIANTS[this.action().variant]} ${JOINS[this.join()]}`,
  );
}
