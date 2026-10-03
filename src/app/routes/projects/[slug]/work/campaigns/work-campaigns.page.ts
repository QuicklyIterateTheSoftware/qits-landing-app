import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { CampaignSection } from '$patterns/work/campaign-section/campaign-section';

/**
 * A project's open campaigns, at `/projects/<slug>/work/campaigns`. A campaign gathers epics and
 * tickets from every phase, so it has no place in a phase's list while open (a DONE or DROPPED one
 * is in the Archive); here each one (`app-campaign-section`) shows its title
 * (linking to its page), its status, the start of its description, and its members in campaign
 * order, drawn as the lists draw them, each with its own status. Campaigns come in the board's
 * order (`byNumber`). With none, the page says so.
 */
@Component({
  selector: 'app-work-campaigns-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, CampaignSection],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Campaigns">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <div class="flex-col gap-12" [class]="campaigns().length ? 'flex' : 'hidden'">
            @for (campaign of campaigns(); track campaign.entry.id) {
              <app-campaign-section
                [entry]="campaign.entry"
                [members]="campaign.members"
                [description]="campaign.description"
                [base]="detailPath()"
              />
            }
          </div>
          <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="campaigns().length">
            No campaigns
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkCampaignsPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  /** Each open campaign with its description and its members. */
  protected readonly campaigns = computed(() => {
    const graph = this.work.graph();
    const descriptions = this.work.campaignDescriptions();
    return graph.openCampaigns().map((entry) => ({
      entry,
      description: (entry.id && descriptions[entry.id]) || '',
      members: graph.membersOf(entry),
    }));
  });

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
