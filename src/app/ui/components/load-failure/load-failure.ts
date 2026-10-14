import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ActionButton } from '$ui/components/action-button/action-button';
import type { Action } from '$ui/components/action-button/action';

/**
 * Says that a read failed, in words, and offers to make it again: the error icon, `message`, and a
 * Retry button that emits `retry`.
 *
 * ```html
 * <ui-load-failure
 *   message="The release requests could not be read."
 *   [class.hidden]="state() !== 'error'"
 *   (retry)="retry()"
 * />
 * ```
 *
 * Where `ui-spinner` only marks a failed part of a page with its icon, this takes the place of
 * content that cannot be shown at all without the answer (a page's one subject, a page's list).
 * It is an `alert`, so assistive technology announces it when it appears.
 */
@Component({
  selector: 'ui-load-failure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <div
      role="alert"
      class="flex flex-wrap items-center gap-3 rounded-md border border-cinnabar-200 bg-cinnabar-50 px-3 py-2 text-sm text-cinnabar-800"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="block size-5 shrink-0 text-cinnabar-600"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7v6" />
        <path d="M12 17h.01" />
      </svg>
      <span class="min-w-48 flex-1 break-words">{{ message() }}</span>
      <ui-action-button [action]="action()" />
    </div>
  `,
})
export class LoadFailure {
  /** What could not be read, as a sentence. */
  readonly message = input.required<string>();

  /** The button's label. */
  readonly retryLabel = input('Retry');

  /** The person asked to read it again. */
  readonly retry = output<void>();

  protected readonly action = computed((): Action => ({
    label: this.retryLabel(),
    variant: 'muted',
    callback: () => this.retry.emit(),
  }));
}
