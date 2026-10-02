import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

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

/**
 * A bordered, rounded box with two slots: `<card-header>` and `<card-body>`.
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
  host: {
    class:
      'block overflow-hidden rounded-xl border border-[var(--card-border,var(--color-gray-200))] bg-[var(--card-background,var(--color-white))]',
  },
  template: `
    <ng-content select="card-header" />
    <ng-content select="card-body" />
  `,
})
export class BaseCard {}

/** Everything a template needs to use a card. */
export const CARD = [BaseCard, CardHeader, CardBody] as const;
