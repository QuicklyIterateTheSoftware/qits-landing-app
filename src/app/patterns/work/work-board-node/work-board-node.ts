import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WorkNode } from '../../../core/work/work-tree';
import { BOARD_COLUMNS } from '../../../core/work/work-statuses';
import { BoardCard } from '../../../ui/components/board/board-card';
import { BoardLane } from '../../../ui/components/board/board-lane';

/**
 * One node of the work tree on the board: a lane (`ui-board-lane`, spanning its columns) when it
 * has children, which it renders recursively, else a card (`ui-board-card`) in its column.
 *
 * `display: contents`, so the lane or card is itself the grid item of the board or lane it is in.
 */
@Component({
  selector: 'app-work-board-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardLane, BoardCard, WorkBoardNode],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @if (n.children.length) {
      <ui-board-lane [from]="n.span?.[0] ?? 0" [to]="n.span?.[1] ?? 0" [muted]="n.context">
        <span lane-header class="font-mono">{{ n.entry.qualifiedId }}</span>
        <span lane-header class="min-w-0 flex-1 truncate">{{ n.entry.title }}</span>
        <span lane-header class="opacity-70">{{ n.entry.archetype?.toLowerCase() }}</span>
        @for (child of n.children; track child.entry.id) {
          <app-work-board-node [node]="child" />
        }
      </ui-board-lane>
    } @else {
      <ui-board-card
        [column]="n.column ?? 0"
        [code]="n.entry.qualifiedId ?? ''"
        [title]="n.entry.title ?? ''"
        [kind]="n.entry.archetype?.toLowerCase() ?? ''"
        [border]="border(n.column ?? 0)"
      />
    }
  `,
})
export class WorkBoardNode {
  readonly node = input.required<WorkNode>();

  protected border(column: number): string {
    return BOARD_COLUMNS[column]?.cardBorder ?? 'border-charcoal-brown-200';
  }
}
