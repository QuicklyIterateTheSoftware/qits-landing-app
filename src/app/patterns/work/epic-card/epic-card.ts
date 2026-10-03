import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import { taskDistribution, type WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { BoardCount } from '$ui/components/board/board-count';
import { BoardLane } from '$ui/components/board/board-lane';
import { BoardRow } from '$ui/components/board/board-row';
import { Leave } from '$ui/components/leave/leave';
import { Tag } from '$ui/components/tag/tag';

/**
 * An epic on the board, with its features and their tasks:
 *
 * - the epic is a lane (`ui-board-lane`): its title in the bar at the top and its id up the gutter,
 *   both linking to it, its campaigns as tags below the bar. It collapses to where its tasks are:
 *   a count tile (`ui-board-count`) in each column that holds any, and one in the right gutter for
 *   the verified ones (none for a column without tasks); "No tasks" when it has none. Expanded at
 *   first;
 * - each feature is a row of that lane (`ui-board-row`), its title along the bottom and its id up
 *   the right gutter;
 * - each task is a card (`ui-board-card`) in its column of the feature's row, with its campaigns.
 *
 * A VERIFIED epic is not on the board: it waits in the Acceptance list (`epic-list-item`), with
 * its finish button. When `leaving` is set (the epic left the board), the lane shrinks away
 * (`uiLeave`), then emits `left`. Every item links to its page, `<base>/<qualified id>`. `display: contents`, so the lane
 * is itself the grid item of the board.
 */
@Component({
  selector: 'app-epic-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BoardLane, BoardRow, BoardCard, BoardCount, Leave, Tag],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    <ui-board-lane collapsible [uiLeave]="leaving()" (left)="left.emit()">
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
        <ui-tag lane-tags [label]="campaign.title ?? ''" />
      }
      <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
      @for (feature of n.children; track feature.entry.id) {
        <ui-board-row>
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
                    <ui-tag [label]="campaign.title ?? ''" />
                  }
                </div>
              }
            </ui-board-card>
          }
          <span row-id class="font-mono">{{ feature.entry.qualifiedId }}</span>
          <a row-footer [routerLink]="base() + '/' + feature.entry.qualifiedId">{{
            feature.entry.title
          }}</a>
        </ui-board-row>
      }
    </ui-board-lane>
  `,
})
export class EpicCard {
  /** The epic's node: its children are its features, theirs its tasks. */
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  /** The epic is leaving the board: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  /** The collapsed lane's tiles: one per column with tasks, then the verified ones' in the gutter. */
  protected readonly tiles = computed(() => {
    const { columns, verified } = taskDistribution(this.node());
    const tiles: { column: number | 'gutter'; count: number; label: string }[] = columns.map(
      (count, column) => ({ column, count, label: BOARD_COLUMNS[column].label.toLowerCase() }),
    );
    tiles.push({ column: 'gutter', count: verified, label: 'verified' });
    return tiles.filter((tile) => tile.count > 0);
  });

  protected border(task: WorkNode): string {
    return BOARD_COLUMNS[task.column ?? 0]?.cardBorder ?? 'border-charcoal-brown-200';
  }
}
