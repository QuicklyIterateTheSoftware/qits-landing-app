import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { finishControl } from '$core/work/finish-control';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { FinishButton } from '$ui/components/finish-button/finish-button';
import { Leave } from '$ui/components/leave/leave';
import { Tag } from '$ui/components/tag/tag';

/**
 * A ticket on the board: a card (`ui-board-card`) in its column, its id down the left edge, its
 * title linking to it, its kind, and its campaigns as tags.
 *
 * A VERIFIED ticket carries the finish button ("Mark <id> done") on the card's bottom-right
 * corner: it hides the ticket at once and moves it to DONE a few seconds later, unless the toast's
 * Undo takes it back (`finishControl`). When `leaving` is set, the card shrinks away (`uiLeave`),
 * then emits `left`. `display: contents`, so the card is itself the grid item of the board.
 */
@Component({
  selector: 'app-ticket-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, FinishButton, Leave, Tag],
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
      <ui-finish-button
        card-action
        [shown]="finishing.shown()"
        [state]="finishing.state()"
        [label]="'Mark ' + n.entry.qualifiedId + ' done'"
        (finish)="finishing.finish()"
      />
    </ui-board-card>
  `,
})
export class TicketCard {
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  /** The ticket is leaving the board: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly finishing = finishControl(this.node);

  protected readonly border = computed(
    () => BOARD_COLUMNS[this.node().column ?? 0]?.cardBorder ?? 'border-charcoal-brown-200',
  );
}
