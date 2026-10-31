import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import { movable } from '$core/work/work-reorder';
import { taskDistribution, type WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { BoardCount } from '$ui/components/board/board-count';
import { BoardLane } from '$ui/components/board/board-lane';
import { BoardRow } from '$ui/components/board/board-row';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { Leave } from '$ui/components/leave/leave';
import { ReorderItem } from '$ui/components/reorder/reorder';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';

/**
 * An epic on the board, with its features and their tasks:
 *
 * - the epic is a lane (`ui-board-lane`): its title in the bar at the top and its id up the gutter,
 *   both linking to it, its campaigns as tags below the bar, and a Workspace tag while it has an
 *   ACTIVE workspace (`app-workspace-link`). It collapses to where its tasks are:
 *   a count tile (`ui-board-count`) in each column that holds any, and one in the right gutter for
 *   its tasks whose own status is VERIFIED or DONE (they are off the board, in Acceptance or the
 *   Archive); none for a column without tasks; "No tasks" when it has none. Expanded at first;
 * - each feature is a row of that lane (`ui-board-row`), its title along the bottom and its id up
 *   the right gutter, below the id a count tile for its tasks past the board (VERIFIED or DONE),
 *   when it has any: so a feature whose tasks are all verified does not look empty; a Workspace
 *   tag at the right end of its title's line while it has an ACTIVE workspace;
 * - each task is a card (`ui-board-card`) in its column of the feature's row, with its campaigns,
 *   and a Workspace bubble in its bottom-right corner while it has an ACTIVE workspace.
 *
 * The lane is an item (`uiReorderItem`) of the board's reorder list (`app-kanban-board`,
 * qits-753), and an open epic (not context) carries the drag handle ("Move <id>",
 * `ui-drag-handle`) on the lane's bottom-right corner. Its features and tasks are not dragged on
 * the board.
 *
 * A VERIFIED epic is not on the board: it waits in the Acceptance list (`epic-list-item`), with
 * its finish button. When `leaving` is set (the epic left the board), the lane shrinks away
 * (`uiLeave`), then emits `left`. Every item links to its page, `<base>/<qualified id>`. `display: contents`, so the lane
 * is itself the grid item of the board.
 */
@Component({
  selector: 'app-epic-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BoardLane,
    BoardRow,
    BoardCard,
    BoardCount,
    DragHandle,
    Leave,
    ReorderItem,
    WorkRef,
    WorkspaceLink,
  ],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    <ui-board-lane
      collapsible
      uiReorderItem
      [reorderItemLabel]="n.entry.qualifiedId ?? ''"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      <ui-drag-handle lane-action [shown]="movable(n)" [label]="'Move ' + n.entry.qualifiedId" />
      @for (tile of tiles(); track tile.column) {
        <ui-board-count
          lane-summary
          [column]="tile.column"
          [count]="tile.count"
          [label]="tile.label"
        />
      } @empty {
        <span lane-summary>No tasks</span>
      }
      <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
      @for (campaign of n.campaigns; track campaign.id) {
        <app-work-ref lane-tags [qualifiedId]="campaign.qualifiedId ?? ''" />
      }
      <app-workspace-link lane-tags [workId]="n.entry.id" [qualifiedId]="n.entry.qualifiedId" />
      <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
      @for (feature of n.children; track feature.entry.id) {
        <ui-board-row [idLength]="feature.entry.qualifiedId?.length ?? 0">
          @for (task of feature.children; track task.entry.id) {
            <ui-board-card
              [column]="task.column ?? 0"
              [code]="task.entry.qualifiedId ?? ''"
              [title]="task.entry.title ?? ''"
              [kind]="task.entry.archetype?.toLowerCase() ?? ''"
              [border]="border(task)"
              [link]="base() + '/' + task.entry.qualifiedId"
            >
              @if (task.campaigns.length) {
                <div class="mt-1 flex flex-wrap gap-1">
                  @for (campaign of task.campaigns; track campaign.id) {
                    <app-work-ref [qualifiedId]="campaign.qualifiedId ?? ''" />
                  }
                </div>
              }
              <app-workspace-link
                card-corner
                variant="corner"
                [workId]="task.entry.id"
                [qualifiedId]="task.entry.qualifiedId"
              />
            </ui-board-card>
          }
          @if (verified(feature); as count) {
            <ui-board-count row-gutter column="gutter" [count]="count" label="verified" />
          }
          <span row-id class="font-mono">{{ feature.entry.qualifiedId }}</span>
          <a row-footer [routerLink]="base() + '/' + feature.entry.qualifiedId">{{
            feature.entry.title
          }}</a>
          <app-workspace-link
            row-footer-end
            [workId]="feature.entry.id"
            [qualifiedId]="feature.entry.qualifiedId"
          />
        </ui-board-row>
      }
    </ui-board-lane>
  `,
})
export class EpicCard {
  /** The epic's node: its children are its features, theirs its tasks. */
  readonly node = input.required<WorkNode>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  /** The epic is leaving the board: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly movable = movable;

  /** The collapsed lane's tiles: one per column with tasks, then the verified ones' in the gutter. */
  protected readonly tiles = computed(() => {
    const { columns, verified } = taskDistribution(this.node());
    const tiles: { column: number | 'gutter'; count: number; label: string }[] = columns.map(
      (count, column) => ({ column, count, label: BOARD_COLUMNS[column].label.toLowerCase() }),
    );
    tiles.push({ column: 'gutter', count: verified, label: 'verified' });
    return tiles.filter((tile) => tile.count > 0);
  });

  /** A feature's tasks past the board (own status VERIFIED or DONE): its row's gutter tile. */
  protected verified(feature: WorkNode): number {
    return taskDistribution(feature).verified;
  }

  protected border(task: WorkNode): string {
    return BOARD_COLUMNS[task.column ?? 0]?.cardBorder ?? 'border-charcoal-brown-200';
  }
}
