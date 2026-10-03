import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Action } from './action';

/** Where a button sits in a row of joined buttons: its rounded corners follow. */
export type ActionJoin = 'none' | 'start' | 'middle' | 'end';

const VARIANTS = {
  success:
    'border-mint-leaf-700 bg-mint-leaf-700 text-white hover:border-mint-leaf-800 hover:bg-mint-leaf-800',
  danger:
    'border-cinnabar-700 bg-cinnabar-600 text-white hover:border-cinnabar-800 hover:bg-cinnabar-700',
  muted:
    'border-charcoal-brown-300 bg-white text-charcoal-brown-800 hover:bg-charcoal-brown-100 hover:text-charcoal-brown-950',
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
 */
@Component({
  selector: 'ui-action-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <button
      type="button"
      class="relative inline-flex h-8 cursor-pointer items-center border px-3 text-sm font-semibold whitespace-nowrap focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-deep-600"
      [class]="classes()"
      [attr.data-variant]="action().variant"
      (click)="action().callback()"
    >
      {{ action().label }}
    </button>
  `,
})
export class ActionButton {
  readonly action = input.required<Action>();

  readonly join = input<ActionJoin>('none');

  protected readonly classes = computed(
    () => `${VARIANTS[this.action().variant]} ${JOINS[this.join()]}`,
  );
}
