import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Spinner, type LoadState } from '../spinner/spinner';

/** How the action behind the button is going. */
export type FinishButtonState = 'idle' | 'running' | 'error';

/**
 * A round button with a check, the expand button's twin: it straddles the right edge of its
 * positioned container, vertically centred and half outside. While `state` is `running` it shows
 * the spinner and is disabled; on `error` the error icon, and a click tries again. `shown` is
 * switched by class, never by `@if`, so a server render hydrates as is.
 */
@Component({
  selector: 'ui-finish-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      class="absolute top-[calc(50%-0.8125rem)] -right-[0.8125rem] z-20 size-6.5 cursor-pointer items-center justify-center rounded-full border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))] text-mint-leaf-700 hover:text-mint-leaf-900 focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:outline-none disabled:cursor-wait"
      [class]="shown() ? 'flex' : 'hidden'"
      [disabled]="state() === 'running'"
      [attr.aria-label]="label()"
      (click)="press($event)"
    >
      <ui-spinner
        [state]="spinner()"
        class="flex size-full items-center justify-center rounded-full [&>div]:bg-transparent [&>div]:p-0.5"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          class="size-3.5"
          [class.invisible]="state() !== 'idle'"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </ui-spinner>
    </button>
  `,
})
export class FinishButton {
  /** What the button does, said for a screen reader, e.g. "Mark qits-12 done". */
  readonly label = input.required<string>();
  readonly state = input<FinishButtonState>('idle');
  readonly shown = input(true, { transform: booleanAttribute });
  /** Each click while not running. */
  readonly finish = output<void>();

  protected spinner(): LoadState {
    const state = this.state();
    return state === 'running' ? 'loading' : state === 'error' ? 'error' : 'loaded';
  }

  protected press(event: Event): void {
    // The button may sit inside a link's reach; it must not follow it.
    event.preventDefault();
    event.stopPropagation();
    if (this.state() !== 'running') this.finish.emit();
  }
}
