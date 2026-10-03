import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { hasEpicBoard } from '$core/work/epic-board';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkDetail } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { EpicBoard } from '$patterns/work/epic-board/epic-board';
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';
import { WorkDossier } from '$patterns/work/detail/work-dossier/work-dossier';

/**
 * An epic's page body: its description (Markdown), its features, its dossier with its figures
 * inline, and its comments. While the epic is on the board (REFINED to VERIFYING), its features are
 * its own board (`app-epic-board`, without the epic's bar: the page names it); otherwise each is a
 * row with its tasks as the lists draw them (`app-feature-list-row`). Picked with `@if`: the body
 * exists only in the browser (the server loads no work, see the work item page).
 */
@Component({
  selector: 'app-epic-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, EpicBoard, FeatureListRow, WorkComments, WorkDossier],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <ui-markdown class="max-w-[48rem]" [text]="detail()?.entity?.description ?? ''" />
    <section class="flex flex-col gap-4" aria-label="Features">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Features</h2>
      @if (boarded()) {
        <app-epic-board [node]="node()" [base]="base()" [header]="false" />
      } @else {
        <div
          class="flex-col gap-4 pr-6 [--lane-chin:--spacing(4)]"
          [class]="features().length ? 'flex' : 'hidden'"
        >
          @for (feature of features(); track feature.entry.id) {
            <app-feature-list-row [node]="feature" [base]="base()" />
          }
        </div>
        <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="features().length">
          Nothing here
        </p>
      }
    </section>
    <app-work-dossier [pages]="detail()?.pages ?? []" [figures]="detail()?.figures ?? {}" />
    <app-work-comments [comments]="detail()?.comments ?? []" />
  `,
})
export class EpicDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();

  private readonly work = inject(SelectedWork);

  protected readonly node = computed(() => this.work.graph().nodeOf(this.entry()));
  protected readonly features = computed(() => this.node().children);
  protected readonly boarded = computed(() => hasEpicBoard(this.entry()));
}
