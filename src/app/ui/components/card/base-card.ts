import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

/** The card's title row. Optional: a card without one draws no header. */
@Component({
  selector: 'card-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Only a header with content below it draws the dividing line.
  host: {
    class:
      'block px-6 py-3 font-semibold not-last:border-b not-last:border-[var(--card-border,var(--color-gray-200))]',
  },
  template: `<ng-content />`,
})
export class CardHeader {}

/** The card's content, padded unless `flush` is set (content that runs to the card's edges). */
@Component({
  selector: 'card-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '[class.p-6]': '!flush()' },
  template: `<ng-content />`,
})
export class CardBody {
  readonly flush = input(false, { transform: booleanAttribute });
}

let nextExpandableId = 0;

/**
 * More content, hidden until asked for. Collapsed, the card ends right below its body; a round
 * button with a caret straddles the card's bottom edge, centred and half outside. The button opens
 * the content downwards with a short animation, and closes it again.
 *
 * Both states are always rendered and switched by class, never by `@if`, so a server-rendered
 * page hydrates without leftovers. The content's height animates through `grid-template-rows`
 * (0fr to 1fr), which needs no measured height.
 */
@Component({
  selector: 'card-expandable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      [id]="contentId"
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      [class]="open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      [attr.inert]="open() ? null : ''"
    >
      <div class="min-h-0 overflow-hidden">
        <!-- When open, a chin below the content keeps the button off its last line. -->
        <div class="pb-4"><ng-content /></div>
      </div>
    </div>
    <!-- No room of its own: the button straddles the card's bottom edge, half outside. -->
    <button
      type="button"
      class="absolute bottom-0 left-1/2 z-10 flex size-6.5 -translate-x-1/2 translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))] text-gray-500 hover:text-gray-900 focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:outline-none"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="contentId"
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
export class CardExpandable {
  /** Emits each time the content opens: load what it shows on the first one. */
  readonly opened = output<void>();

  protected readonly open = signal(false);
  protected readonly contentId = `card-expandable-${nextExpandableId++}`;

  protected toggle(event: Event): void {
    // A card may sit inside a link; the button must not follow it.
    event.preventDefault();
    event.stopPropagation();
    this.open.update((open) => !open);
    if (this.open()) this.opened.emit();
  }
}

/**
 * A bordered, rounded box with three slots: `<card-header>`, `<card-body>` and, optionally,
 * `<card-expandable>`.
 *
 * ```html
 * <ui-base-card>
 *   <card-header>Title</card-header>
 *   <card-body>Content</card-body>
 * </ui-base-card>
 * ```
 *
 * Its content is clipped to the rounded corners, so a coloured header or flush body fills them.
 * `--card-background` and `--card-border` set its colours (white and Tailwind's gray-200 when
 * unset); variants such as `CardSilent` change only those.
 */
@Component({
  selector: 'ui-base-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The host is the positioned box; the frame inside it clips to the rounded corners. An
  // expandable's button is positioned against the host, so it can sit half outside the frame.
  host: { class: 'relative block' },
  template: `
    <div
      class="overflow-hidden rounded-xl border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))]"
    >
      <ng-content select="card-header" />
      <ng-content select="card-body" />
      <ng-content select="card-expandable" />
    </div>
  `,
})
export class BaseCard {}

/** Everything a template needs to use a card. */
export const CARD = [BaseCard, CardHeader, CardBody, CardExpandable] as const;
