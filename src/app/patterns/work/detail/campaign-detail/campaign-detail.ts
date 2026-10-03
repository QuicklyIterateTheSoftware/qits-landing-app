import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedWork } from '$core/work/selected-work';
import type { WorkDetail } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { Markdown } from '$ui/components/markdown/markdown';
import { WorkComments } from '$patterns/work/detail/work-comments/work-comments';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * A campaign's page body: its description (Markdown), its members in campaign order as the
 * Campaigns page draws them (`app-work-list`, view `campaign`; a member epic on the board with
 * its own board), and its comments. A campaign has
 * no dossier.
 */
@Component({
  selector: 'app-campaign-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, WorkComments, WorkList],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <ui-markdown class="max-w-[48rem]" [text]="detail()?.entity?.description ?? ''" />
    <section class="flex flex-col gap-4" aria-label="Members">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Members</h2>
      <app-work-list [tree]="members()" [base]="base()" view="campaign" epicBoards />
    </section>
    <app-work-comments [comments]="detail()?.comments ?? []" />
  `,
})
export class CampaignDetail {
  readonly entry = input.required<WorkEntry>();
  readonly detail = input<WorkDetail>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();

  private readonly work = inject(SelectedWork);

  protected readonly members = computed(() => this.work.graph().membersOf(this.entry()));
}
