import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** How a toast reads: a plain note, or a failure. */
export type ToastTone = 'note' | 'error';

/**
 * A short message in a dark box, with at most one action button after it ("Undo", "Dismiss").
 * Without an `action` label the button is hidden by class, never removed by `@if`. Toasts stack in
 * a `ui-toast-stack`, which places them and announces them.
 */
@Component({
  selector: 'ui-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex items-center gap-4 rounded-md py-2 pr-2 pl-3 text-sm shadow-lg"
      [class]="tone() === 'error' ? 'bg-red-800 text-red-50' : 'bg-charcoal-brown-900 text-white'"
    >
      <span class="grow">{{ message() }}</span>
      <button
        type="button"
        class="cursor-pointer rounded border-0 bg-transparent px-2 py-1 font-semibold text-inherit underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none"
        [class]="action() ? 'inline-block' : 'hidden'"
        (click)="act.emit()"
      >
        {{ action() }}
      </button>
    </div>
  `,
})
export class Toast {
  readonly message = input.required<string>();
  /** The action button's label; empty for none. */
  readonly action = input('');
  readonly tone = input<ToastTone>('note');
  /** A click on the action button. */
  readonly act = output<void>();
}

/** Where toasts show: stacked at the bottom right of the window, above everything, read out. */
@Component({
  selector: 'ui-toast-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 [&>*]:pointer-events-auto',
    'aria-live': 'polite',
  },
  template: `<ng-content />`,
})
export class ToastStack {}
