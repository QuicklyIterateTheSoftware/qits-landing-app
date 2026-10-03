import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finishControl } from '$core/work/finish-control';
import { taskDistribution, type WorkNode } from '$core/work/work-tree';
import { FinishButton } from '$ui/components/finish-button/finish-button';
import { Leave } from '$ui/components/leave/leave';
import { ListLane } from '$ui/components/list/list-lane';
import { Tag } from '$ui/components/tag/tag';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * An epic in a list (Backlog, Acceptance, Archive, a campaign's members), with its features and their tasks, drawn like
 * the board:
 *
 * - the epic is a lane (`ui-list-lane`): its title in the bar at the top and its id up the left
 *   gutter, both linking to it, its campaigns as tags below the bar. It collapses to one line: in
 *   the Backlog "<n> tasks" and in Acceptance "<verified> / <n> ✅", expanded at first; in the
 *   Archive "<verified> / <n> ✅" for a done epic, or "<n> tasks" for a dropped one, collapsed at
 *   first; in a campaign "<verified> / <n> ✅" for a verified or done epic, else "<n> tasks",
 *   collapsed at first. Every task below the epic counts, and a task is verified by its own status
 *   (VERIFIED or DONE): it may sit in another list than its epic;
 * - each feature is a row (`app-feature-list-row`): its title along the bottom, its id up the right
 *   gutter, each of its tasks the board's small card, with its campaigns.
 *
 * In the Archive the epic (unless it is only context) also shows its final state, in a campaign its
 * own status. A VERIFIED epic in Acceptance (not in a campaign) carries the finish button ("Mark <id> done") on the lane's bottom-right corner:
 * it hides the epic at once and moves it to DONE a few seconds later, unless the toast's Undo takes
 * it back (`finishControl`). When `leaving` is set, the lane shrinks away (`uiLeave`), then emits
 * `left`. Every item links to its page, `<base>/<qualified id>`. `display: contents`, so the lane
 * is itself the list's item.
 */
@Component({
  selector: 'app-epic-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ListLane, FeatureListRow, FinishButton, Leave, Tag, WorkRef],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    <ui-list-lane collapsible [collapsed]="collapsed()" [uiLeave]="leaving()" (left)="left.emit()">
      <span lane-summary>{{ summary() }}</span>
      <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
      @for (campaign of n.campaigns; track campaign.id) {
        <app-work-ref lane-tags [qualifiedId]="campaign.qualifiedId ?? ''" />
      }
      @if (status(); as status) {
        <ui-tag lane-tags [label]="status" />
      }
      <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
      <ui-finish-button
        lane-action
        [shown]="finishing.shown() && view() !== 'campaign'"
        [state]="finishing.state()"
        [label]="'Mark ' + n.entry.qualifiedId + ' done'"
        (finish)="finishing.finish()"
      />
      @for (feature of n.children; track feature.entry.id) {
        <app-feature-list-row [node]="feature" [base]="base()" />
      }
    </ui-list-lane>
  `,
})
export class EpicListItem {
  /** The epic's node: its children are its features, theirs its tasks. */
  readonly node = input.required<WorkNode>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();
  /** The epic is leaving the list: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly finishing = finishControl(this.node);

  /** Whether the lane starts collapsed: in the Archive and in a campaign. */
  protected readonly collapsed = computed(
    () => this.view() === 'archive' || this.view() === 'campaign',
  );

  protected readonly summary = computed(() => {
    const { total, verified } = taskDistribution(this.node());
    const tasks = `${total} ${total === 1 ? 'task' : 'tasks'}`;
    const status = this.node().entry.status;
    const done =
      (this.view() === 'acceptance' && status === 'VERIFIED') ||
      (this.view() === 'archive' && status === 'DONE') ||
      (this.view() === 'campaign' && (status === 'VERIFIED' || status === 'DONE'));
    return done ? `${verified} / ${total} ✅` : tasks;
  });

  /**
   * In the Archive, which final state the epic is in; in a campaign, its own status (statuses
   * mix there).
   */
  protected readonly status = computed(() =>
    (this.view() === 'archive' || this.view() === 'campaign') && !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
