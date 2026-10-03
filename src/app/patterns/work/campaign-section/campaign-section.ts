import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { WorkEntry } from '$core/work/work.consumes';
import type { WorkNode } from '$core/work/work-tree';
import { Tag } from '$ui/components/tag/tag';
import { WorkList } from '$patterns/work/work-list/work-list';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';

/**
 * One campaign, as the Campaigns page and the Archive draw it: its id, its title (a heading of
 * `level`, linking to its page), its status, the start of its description, and its members in
 * campaign order, drawn as the lists draw them (`app-work-list`, view `campaign`). Next to its
 * status, a Workspace tag while it has an ACTIVE workspace (`app-workspace-link`). `display:
 * contents`, so the section is itself the list's item.
 */
@Component({
  selector: 'app-campaign-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Tag, WorkList, WorkspaceLink],
  host: { class: 'contents' },
  template: `
    <section class="flex flex-col gap-8" [attr.aria-label]="entry().title">
      <header class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs text-charcoal-brown-500">{{ entry().qualifiedId }}</span>
          <div role="heading" [attr.aria-level]="level()" class="m-0 text-lg font-semibold">
            <a
              class="text-charcoal-brown-900 no-underline hover:underline"
              [routerLink]="base() + '/' + entry().qualifiedId"
              >{{ entry().title }}</a
            >
          </div>
          <ui-tag [label]="status()" [class.hidden]="!status()" />
          <app-workspace-link [workId]="entry().id" [qualifiedId]="entry().qualifiedId" />
        </div>
        <p
          class="m-0 line-clamp-2 max-w-[48rem] text-sm text-charcoal-brown-600"
          [class.hidden]="!description()"
        >
          {{ description() }}
        </p>
      </header>
      <app-work-list [tree]="members()" [base]="base()" view="campaign" />
    </section>
  `,
})
export class CampaignSection {
  readonly entry = input.required<WorkEntry>();
  /** Its members, in campaign order (`WorkGraph.membersOf`). */
  readonly members = input.required<readonly WorkNode[]>();
  readonly description = input('');
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  /** The title's heading level: 2 on its own page, 3 under the Archive's "Campaigns". */
  readonly level = input(2);

  protected readonly status = computed(() => this.entry().status?.toLowerCase() ?? '');
}
