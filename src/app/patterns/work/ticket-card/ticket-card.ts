import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import { movable } from '$core/work/work-reorder';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { Leave } from '$ui/components/leave/leave';
import { ReorderItem } from '$ui/components/reorder/reorder';
import { hasUnmetNeeds } from '$core/work/work-needs';
import { WorkNeedsBadge } from '$patterns/work/work-needs/work-needs-badge';
import { WorkspaceLink } from '$patterns/work/workspace-link/workspace-link';
import { WORK_MARKS } from '$core/work/work-marks';

/**
 * A ticket on the board: a card (`ui-board-card`) in its column, its id down the left edge, its
 * title linking to its page (`open-ticket-card` `open`, epic qits-2000), its kind, its "needs" badge while it needs an item not at its status yet
 * (`app-work-needs`, epic qits-1899), and a Workspace bubble in its bottom-right
 * corner while it has an ACTIVE workspace (`app-workspace-link`). A VERIFIED ticket is not on the board:
 * it waits in the Acceptance list (`ticket-list-item`), closing on its own once its workspace's
 * wrapper release request is finalized (qits-150).
 *
 * The card is an item (`uiReorderItem`) of the board's reorder list (`app-kanban-board`,
 * qits-753), and an open ticket (not context) carries the drag handle ("Move <id>",
 * `ui-drag-handle`) on its bottom-right corner, the bubble beside it.
 *
 * When `leaving` is set (the ticket left the board), the card shrinks away (`uiLeave`), then emits
 * `left`. `display: contents`, so the card is itself the grid item of the board.
 */
@Component({
  selector: 'app-ticket-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, DragHandle, Leave, ReorderItem, WorkNeedsBadge, WorkspaceLink],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [attr.data-qits-source]="marks.source"
      [attr.data-qits-item]="marks.item(n.entry)"
      data-qits-derived="qualifiedId title archetype status"
      [column]="n.column ?? 0"
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [border]="border()"
      [exit]="opening.open"
      [exitParams]="{ slug: slug(), id: n.entry.qualifiedId ?? '' }"
      uiReorderItem
      [reorderItemLabel]="n.entry.qualifiedId ?? ''"
      [uiLeave]="leaving()"
      (left)="left.emit()"
    >
      @if (needs()) {
        <div class="mt-1 flex flex-wrap gap-1">
          <app-work-needs
            data-qits-derived="needs unmetNeeds"
            [needs]="n.entry.needs"
            [unmet]="n.entry.unmetNeeds"
          />
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
        [shown]="movable(n)"
        [label]="'Move ' + n.entry.qualifiedId"
      />
    </ui-board-card>
  `,
})
export class TicketCard {
  /** The data marks of the work it draws (`work-marks.ts`). */
  protected readonly marks = WORK_MARKS;

  readonly node = input.required<WorkNode>();
  /** The ticket is leaving the board: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  protected readonly movable = movable;

  protected readonly opening = outcomes('open-ticket-card', {
    open: exit('projects/:slug/work/detail/:id'),
  });

  private readonly selected = inject(SelectedProject);
  /** The open project's slug, for the ticket's page. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** Whether it needs an item not at its status yet: its badge then shows in the tag row. */
  protected readonly needs = computed(() => hasUnmetNeeds(this.node().entry));

  protected readonly border = computed(
    () => BOARD_COLUMNS[this.node().column ?? 0]?.cardBorder ?? 'border-line',
  );
}
