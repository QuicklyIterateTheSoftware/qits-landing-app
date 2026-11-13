import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
} from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { QitsEntity, QitsField, type QitsFieldMark, type QitsResourceRef } from '@qits/angular';
import { valueMarks } from '$core/marks/value-marks';
import type { EntityDetail, WorkThread } from '$core/work/work-detail.consumes';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';
import { WorkFields, type WorkField } from '$patterns/work/detail/work-fields/work-fields';

/**
 * A task's page body: its facts (the repository it changes, by id; when it was started and when
 * implemented), its description (Markdown) and its comments. A task has no children and no
 * dossier. What it needs is the page's Needs panel (`app-work-needs-panel`, epic qits-1899).
 */
@Component({
  selector: 'app-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, QitsEntity, QitsField, WorkComments, WorkFields],
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
    <app-work-comments [comments]="comments()" [entry]="entry()" [project]="slug()" />
  `,
})
export class TaskDetail {
  readonly entry = input.required<WorkEntry>();
  /** The item's own read (`WORK_DETAIL`) and its thread (`WORK_COMMENTS`): the page's. */
  readonly item = input.required<QitsResourceRef<EntityDetail>>();
  readonly comments = input.required<QitsResourceRef<WorkThread>>();

  /** The item as read; none until it is in, and after a failed read. */
  protected readonly entity = computed(() => {
    const read = this.item();
    return read.hasValue() ? read.value() : undefined;
  });

  /** The project's slug: the work ids the text names link with their briefs (qits-1898). */
  protected readonly slug = inject(SelectedProject).slug;

  private readonly locale = inject(LOCALE_ID);

  protected readonly fields = computed((): readonly WorkField[] => {
    const entity = this.entity();
    const when = (instant: string | null | undefined) =>
      instant ? formatDate(instant, 'd MMM y, HH:mm', this.locale, 'UTC') : 'Not yet';
    // The values are the item's own read (qits-2146): marked once it is in.
    const marks = (mark: QitsFieldMark<EntityDetail>) =>
      entity ? valueMarks(this.item().operation, entity, 'id', mark) : undefined;
    return [
      {
        label: 'Repository',
        value: entity?.repositoryId ?? 'None',
        code: !!entity?.repositoryId,
        marks: marks('repositoryId'),
      },
      {
        label: 'Started',
        value: when(entity?.implementingAt),
        marks: marks('implementingAt'),
      },
      {
        label: 'Implemented',
        value: when(entity?.implementedAt),
        marks: marks('implementedAt'),
      },
    ];
  });
}
