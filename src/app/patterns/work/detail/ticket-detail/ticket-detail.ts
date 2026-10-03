import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { WorkDetail } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';
import { WorkDossier } from '$patterns/work/detail/work-dossier/work-dossier';
import { WorkFields, type WorkField } from '$patterns/work/detail/work-fields/work-fields';

/**
 * A ticket's page body: its facts (type, impetus, assignee, whether it is blocked), its
 * description (Markdown), its dossier and its comments. A ticket has no children.
 *
 * qits-projects keeps no reason with the blocked flag: a block's reason is a comment on the
 * thread, so it shows there.
 */
@Component({
  selector: 'app-ticket-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, WorkComments, WorkDossier, WorkFields],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <app-work-fields [fields]="fields()" />
    <ui-markdown class="max-w-[48rem]" [text]="detail()?.entity?.description ?? ''" />
    <app-work-dossier [pages]="detail()?.pages ?? []" />
    <app-work-comments [comments]="detail()?.comments ?? []" />
  `,
})
export class TicketDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();

  protected readonly fields = computed((): readonly WorkField[] => {
    const entity = this.detail()?.entity;
    const blocked = !!entity?.blocked;
    return [
      { label: 'Type', value: entity?.ticketType?.toLowerCase() ?? '' },
      { label: 'Impetus', value: entity?.impetus ?? '' },
      { label: 'Assignee', value: entity?.assignee ?? 'Nobody' },
      {
        label: 'Blocked',
        value: blocked ? 'Yes. The reason is in the comments.' : 'No',
        alert: blocked,
      },
    ];
  });
}
