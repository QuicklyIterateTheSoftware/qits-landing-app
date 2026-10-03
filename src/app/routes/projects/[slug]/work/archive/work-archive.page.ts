import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';
import { CampaignSection } from '$patterns/work/campaign-section/campaign-section';

/**
 * A project's finished work, at `/projects/<slug>/work/archive`: everything in a final state (Done
 * or Dropped), nested as on the board, in the same groups the backlog uses. Below it, under
 * "Campaigns", the campaigns in a final state, drawn as the Campaigns page draws the open ones.
 * Below rather than above: the epics and tickets are what the Archive is mostly for, and a
 * campaign repeats all its members, so above it would push them out of sight.
 */
@Component({
  selector: 'app-work-archive-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, WorkList, CampaignSection],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Archive">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-work-list
            [class.hidden]="!archived().length && campaigns().length"
            [tree]="archived()"
            [base]="detailPath()"
            view="archive"
          />
          <section
            class="flex-col gap-8"
            [class]="campaigns().length ? (archived().length ? 'mt-12 flex' : 'flex') : 'hidden'"
            aria-label="Archived campaigns"
          >
            <h2 class="m-0 text-lg font-semibold text-charcoal-brown-900">Campaigns</h2>
            <div class="flex flex-col gap-12">
              @for (campaign of campaigns(); track campaign.entry.id) {
                <app-campaign-section
                  [entry]="campaign.entry"
                  [members]="campaign.members"
                  [description]="campaign.description"
                  [base]="detailPath()"
                  [level]="3"
                />
              }
            </div>
          </section>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkArchivePage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly archived = computed(() => this.work.graph().tree('archive'));

  /** Each archived campaign with its description and its members. */
  protected readonly campaigns = computed(() => {
    const graph = this.work.graph();
    const descriptions = this.work.campaignDescriptions();
    return graph.archivedCampaigns().map((entry) => ({
      entry,
      description: (entry.id && descriptions[entry.id]) || '',
      members: graph.membersOf(entry),
    }));
  });

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
