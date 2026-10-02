import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { startsCollapsed, taskProgress, type WorkNode } from '../../../core/work/work-tree';
import { BOARD_COLUMNS } from '../../../core/work/work-statuses';
import { BoardCard } from '../../../ui/components/board/board-card';
import { BoardLane } from '../../../ui/components/board/board-lane';
import { BoardRow } from '../../../ui/components/board/board-row';
import { Tag } from '../../../ui/components/tag/tag';

/**
 * One node of the work tree on the board:
 *
 * - an epic is a lane across the whole board (`ui-board-lane`): its title in the bar at the top,
 *   its campaigns as tags at the top right, its id written up the gutter;
 * - a feature is a row of that lane across the status columns (`ui-board-row`), its id up the
 *   row's left edge and its title along the bottom;
 * - anything else (a task, a ticket) is a card (`ui-board-card`) in its column.
 *
 * Every one links to the item's page, `<base>/<qualified id>`. `display: contents`, so the lane,
 * row or card is itself the grid item of the board, lane or row it is in.
 */
@Component({
  selector: 'app-work-board-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BoardLane, BoardRow, BoardCard, Tag, WorkBoardNode],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    @switch (n.entry.archetype) {
      @case ('EPIC') {
        <ui-board-lane collapsible [collapsed]="collapsed(n)">
          <span lane-summary>{{ summary(n) }}</span>
          <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
          @for (campaign of n.campaigns; track campaign.id) {
            <ui-tag lane-tags [label]="campaign.title ?? ''" />
          }
          <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
          @for (child of n.children; track child.entry.id) {
            <app-work-board-node [node]="child" [base]="base()" />
          }
        </ui-board-lane>
      }
      @case ('FEATURE') {
        <ui-board-row>
          @for (child of n.children; track child.entry.id) {
            <app-work-board-node [node]="child" [base]="base()" />
          }
          <span row-id class="font-mono">{{ n.entry.qualifiedId }}</span>
          <a row-footer [routerLink]="link">{{ n.entry.title }}</a>
        </ui-board-row>
      }
      @default {
        <ui-board-card
          [column]="n.column ?? 0"
          [code]="n.entry.qualifiedId ?? ''"
          [title]="n.entry.title ?? ''"
          [kind]="n.entry.archetype?.toLowerCase() ?? ''"
          [border]="border(n.column ?? 0)"
          [link]="link"
        >
          @if (n.campaigns.length) {
            <div class="mt-1 flex flex-wrap gap-1">
              @for (campaign of n.campaigns; track campaign.id) {
                <ui-tag [label]="campaign.title ?? ''" />
              }
            </div>
          }
        </ui-board-card>
      }
    }
  `,
})
export class WorkBoardNode {
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();

  protected collapsed(n: WorkNode): boolean {
    return startsCollapsed(n);
  }

  protected summary(n: WorkNode): string {
    const { verified, total } = taskProgress(n);
    return `${verified} / ${total} ✅`;
  }

  protected border(column: number): string {
    return BOARD_COLUMNS[column]?.cardBorder ?? 'border-charcoal-brown-200';
  }
}
