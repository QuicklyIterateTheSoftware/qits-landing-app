import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { movable } from '$core/work/work-reorder';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { Leave } from '$ui/components/leave/leave';
import { ReorderItem } from '$ui/components/reorder/reorder';
import { Tag } from '$ui/components/tag/tag';
import { hasUnmetNeeds } from '$core/work/work-needs';
import { WorkNeedsBadge } from '$patterns/work/work-needs/work-needs-badge';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import { WrapperClosingLine } from '$patterns/work/wrapper-closing/wrapper-closing';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';
import { WORK_MARKS } from '$core/work/work-marks';

/**
 * A ticket in a list (Backlog, the board stacked, Acceptance, Archive): the board's small card
 * (`ui-board-card`), its id down the left edge, its title linking to its page (`open-ticket-list-item`
 * `open`, epic qits-2000), its kind, and a Workspace
 * bubble in its bottom-right corner while it has an ACTIVE workspace (`app-workspace-link`).
 * Beside its status, its "needs" badge while it needs an item not at its status yet
 * (`app-work-needs`, epic qits-1899). In the Archive it also shows its final state (Done and
 * Dropped mix there), in a mixed list and on the board its own status (any phase; the board's
 * columns are not drawn). A top-level item that is not a ticket (a feature or task) is drawn the
 * same way.
 *
 * A VERIFIED ticket carries no finish button: qits-projects-service refuses any caller's move of
 * a TICKET to DONE (qits-150) — the platform sets it itself once the workspace's wrapper release
 * request is finalized. Instead, not context and not in a mixed list, it shows a quiet hint (`closesAutomatically`): how its wrapper closing stands
 * (`app-wrapper-closing`, qits-1873: "Closes with <request>, pending", "Closes now: …", "Waits for
 * its wrapper release request", or a warning when it cannot close by itself), "Closes once its
 * release lands" until the project's closings are read. An epic still finishes by hand
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
  imports: [
    BoardCard,
    DragHandle,
    Leave,
    ReorderItem,
    Tag,
    WorkNeedsBadge,
    WorkspaceLink,
    WrapperClosingLine,
  ],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [attr.data-qits-source]="marks.source"
      [attr.data-qits-item]="marks.item(n.entry)"
      data-qits-derived="qualifiedId title archetype"
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [exit]="opening.open"
      [exitParams]="{ slug: slug(), id: n.entry.qualifiedId ?? '' }"
      uiReorderItem
      [reorderItemLabel]="n.entry.qualifiedId ?? ''"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (status() || needs() || closesAutomatically()) {
        <div class="mt-1 flex flex-wrap gap-1">
          @if (status(); as status) {
            <ui-tag data-qits-derived="status" [label]="status" />
          }
          <app-work-needs
            data-qits-derived="needs unmetNeeds"
            [needs]="n.entry.needs"
            [unmet]="n.entry.unmetNeeds"
          />
          @if (closesAutomatically()) {
            <app-wrapper-closing
              class="text-[0.6875rem]"
              [qualifiedId]="n.entry.qualifiedId ?? ''"
            />
          }
        </div>
      }
      <app-workspace-link
        card-corner
        variant="corner"
        [workId]="n.entry.id"
        [qualifiedId]="n.entry.qualifiedId"
      />
      <ui-drag-handle
        card-action
        data-qits-derived="qualifiedId"
        [shown]="draggable()"
        [label]="'Move ' + n.entry.qualifiedId"
      />
    </ui-board-card>
  `,
})
export class TicketListItem {
  /** The data marks of the work it draws (`work-marks.ts`). */
  protected readonly marks = WORK_MARKS;

  readonly node = input.required<WorkNode>();
  readonly view = input.required<WorkListView>();
  /** The ticket is leaving the list: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly opening = outcomes('open-ticket-list-item', {
    open: exit('projects/:slug/work/detail/:id'),
  });

  private readonly selected = inject(SelectedProject);
  /** The open project's slug, for the ticket's page. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** Whether it needs an item not at its status yet: its badge then shows in the tag row. */
  protected readonly needs = computed(() => hasUnmetNeeds(this.node().entry));

  /**
   * The quiet hint shown in place of a finish button: a VERIFIED ticket (not context, not in a
   * mixed list) closes on its own once its workspace's wrapper release request is finalized, not on
   * a press here. The hint is its wrapper closing's line (`app-wrapper-closing`, qits-1873).
   */
  protected readonly closesAutomatically = computed(() => {
    const n = this.node();
    return (
      this.view() !== 'mixed' &&
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
   * In the Archive, which final state the ticket is in; in a mixed list and on the board, its own
   * status (statuses mix there, and the board's columns are not drawn).
   */
  protected readonly status = computed(() =>
    (this.view() === 'archive' || this.view() === 'mixed' || this.view() === 'board') &&
    !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
