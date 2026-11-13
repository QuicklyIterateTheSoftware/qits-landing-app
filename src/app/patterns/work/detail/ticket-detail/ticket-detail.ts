import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { QitsEntity, QitsField, type QitsResourceRef } from '@qits/angular';
import type { DossierPages, EntityDetail, WorkThread } from '$core/work/work-detail.consumes';
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
  imports: [Markdown, QitsEntity, QitsField, WorkComments, WorkDossier, WorkFields],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <app-work-fields [fields]="fields()" />
    @if (entity(); as entity) {
      <ui-markdown
        class="max-w-[48rem]"
        [qitsEntity]="entity"
        entityKey="id"
        [entitySource]="item()"
        [fieldOf]="entity"
        qitsField="description"
        [text]="entity.description ?? ''"
        [workProject]="slug()"
      />
    } @else {
      <ui-markdown class="max-w-[48rem]" text="" [workProject]="slug()" />
    }
    <app-work-dossier [pages]="pages()" />
    <app-work-comments [comments]="comments()" [entry]="entry()" [project]="slug()" />
  `,
})
export class TicketDetail {
  readonly entry = input.required<WorkEntry>();
  /** The item's own read (`WORK_DETAIL`) and its thread (`WORK_COMMENTS`): the page's. */
  readonly item = input.required<QitsResourceRef<EntityDetail>>();
  readonly comments = input.required<QitsResourceRef<WorkThread>>();

  /** The item as read; none until it is in, and after a failed read. */
  protected readonly entity = computed(() => {
    const read = this.item();
    return read.hasValue() ? read.value() : undefined;
  });
  /** Its dossier's pages (`WORK_DOSSIER`): the page's read. */
  readonly pages = input.required<QitsResourceRef<DossierPages>>();

  /** The project's slug: the work ids the text names link with their briefs (qits-1898). */
  protected readonly slug = inject(SelectedProject).slug;

  protected readonly fields = computed((): readonly WorkField[] => {
    const entity = this.entity();
    const blocked = !!entity?.blocked;
    return [
      { label: 'Type', value: entity?.ticketType?.toLowerCase() ?? '' },
      { label: 'Impetus', value: entity?.impetus ?? '', workProject: this.slug() },
      { label: 'Assignee', value: entity?.assignee ?? 'Nobody' },
      {
        label: 'Blocked',
        value: blocked ? 'Yes. The reason is in the comments.' : 'No',
        alert: blocked,
      },
    ];
  });
}
