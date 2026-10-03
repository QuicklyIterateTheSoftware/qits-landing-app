import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ExpandButton } from '$ui/components/expand-button/expand-button';
import { Findable } from '$ui/components/findable/findable';
import { HIGHLIGHT_TARGET, Highlighter } from '$ui/components/highlight/highlight';

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
 * page hydrates without leftovers. Closed content is hidden until found: find-in-page searches it
 * and opens it on a match. The content's height animates through `grid-template-rows`
 * (0fr to 1fr), which needs no measured height.
 */
@Component({
  selector: 'card-expandable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExpandButton, Findable],
  host: { class: 'block' },
  template: `
    <div
      [id]="contentId"
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      [class]="open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      [uiFindable]="!open()"
      (found)="reveal()"
    >
      <div class="min-h-0 overflow-hidden">
        <!-- When open, a chin below the content keeps the button off its last line. -->
        <div class="pb-4"><ng-content /></div>
      </div>
    </div>
    <!-- No room of its own: the button straddles the card's bottom edge, half outside. -->
    <ui-expand-button [open]="open()" [controls]="contentId" (toggled)="toggle()" />
  `,
})
export class CardExpandable {
  /** Emits each time the content opens: load what it shows on the first one. */
  readonly opened = output<void>();

  protected readonly open = signal(false);
  protected readonly contentId = `card-expandable-${nextExpandableId++}`;

  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly highlighter = inject(Highlighter);

  /** Find-in-page found text in the closed content: open it and point at the card. */
  protected reveal(): void {
    if (!this.open()) this.toggle();
    const card = this.element.closest<HTMLElement>(`[${HIGHLIGHT_TARGET}]`) ?? this.element;
    this.highlighter.highlight(card);
  }

  protected toggle(): void {
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
  host: { class: 'relative block rounded-xl', 'data-highlight-target': '' },
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
