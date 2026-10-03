import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkDetail } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';
import {
  dependsOnField,
  WorkFields,
  type WorkField,
} from '$patterns/work/detail/work-fields/work-fields';

/**
 * A feature's page body: what it depends on (a link to that feature), its description
 * (Markdown), its tasks (the feature as its row, as the lists draw it) and its comments. A feature
 * has no dossier.
 */
@Component({
  selector: 'app-feature-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, FeatureListRow, WorkComments, WorkFields],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <app-work-fields [class.hidden]="!fields().length" [fields]="fields()" />
    <ui-markdown class="max-w-[48rem]" [text]="detail()?.entity?.description ?? ''" />
    <section class="flex flex-col gap-4" aria-label="Tasks">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Tasks</h2>
      <div class="flex flex-col gap-4 pr-6 [--lane-chin:--spacing(4)]">
        <app-feature-list-row [node]="node()" [base]="base()" />
      </div>
    </section>
    <app-work-comments [comments]="detail()?.comments ?? []" />
  `,
})
export class FeatureDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();

  private readonly work = inject(SelectedWork);

  protected readonly node = computed(() => this.work.graph().nodeOf(this.entry()));

  protected readonly fields = computed((): readonly WorkField[] =>
    dependsOnField(this.detail()?.entity?.dependsOn, this.work.entries(), this.base()),
  );
}
