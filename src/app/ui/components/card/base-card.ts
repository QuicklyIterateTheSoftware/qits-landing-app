import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The card's title row. Optional: a card without one draws no header. */
@Component({
  selector: 'card-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      padding: 0.75rem 1.5rem;
      font-weight: 600;
    }

    /* Only a header with content below it needs the dividing line. */
    :host(:not(:last-child)) {
      border-bottom: 1px solid var(--card-border);
    }
  `,
})
export class CardHeader {}

/** The card's content. */
@Component({
  selector: 'card-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      padding: 1.5rem;
    }
  `,
})
export class CardBody {}

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
 * `--card-background` and `--card-border` set its colours; variants such as `CardSilent` change
 * only those.
 */
@Component({
  selector: 'ui-base-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content select="card-header" />
    <ng-content select="card-body" />
  `,
  styles: `
    :host {
      --card-background: #ffffff;
      --card-border: #e5e7eb;
      display: block;
      background: var(--card-background);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
    }
  `,
})
export class BaseCard {}

/** Everything a template needs to use a card. */
export const CARD = [BaseCard, CardHeader, CardBody] as const;
