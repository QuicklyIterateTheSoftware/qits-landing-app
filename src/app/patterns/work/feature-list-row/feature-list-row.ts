import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { movable, WorkReorders } from '$core/work/work-reorder';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { ListRow } from '$ui/components/list/list-row';
import { REORDER } from '$ui/components/reorder/reorder';
import { Tag } from '$ui/components/tag/tag';
import { MilestoneNeeds } from '$patterns/milestones/milestone-needs/milestone-needs';
import { needsMilestone } from '$core/milestones/milestone-criteria';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';

/**
 * A feature in a list, as an epic's lane (`app-epic-list-item`) and a work item's page draw it: a
 * row (`ui-list-row`) with its title along the bottom and its id up the right gutter, and each of
 * its tasks as the board's small card, with its campaigns. While the feature or a task has an
 * ACTIVE workspace, a Workspace link (`app-workspace-link`): at the right end of the title's line,
 * in the card's bottom-right corner. Every item links to its page,
 * `<base>/<qualified id>`. `display: contents`, so the row is itself the list's item.
 *
 * The row is an item (`uiReorderItem`) of the list it is drawn in, which must be a
 * `[uiReorderList]` (an epic's features, `app-epic-list-item`; a disabled one on a work item's
 * page), and its tasks are a list of their own. With `reorderable` (the Backlog, qits-753), an open
 * feature or task (not context, not DONE or DROPPED) carries the drag handle ("Move <id>",
 * `ui-drag-handle`): the feature on its row's bottom-right corner, a task on its card's; a drop
 * among the tasks is sent as the task's place among them (`WorkReorders`).
 *
 * With `statuses` (the board stacked, qits-1861), the feature and each task (unless only context)
 * show their own status as a tag (`ui-tag`), which the board's columns would have shown: the
 * feature's after its title, a task's among its card's tags.
 *
 * Outside a lane, the parent leaves the row's right gutter free (`pr-6`) and sets the lane's chin
 * (`[--lane-chin:--spacing(4)]`).
 */
@Component({
  selector: 'app-feature-list-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ListRow,
    BoardCard,
    DragHandle,
    MilestoneNeeds,
    REORDER,
    Tag,
    WorkRef,
    WorkspaceLink,
  ],
  host: { class: 'contents' },
  template: `
    @let feature = node();
    <ui-list-row uiReorderItem [reorderItemLabel]="feature.entry.qualifiedId ?? ''">
      @if (feature.children.length) {
        <!-- The tasks, a list of their own: the same gap as the row's own. -->
        <div
          class="flex flex-col gap-y-2"
          uiReorderList
          reorderLabel="Tasks"
          [reorderDisabled]="!reorderable()"
          (reordered)="reorders.move(feature.children, $event)"
        >
          @for (task of feature.children; track task.entry.id) {
            <ui-board-card
              [code]="task.entry.qualifiedId ?? ''"
              [title]="task.entry.title ?? ''"
              [kind]="task.entry.archetype?.toLowerCase() ?? ''"
              [link]="base() + '/' + task.entry.qualifiedId"
              uiReorderItem
              [reorderItemLabel]="task.entry.qualifiedId ?? ''"
            >
              @let taskStatus = status(task);
              @if (task.campaigns.length || taskStatus || needsMilestone(task.entry)) {
                <div class="mt-1 flex flex-wrap gap-1">
                  @for (campaign of task.campaigns; track campaign.id) {
                    <app-work-ref [qualifiedId]="campaign.qualifiedId ?? ''" />
                  }
                  @if (taskStatus) {
                    <ui-tag [label]="taskStatus" />
                  }
                  <app-milestone-needs [milestones]="task.entry.milestones" />
                </div>
              }
              <app-workspace-link
                card-corner
                variant="corner"
                [workId]="task.entry.id"
                [qualifiedId]="task.entry.qualifiedId"
              />
              <ui-drag-handle
                card-action
                [shown]="reorderable() && movable(task)"
                [label]="'Move ' + task.entry.qualifiedId"
              />
            </ui-board-card>
          }
        </div>
      }
      <span row-id class="font-mono">{{ feature.entry.qualifiedId }}</span>
      <a row-footer [routerLink]="base() + '/' + feature.entry.qualifiedId">{{
        feature.entry.title
      }}</a>
      @if (status(feature); as featureStatus) {
        <ui-tag row-footer class="shrink-0" [label]="featureStatus" />
      }
      <app-workspace-link
        row-footer-end
        [workId]="feature.entry.id"
        [qualifiedId]="feature.entry.qualifiedId"
      />
      <ui-drag-handle
        row-action
        [shown]="reorderable() && movable(feature)"
        [label]="'Move ' + feature.entry.qualifiedId"
      />
    </ui-list-row>
  `,
})
export class FeatureListRow {
  /** Whether a task needs a milestone that is not met yet: its marks then show (epic qits-615). */
  protected readonly needsMilestone = needsMilestone;

  /** The feature's node: its children are its tasks. */
  readonly node = input.required<WorkNode>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  /** Shows the drag handles and enables the tasks' list: in the Backlog (qits-753). */
  readonly reorderable = input(false, { transform: booleanAttribute });
  /** Shows the feature's and each task's own status: on the board stacked (qits-1861). */
  readonly statuses = input(false, { transform: booleanAttribute });

  protected readonly reorders = inject(WorkReorders);
  protected readonly movable = movable;

  /** `node`'s own status, lower case, with `statuses` and unless it is only context. */
  protected status(node: WorkNode): string | undefined {
    return this.statuses() && !node.context ? node.entry.status?.toLowerCase() : undefined;
  }
}
