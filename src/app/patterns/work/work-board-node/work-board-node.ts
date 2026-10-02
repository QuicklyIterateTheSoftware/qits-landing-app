import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '../../../core/projects/selected-project';
import { finishable } from '../../../core/work/work.consumes';
import { WorkStore } from '../../../core/work/work.store';
import { BOARD_COLUMNS } from '../../../core/work/work-statuses';
import { startsCollapsed, taskProgress, type WorkNode } from '../../../core/work/work-tree';
import { BoardCard } from '../../../ui/components/board/board-card';
import { BoardLane } from '../../../ui/components/board/board-lane';
import { BoardRow } from '../../../ui/components/board/board-row';
import {
  FinishButton,
  type FinishButtonState,
} from '../../../ui/components/finish-button/finish-button';
import { Leave } from '../../../ui/components/leave/leave';
import { Tag } from '../../../ui/components/tag/tag';

/**
 * One node of the work tree on the board:
 *
 * - an epic is a lane (`ui-board-lane`): its title in the bar at the top and its id up the gutter,
 *   both linking to it, its campaigns as tags below the bar. It collapses to "<verified> / <total>
 *   ✅" for its tasks, collapsed at first when every one is verified;
 * - a feature is a row of that lane (`ui-board-row`), its title along the bottom and its id up the
 *   right gutter;
 * - anything else (a task, a ticket) is a card (`ui-board-card`) in its column.
 *
 * A VERIFIED epic or ticket carries the finish button ("Mark <id> done"), which moves it to DONE
 * through `WorkStore.finish`. A node that `leaving` is set on shrinks away (`uiLeave`), then emits
 * `left`. Every item links to its page, `<base>/<qualified id>`. `display: contents`, so the lane,
 * row or card is itself the grid item of the board, lane or row it is in.
 */
@Component({
  selector: 'app-work-board-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BoardLane, BoardRow, BoardCard, FinishButton, Leave, Tag, WorkBoardNode],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    @switch (n.entry.archetype) {
      @case ('EPIC') {
        <ui-board-lane
          collapsible
          [collapsed]="collapsed()"
          [uiLeave]="leaving()"
          (left)="left.emit()"
        >
          <span lane-summary>{{ summary() }}</span>
          <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
          @for (campaign of n.campaigns; track campaign.id) {
            <ui-tag lane-tags [label]="campaign.title ?? ''" />
          }
          <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
          <ui-finish-button
            lane-action
            [shown]="canFinish()"
            [state]="finishState()"
            [label]="'Mark ' + n.entry.qualifiedId + ' done'"
            (finish)="finish()"
          />
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
          [border]="border()"
          [link]="link"
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
            [shown]="canFinish()"
            [state]="finishState()"
            [label]="'Mark ' + n.entry.qualifiedId + ' done'"
            (finish)="finish()"
          />
        </ui-board-card>
      }
    }
  `,
})
export class WorkBoardNode {
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  /** The node is leaving the page: it shrinks away, then emits `left`. */
  readonly leaving = input(false);
  readonly left = output<void>();

  private readonly store = inject(WorkStore);
  private readonly selected = inject(SelectedProject);

  protected readonly canFinish = computed(
    () => !this.node().context && finishable(this.node().entry),
  );

  protected readonly finishState = computed((): FinishButtonState => {
    const id = this.node().entry.id;
    return (id && this.store.finishing()[id]) || 'idle';
  });

  protected readonly collapsed = computed(() => startsCollapsed(this.node()));

  protected readonly summary = computed(() => {
    const { verified, total } = taskProgress(this.node());
    return `${verified} / ${total} ✅`;
  });

  protected readonly border = computed(
    () => BOARD_COLUMNS[this.node().column ?? 0]?.cardBorder ?? 'border-charcoal-brown-200',
  );

  protected finish(): void {
    const projectId = this.selected.project()?.id;
    if (projectId) void this.store.finish(projectId, this.node().entry);
  }
}
