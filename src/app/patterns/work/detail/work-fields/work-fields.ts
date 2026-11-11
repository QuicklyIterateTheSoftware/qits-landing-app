import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QitsCommitMessage } from '@qits/ui-components';

/** One fact about a work item: a label and its value. */
export interface WorkField {
  readonly label: string;
  readonly value: string;
  /** The value is a warning (a blocked item). */
  readonly alert?: boolean;
  /** The value is an id: shown in monospace. */
  readonly code?: boolean;
  /**
   * The value is prose (a ticket's impetus): the work ids of this project (its slug) in it are
   * drawn as work references with their briefs (`<qits-commit-message>`, qits-1898). Unset for a
   * value that is not prose (an id, a status, a name), which stays plain text.
   */
  readonly workProject?: string;
}

/** A work item's facts as a two-column list: labels on the left, values on the right. */
@Component({
  selector: 'app-work-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsCommitMessage],
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
          @if (field.workProject) {
            <span
              ><qits-commit-message [message]="field.value" [project]="field.workProject"
            /></span>
          } @else {
            <span>{{ field.value }}</span>
          }
        </dd>
      }
    </dl>
  `,
})
export class WorkFields {
  readonly fields = input.required<readonly WorkField[]>();
}
