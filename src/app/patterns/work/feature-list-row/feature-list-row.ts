import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { movable, WorkReorders } from '$core/work/work-reorder';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { ListRow } from '$ui/components/list/list-row';
import { REORDER } from '$ui/components/reorder/reorder';
import { Tag } from '$ui/components/tag/tag';
import { hasUnmetNeeds } from '$core/work/work-needs';
import { WorkNeedsBadge } from '$patterns/work/work-needs/work-needs-badge';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import { WORK_MARKS } from '$core/work/work-marks';

/**
 * A feature in a list, as an epic's lane (`app-epic-list-item`) and a work item's page draw it: a
 * row (`ui-list-row`) with its title along the bottom and its id up the right gutter, and each of
 * its tasks as the board's small card, with its "needs" badge (`app-work-needs`, epic qits-1899).
 * While the feature or a task has an
 * ACTIVE workspace, a Workspace link (`app-workspace-link`): at the right end of the title's line,
 * in the card's bottom-right corner. Every item links to its page,
 * `/projects/<slug>/work/detail/<qualified id>`, through a declared exit (`open-feature-list-row`,
 * epic qits-2000): `feature` (its title) and `task` (a card). `display: contents`, so the row is itself the list's item.
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
  imports: [QitsExit, ListRow, BoardCard, DragHandle, REORDER, Tag, WorkNeedsBadge, WorkspaceLink],
  host: { class: 'contents' },
  template: `
    @let feature = node();
    <ui-list-row
      [attr.data-qits-source]="marks.source"
      [attr.data-qits-item]="marks.item(feature.entry)"
      uiReorderItem
      [reorderItemLabel]="feature.entry.qualifiedId ?? ''"
    >
      @if (feature.children.length) {
        <!-- The tasks, a list of their own: the same gap as the row's own. -->
        <div
          class="flex flex-col gap-y-2"
          [attr.data-qits-source]="marks.source"
          uiReorderList
          reorderLabel="Tasks"
          [reorderDisabled]="!reorderable()"
          (reordered)="reorders.move(feature.children, $event)"
        >
          @for (task of feature.children; track task.entry.id) {
            <ui-board-card
              [attr.data-qits-source]="marks.source"
              [attr.data-qits-item]="marks.item(task.entry)"
              data-qits-derived="qualifiedId title archetype"
              [code]="task.entry.qualifiedId ?? ''"
              [title]="task.entry.title ?? ''"
              [kind]="task.entry.archetype?.toLowerCase() ?? ''"
              [exit]="opening.task"
              [exitParams]="{ slug: slug(), id: task.entry.qualifiedId ?? '' }"
              uiReorderItem
              [reorderItemLabel]="task.entry.qualifiedId ?? ''"
            >
              @let taskStatus = status(task);
              @if (taskStatus || hasUnmetNeeds(task.entry)) {
                <div class="mt-1 flex flex-wrap gap-1">
                  @if (taskStatus) {
                    <ui-tag data-qits-derived="status" [label]="taskStatus" />
                  }
                  <app-work-needs
                    data-qits-derived="needs unmetNeeds"
                    [needs]="task.entry.needs"
                    [unmet]="task.entry.unmetNeeds"
                  />
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
                data-qits-derived="qualifiedId"
                [shown]="reorderable() && movable(task)"
                [label]="'Move ' + task.entry.qualifiedId"
              />
            </ui-board-card>
          }
        </div>
      }
      <span row-id class="font-mono" data-qits-field="qualifiedId">{{
        feature.entry.qualifiedId
      }}</span>
      <a
        row-footer
        data-qits-field="title"
        [qitsExit]="opening.feature"
        [exitParams]="{ slug: slug(), id: feature.entry.qualifiedId ?? '' }"
        >{{ feature.entry.title }}</a
      >
      @if (status(feature); as featureStatus) {
        <ui-tag row-footer class="shrink-0" data-qits-derived="status" [label]="featureStatus" />
      }
      <app-workspace-link
        row-footer-end
        [workId]="feature.entry.id"
        [qualifiedId]="feature.entry.qualifiedId"
      />
      <ui-drag-handle
        row-action
        data-qits-derived="qualifiedId"
        [shown]="reorderable() && movable(feature)"
        [label]="'Move ' + feature.entry.qualifiedId"
      />
    </ui-list-row>
  `,
})
export class FeatureListRow {
  /** The data marks of the work it draws (`work-marks.ts`). */
  protected readonly marks = WORK_MARKS;

  /** Whether a task needs an item not at its status yet: its badge then shows (epic qits-1899). */
  protected readonly hasUnmetNeeds = hasUnmetNeeds;

  /** The feature's node: its children are its tasks. */
  readonly node = input.required<WorkNode>();
  /** Shows the drag handles and enables the tasks' list: in the Backlog (qits-753). */
  readonly reorderable = input(false, { transform: booleanAttribute });
  /** Shows the feature's and each task's own status: on the board stacked (qits-1861). */
  readonly statuses = input(false, { transform: booleanAttribute });

  protected readonly reorders = inject(WorkReorders);
  protected readonly movable = movable;

  protected readonly opening = outcomes('open-feature-list-row', {
    feature: exit('projects/:slug/work/detail/:id'),
    task: exit('projects/:slug/work/detail/:id'),
  });

  private readonly selected = inject(SelectedProject);
  /** The open project's slug, for the items' pages. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** `node`'s own status, lower case, with `statuses` and unless it is only context. */
  protected status(node: WorkNode): string | undefined {
    return this.statuses() && !node.context ? node.entry.status?.toLowerCase() : undefined;
  }
}
