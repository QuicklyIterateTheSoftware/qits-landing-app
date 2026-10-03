import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The round caret button that opens and closes more content. It straddles the bottom edge of its
 * positioned container, centred and half outside. It is placed by offsets (half its 1.625rem size),
 * not by a translate: a transformed button gets its own compositing layer, and its edges then
 * render a few pixels differently from run to run. `open` is the state it shows; `controls` names
 * the element it opens. A click toggles and does not follow a link the button sits in.
 */
@Component({
  selector: 'ui-expand-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      class="absolute -bottom-[0.8125rem] left-[calc(50%-0.8125rem)] z-20 flex size-6.5 cursor-pointer items-center justify-center rounded-full border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))] text-gray-500 hover:text-gray-900 focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:outline-none"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="controls()"
      [attr.aria-label]="open() ? 'Show less' : 'Show more'"
      (click)="toggle($event)"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        class="size-3.5 transition-transform duration-200"
        [class.rotate-180]="open()"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  `,
})
export class ExpandButton {
  readonly open = input.required<boolean>();
  readonly controls = input.required<string>();
  /** Each click. */
  readonly toggled = output<void>();

  protected toggle(event: Event): void {
    // The button may sit inside a link; it must not follow it.
    event.preventDefault();
    event.stopPropagation();
    this.toggled.emit();
  }
}
