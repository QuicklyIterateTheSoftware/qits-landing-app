import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { finishControl } from '$core/work/finish-control';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { FinishButton } from '$ui/components/finish-button/finish-button';
import { Leave } from '$ui/components/leave/leave';
import { Tag } from '$ui/components/tag/tag';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * A ticket in a list (Backlog, Acceptance, Archive, a campaign's members): the board's small card
 * (`ui-board-card`), its id down the left edge, its title linking to it, its kind and its
 * campaigns as tags, and a Workspace bubble in its bottom-right corner while it has an ACTIVE
 * workspace (`app-workspace-link`). In the Archive it also shows its final state (Done and Dropped mix there), in
 * a campaign its own status (any phase). A campaign's member that is not a ticket (a feature or
 * task) is drawn the same way.
 *
 * A VERIFIED ticket (in Acceptance) carries the finish button ("Mark <id> done") on the card's
 * bottom-right corner: it hides the ticket at once and moves it to DONE a few seconds later, unless
 * the toast's Undo takes it back (`finishControl`); not in a campaign, where finishing is not
 * the page's job. When `leaving` is set, the card shrinks away
 * (`uiLeave`), then emits `left`. `display: contents`, so the card is itself the list's item.
 */
@Component({
  selector: 'app-ticket-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, FinishButton, Leave, Tag, WorkRef, WorkspaceLink],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [link]="base() + '/' + n.entry.qualifiedId"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (n.campaigns.length || status()) {
        <div class="mt-1 flex flex-wrap gap-1">
          @for (campaign of n.campaigns; track campaign.id) {
            <app-work-ref [qualifiedId]="campaign.qualifiedId ?? ''" />
          }
          @if (status(); as status) {
            <ui-tag [label]="status" />
          }
        </div>
      }
      <app-workspace-link
        card-corner
        variant="corner"
        [workId]="n.entry.id"
        [qualifiedId]="n.entry.qualifiedId"
      />
      <ui-finish-button
        card-action
        [shown]="finishing.shown() && view() !== 'campaign'"
        [state]="finishing.state()"
        [label]="'Mark ' + n.entry.qualifiedId + ' done'"
        (finish)="finishing.finish()"
      />
    </ui-board-card>
  `,
})
export class TicketListItem {
  readonly node = input.required<WorkNode>();
  /** The path items' pages are below, e.g. `/projects/qits/work/detail`. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();
  /** The ticket is leaving the list: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly finishing = finishControl(this.node);

  /**
   * In the Archive, which final state the ticket is in; in a campaign, its own status (statuses
   * mix there).
   */
  protected readonly status = computed(() =>
    (this.view() === 'archive' || this.view() === 'campaign') && !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
