import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One fact about a work item: a label and its value, or a link to another item. */
export interface WorkField {
  readonly label: string;
  readonly value: string;
  /** The value links here (another item's page), when set. */
  readonly link?: string;
  /** The value is a warning (a blocked item). */
  readonly alert?: boolean;
  /** The value is an id: shown in monospace. */
  readonly code?: boolean;
}

/** A work item's facts as a two-column list: labels on the left, values on the right. */
@Component({
  selector: 'app-work-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
      @for (field of fields(); track field.label) {
        <dt class="text-charcoal-brown-600">{{ field.label }}</dt>
        <dd
          class="m-0 min-w-0 text-charcoal-brown-900"
          [class.font-mono]="field.code"
          [class.text-xs]="field.code"
          [class.leading-5]="field.code"
          [class.font-semibold]="field.alert"
          [class.text-cinnabar-700]="field.alert"
        >
          <a
            class="text-ocean-deep-700 underline"
            [class.hidden]="!field.link"
            [routerLink]="field.link ?? null"
            >{{ field.value }}</a
          >
          <span [class.hidden]="!!field.link">{{ field.value }}</span>
        </dd>
      }
    </dl>
  `,
})
export class WorkFields {
  readonly fields = input.required<readonly WorkField[]>();
}
