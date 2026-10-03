import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { Tag } from '$ui/components/tag/tag';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * A project's campaigns, at `/projects/<slug>/work/campaigns`. A campaign gathers epics and
 * tickets from every phase, so it has no place in a phase's list; here each one shows its title
 * (linking to its page), its status, the start of its description, and its members in campaign
 * order, drawn as the lists draw them, each with its own status. Campaigns come in the board's
 * order (`byNumber`). With none, the page says so.
 */
@Component({
  selector: 'app-work-campaigns-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, RouterLink, Spinner, Tag, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Campaigns">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <div class="flex-col gap-12" [class]="campaigns().length ? 'flex' : 'hidden'">
            @for (campaign of campaigns(); track campaign.entry.id) {
              <section class="flex flex-col gap-8" [attr.aria-label]="campaign.entry.title">
                <header class="flex flex-col gap-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono text-xs text-charcoal-brown-500">{{
                      campaign.entry.qualifiedId
                    }}</span>
                    <h2 class="m-0 text-lg font-semibold">
                      <a
                        class="text-charcoal-brown-900 no-underline hover:underline"
                        [routerLink]="detailPath() + '/' + campaign.entry.qualifiedId"
                        >{{ campaign.entry.title }}</a
                      >
                    </h2>
                    <ui-tag [label]="campaign.status" [class.hidden]="!campaign.status" />
                  </div>
                  <p
                    class="m-0 line-clamp-2 max-w-[48rem] text-sm text-charcoal-brown-600"
                    [class.hidden]="!campaign.description"
                  >
                    {{ campaign.description }}
                  </p>
                </header>
                <app-work-list [tree]="campaign.members" [base]="detailPath()" view="campaign" />
              </section>
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

  /** Each campaign with its status word, its description and its members. */
  protected readonly campaigns = computed(() => {
    const graph = this.work.graph();
    const descriptions = this.work.campaignDescriptions();
    return graph.campaigns().map((entry) => ({
      entry,
      status: entry.status?.toLowerCase() ?? '',
      description: (entry.id && descriptions[entry.id]) || '',
      members: graph.membersOf(entry),
    }));
  });

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
