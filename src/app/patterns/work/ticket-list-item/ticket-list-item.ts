import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { movable } from '$core/work/work-reorder';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { Leave } from '$ui/components/leave/leave';
import { ReorderItem } from '$ui/components/reorder/reorder';
import { Tag } from '$ui/components/tag/tag';
import { unmetOf } from '$core/milestones/milestone-criteria';
import { MilestoneNeeds } from '$patterns/milestones/milestone-needs/milestone-needs';
import { WorkRef } from '$patterns/work/work-ref/work-ref';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * A ticket in a list (Backlog, the board stacked, Acceptance, Archive, a campaign's members): the
 * board's small card
 * (`ui-board-card`), its id down the left edge, its title linking to it, its kind and its
 * campaigns as tags, and a Workspace bubble in its bottom-right corner while it has an ACTIVE
 * workspace (`app-workspace-link`). Beside its status, a "needs: <milestone>" mark for each milestone
 * it needs that is not met yet (`app-milestone-needs`, epic qits-615). In the Archive it also shows its final state (Done and Dropped mix there), in
 * a campaign and on the board its own status (any phase; the board's columns are not drawn). A
 * top-level member that is not a ticket (a feature or task) is drawn the same way.
 *
 * A VERIFIED ticket carries no finish button: qits-projects-service refuses any caller's move of
 * a TICKET to DONE (qits-150) — the platform sets it itself once the workspace's wrapper release
 * request is finalized. Instead, not context and not a campaign (finishing is not that page's
 * job), it shows a quiet hint (`closesAutomatically`). An epic still finishes by hand
 * (`epic-list-item`). In the Backlog and on
 * the board (qits-1861) an open ticket (not context, not DONE or DROPPED) carries the drag handle
 * ("Move <id>", `ui-drag-handle`) on the card's bottom-right corner: the card is an item
 * (`uiReorderItem`) of the list it is drawn in, which must be a `[uiReorderList]` (disabled where
 * the order is not the page's job, qits-753). When `leaving` is set, the card shrinks away
 * (`uiLeave`), then emits `left`. `display: contents`, so the card is itself the list's item.
 */
@Component({
  selector: 'app-ticket-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, DragHandle, Leave, MilestoneNeeds, ReorderItem, Tag, WorkRef, WorkspaceLink],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [link]="base() + '/' + n.entry.qualifiedId"
      uiReorderItem
      [reorderItemLabel]="n.entry.qualifiedId ?? ''"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (n.campaigns.length || status() || needs() || closesAutomatically()) {
        <div class="mt-1 flex flex-wrap gap-1">
          @for (campaign of n.campaigns; track campaign.id) {
            <app-work-ref [qualifiedId]="campaign.qualifiedId ?? ''" />
          }
          @if (status(); as status) {
            <ui-tag [label]="status" />
          }
          <app-milestone-needs [milestones]="n.entry.milestones" />
          @if (closesAutomatically()) {
            <span class="text-[0.6875rem] text-charcoal-brown-500"
              >Closes once its release lands</span
            >
          }
        </div>
      }
      <app-workspace-link
        card-corner
        variant="corner"
        [workId]="n.entry.id"
        [qualifiedId]="n.entry.qualifiedId"
      />
      <ui-drag-handle card-action [shown]="draggable()" [label]="'Move ' + n.entry.qualifiedId" />
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

  /** Whether it needs a milestone that is not met yet: its marks then show in the tag row. */
  protected readonly needs = computed(() => unmetOf(this.node().entry.milestones).length > 0);

  /**
   * The quiet hint shown in place of a finish button: a VERIFIED ticket (not context, not a
   * campaign) closes on its own once its workspace's wrapper release request is finalized, not on
   * a press here.
   */
  protected readonly closesAutomatically = computed(() => {
    const n = this.node();
    return (
      this.view() !== 'campaign' &&
      !n.context &&
      n.entry.archetype === 'TICKET' &&
      n.entry.status === 'VERIFIED'
    );
  });

  /**
   * Whether the drag handle shows: in the Backlog and on the board, on an open ticket of its own
   * (qits-753, qits-1861). It is always a list's top-level item: a feature's tasks are its row's.
   */
  protected readonly draggable = computed(
    () => (this.view() === 'backlog' || this.view() === 'board') && movable(this.node()),
  );

  /**
   * In the Archive, which final state the ticket is in; in a campaign and on the board, its own
   * status (statuses mix there, and the board's columns are not drawn).
   */
  protected readonly status = computed(() =>
    (this.view() === 'archive' || this.view() === 'campaign' || this.view() === 'board') &&
    !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
