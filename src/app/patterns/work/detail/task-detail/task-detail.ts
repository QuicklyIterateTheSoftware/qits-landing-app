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
import type { WorkDetail } from '$core/work/work-detail.store';
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
  imports: [Markdown, WorkComments, WorkFields],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <app-work-fields [fields]="fields()" />
    <ui-markdown
      class="max-w-[48rem]"
      [text]="detail()?.entity?.description ?? ''"
      [workProject]="slug()"
    />
    <app-work-comments [comments]="detail()?.comments ?? []" [entry]="entry()" [project]="slug()" />
  `,
})
export class TaskDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();

  /** The project's slug: the work ids the text names link with their briefs (qits-1898). */
  protected readonly slug = inject(SelectedProject).slug;

  private readonly locale = inject(LOCALE_ID);

  protected readonly fields = computed((): readonly WorkField[] => {
    const entity = this.detail()?.entity;
    const when = (instant: string | null | undefined) =>
      instant ? formatDate(instant, 'd MMM y, HH:mm', this.locale, 'UTC') : 'Not yet';
    return [
      { label: 'Repository', value: entity?.repositoryId ?? 'None', code: !!entity?.repositoryId },
      { label: 'Started', value: when(entity?.implementingAt) },
      { label: 'Implemented', value: when(entity?.implementedAt) },
    ];
  });
}
