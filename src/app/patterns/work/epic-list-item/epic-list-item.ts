import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finishControl } from '$core/work/finish-control';
import { movable, WorkReorders } from '$core/work/work-reorder';
import { taskDistribution, type WorkNode } from '$core/work/work-tree';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { FinishButton } from '$ui/components/finish-button/finish-button';
import { Leave } from '$ui/components/leave/leave';
import { ListLane } from '$ui/components/list/list-lane';
import { REORDER } from '$ui/components/reorder/reorder';
import { Tag } from '$ui/components/tag/tag';
import { MilestoneNeeds } from '$patterns/milestones/milestone-needs/milestone-needs';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import { FeatureListRow } from '$patterns/work/feature-list-row/feature-list-row';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * An epic in a list (Backlog, the board stacked, Acceptance, Archive, a campaign's members), with
 * its features and their tasks, drawn like the board:
 *
 * - the epic is a lane (`ui-list-lane`): its title in the bar at the top and its id up the left
 *   gutter, both linking to it, its campaigns as tags below the bar, and a Workspace tag while it
 *   has an ACTIVE workspace (`app-workspace-link`). It collapses to one line: in
 *   the Backlog "<n> tasks" and in Acceptance "<verified> / <n> ✅", expanded at first; in the
 *   Archive "<verified> / <n> ✅" for a done epic, or "<n> tasks" for a dropped one, collapsed at
 *   first; in a campaign "<verified> / <n> ✅" for a verified or done epic, else "<n> tasks",
 *   collapsed at first; on the board "<n> tasks", expanded at first. Every task below the epic counts, and a task is verified by its own status
 *   (VERIFIED or DONE): it may sit in another list than its epic;
 * - each feature is a row (`app-feature-list-row`): its title along the bottom, its id up the right
 *   gutter, each of its tasks the board's small card, with its campaigns.
 *
 * In the Archive the epic (unless it is only context) also shows its final state, in a campaign its
 * own status; on the board the epic, each feature and each task (unless only context) its own
 * status, which the board's columns would have shown (`statuses`, qits-1861). A VERIFIED epic in Acceptance (not in a campaign) carries the finish button ("Mark <id> done") on the lane's bottom-right corner:
 * it hides the epic at once and moves it to DONE a few seconds later, unless the toast's Undo takes
 * it back (`finishControl`).
 *
 * In the Backlog an open epic, feature or task (not context, not DONE or DROPPED) carries the drag
 * handle ("Move <id>", `ui-drag-handle`; qits-753): the epic on the lane's bottom-right corner, a
 * feature on its row's, a task on its card's; on the board the epic only, as `app-kanban-board`
 * drags it (qits-1861). The lane is an item (`uiReorderItem`) of the list it is drawn in, which
 * must be a `[uiReorderList]`; its features are a list of their own, and each feature's tasks
 * another (`app-feature-list-row`), enabled in the Backlog only. A drop there is sent as the item's
 * place among its drawn siblings (`WorkReorders`). Elsewhere the lists are disabled. When `leaving` is set, the
 * lane shrinks away (`uiLeave`), then emits `left`. Every item links to its page, `<base>/<qualified id>`. `display: contents`, so the lane
 * is itself the list's item.
 */
@Component({
  selector: 'app-epic-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ListLane,
    FeatureListRow,
    DragHandle,
    FinishButton,
    Leave,
    MilestoneNeeds,
    REORDER,
    Tag,
    WorkRef,
    WorkspaceLink,
  ],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    <ui-list-lane
      collapsible
      [collapsed]="collapsed()"
      uiReorderItem
      [reorderItemLabel]="n.entry.qualifiedId ?? ''"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      <span lane-summary>{{ summary() }}</span>
      <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
      @for (campaign of n.campaigns; track campaign.id) {
        <app-work-ref lane-tags [qualifiedId]="campaign.qualifiedId ?? ''" />
      }
      @if (status(); as status) {
        <ui-tag lane-tags [label]="status" />
      }
      <app-milestone-needs lane-tags [milestones]="n.entry.milestones" />
      <app-workspace-link lane-tags [workId]="n.entry.id" [qualifiedId]="n.entry.qualifiedId" />
      <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
      <ui-finish-button
        lane-action
        [shown]="finishing.shown() && view() !== 'campaign'"
        [state]="finishing.state()"
        [label]="'Mark ' + n.entry.qualifiedId + ' done'"
        (finish)="finishing.finish()"
      />
      <ui-drag-handle
        lane-action
        [shown]="draggable() && movable(n)"
        [label]="'Move ' + n.entry.qualifiedId"
      />
      @if (n.children.length) {
        <!-- The features, a list of their own: the same gap as the lane's own. -->
        <div
          class="flex flex-col gap-4"
          uiReorderList
          reorderLabel="Features"
          [reorderDisabled]="!reorderable()"
          (reordered)="reorders.move(n.children, $event)"
        >
          @for (feature of n.children; track feature.entry.id) {
            <app-feature-list-row
              [node]="feature"
              [base]="base()"
              [reorderable]="reorderable()"
              [statuses]="view() === 'board'"
            />
          }
        </div>
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
  protected readonly reorders = inject(WorkReorders);
  protected readonly movable = movable;

  /** Whether the epic itself can be dragged: in the Backlog and on the board (qits-753, qits-1861). */
  protected readonly draggable = computed(
    () => this.view() === 'backlog' || this.view() === 'board',
  );

  /** Whether its features and their tasks can be dragged: in the Backlog only (qits-753). */
  protected readonly reorderable = computed(() => this.view() === 'backlog');

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
   * In the Archive, which final state the epic is in; in a campaign and on the board, its own
   * status (statuses mix there, and the board's columns are not drawn).
   */
  protected readonly status = computed(() =>
    (this.view() === 'archive' || this.view() === 'campaign' || this.view() === 'board') &&
    !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
