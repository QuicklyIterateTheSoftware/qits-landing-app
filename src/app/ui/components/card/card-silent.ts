import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BaseCard } from './base-card';

/** A `BaseCard` on a gray background, for cards that sit in a grid rather than stand out. */
@Component({
  selector: 'ui-card-silent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseCard],
  host: { class: 'block' },
  template: `
    <ui-base-card class="[--card-background:var(--color-gray-50)]">
      <ng-content select="card-header" ngProjectAs="card-header" />
      <ng-content select="card-body" ngProjectAs="card-body" />
    </ui-base-card>
  `,
})
export class CardSilent {}
