import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { Leave } from '$ui/components/leave/leave';
import { Tag } from '$ui/components/tag/tag';

/**
 * A ticket on the board: a card (`ui-board-card`) in its column, its id down the left edge, its
 * title linking to it, its kind, and its campaigns as tags. A VERIFIED ticket is not on the board:
 * it waits in the Acceptance list (`ticket-list-item`), with its finish button.
 *
 * When `leaving` is set (the ticket left the board), the card shrinks away (`uiLeave`), then emits
 * `left`. `display: contents`, so the card is itself the grid item of the board.
 */
@Component({
  selector: 'app-ticket-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, Leave, Tag],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [column]="n.column ?? 0"
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [border]="border()"
      [link]="base() + '/' + n.entry.qualifiedId"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (n.campaigns.length) {
        <div class="mt-1 flex flex-wrap gap-1">
          @for (campaign of n.campaigns; track campaign.id) {
            <ui-tag [label]="campaign.title ?? ''" />
          }
        </div>
      }
    </ui-board-card>
  `,
})
export class TicketCard {
  readonly node = input.required<WorkNode>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  /** The ticket is leaving the board: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly border = computed(
    () => BOARD_COLUMNS[this.node().column ?? 0]?.cardBorder ?? 'border-charcoal-brown-200',
  );
}
