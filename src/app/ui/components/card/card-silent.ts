import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BaseCard } from './base-card';

/** A `BaseCard` on a gray background, for cards that sit in a grid rather than stand out. */
@Component({
  selector: 'ui-card-silent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseCard],
  template: `
    <ui-base-card>
      <ng-content select="card-header" ngProjectAs="card-header" />
      <ng-content select="card-body" ngProjectAs="card-body" />
    </ui-base-card>
  `,
  styles: `
    :host {
      display: block;
    }

    ui-base-card {
      --card-background: #f9fafb;
    }
  `,
})
export class CardSilent {}
