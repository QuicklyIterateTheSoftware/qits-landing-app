import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedWork } from '$core/work/selected-work';
import { SelectedProject } from '$core/projects/selected-project';
import type { WorkDetail } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { ReorderList } from '$ui/components/reorder/reorder';
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';

/**
 * A feature's page body: its description (Markdown), its tasks (the feature as its row, as the lists draw it) and its comments. A feature
 * has no dossier. What it needs is the page's Needs panel (`app-work-needs-panel`, epic qits-1899).
 */
@Component({
  selector: 'app-feature-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, FeatureListRow, ReorderList, WorkComments],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <ui-markdown
      class="max-w-[48rem]"
      [text]="detail()?.entity?.description ?? ''"
      [workProject]="slug()"
    />
    <section class="flex flex-col gap-4" aria-label="Tasks">
      <h2 class="m-0 text-base font-semibold text-fg">Tasks</h2>
      <!-- A disabled reorder list: the row is an item of one wherever it is drawn (qits-753). -->
      <div
        class="flex flex-col gap-4 pr-6 [--lane-chin:--spacing(4)]"
        uiReorderList
        reorderDisabled
      >
        <app-feature-list-row [node]="node()" />
      </div>
    </section>
    <app-work-comments [comments]="detail()?.comments ?? []" [entry]="entry()" [project]="slug()" />
  `,
})
export class FeatureDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();

  /** The project's slug: the work ids the text names link with their briefs (qits-1898). */
  protected readonly slug = inject(SelectedProject).slug;

  private readonly work = inject(SelectedWork);

  protected readonly node = computed(() => this.work.graph().nodeOf(this.entry()));
}
