import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ApprovalLine } from '$core/release-requests/approval-requirements';
import { Chip } from '$ui/components/chip/chip';

/**
 * A request's approval requirements (epic qits-1038), one line each: why it holds, the approval
 * roles that may satisfy it (and that the request's own authors may not, where it says so), its
 * detail, and who satisfied it, with the roles they held and when, or that it is still open.
 */
@Component({
  selector: 'app-approval-requirements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  host: { class: 'block' },
  template: `
    <ul class="m-0 flex list-none flex-col gap-1 p-0" aria-label="Approval requirements">
      @for (line of lines(); track line.id) {
        <li
          class="rounded border border-charcoal-brown-100 px-2 py-1"
          [attr.data-requirement]="line.id"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ line.reason }}</span>
            <ui-chip
              [label]="line.satisfied ? 'satisfied' : 'open'"
              [tone]="line.satisfied ? 'ok' : 'waiting'"
            />
          </div>
          @if (line.admits || line.excludesAuthors) {
            <p class="m-0 mt-0.5 text-xs text-charcoal-brown-600">
              @if (line.admits) {
                May be approved by {{ line.admits }}
              }
              @if (line.excludesAuthors) {
                <span>{{ line.admits ? ', ' : '' }}not the request’s authors</span>
              }
            </p>
          }
          @if (line.detail) {
            <p class="m-0 mt-0.5 break-words text-xs text-charcoal-brown-700">{{ line.detail }}</p>
          }
          @if (line.satisfiedBy; as by) {
            <p class="m-0 mt-0.5 text-xs text-mint-leaf-800">
              Satisfied by {{ by.approver }}
              @if (by.roles) {
                <span>({{ by.roles }})</span>
              }
              @if (by.when) {
                <span [title]="by.at">, {{ by.when }}</span>
              }
            </p>
          } @else if (!line.satisfied) {
            <p class="m-0 mt-0.5 text-xs text-charcoal-brown-500">
              Open: nobody has approved it yet.
            </p>
          }
        </li>
      }
    </ul>
  `,
})
export class ApprovalRequirements {
  readonly lines = input.required<readonly ApprovalLine[]>();
}
