import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { taskProgress, type WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { ListLane } from '$ui/components/list/list-lane';
import { ListRow } from '$ui/components/list/list-row';
import { Tag } from '$ui/components/tag/tag';

/** Which list the node is in. */
export type WorkListView = 'backlog' | 'archive';

/**
 * One node of the work tree in a list (Backlog, Archive), drawn like the board:
 *
 * - an epic is a lane (`ui-list-lane`): its title in the bar at the top and its id up the left
 *   gutter, both linking to it, its campaigns as tags below the bar. It collapses to one line: in
 *   the Backlog "<n> tasks", expanded at first; in the Archive "<n> / <n> ✅" for a done epic, or
 *   "<n> tasks" for a dropped one, collapsed at first;
 * - a feature is a row (`ui-list-row`): its title along the bottom, its id up the right gutter;
 * - anything else (a task, a ticket) is the board's small card (`ui-board-card`).
 *
 * In the Archive each item also shows its final state (Done and Dropped mix there). Every item
 * links to its page, `<base>/<qualified id>`. `display: contents`, so the lane, row or card is
 * itself the item of the list it is in.
 */
@Component({
  selector: 'app-work-list-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ListLane, ListRow, BoardCard, Tag, WorkListNode],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
    @switch (n.entry.archetype) {
      @case ('EPIC') {
        <ui-list-lane collapsible [collapsed]="view() === 'archive'">
          <span lane-summary>{{ summary() }}</span>
          <a lane-header class="font-semibold" [routerLink]="link">{{ n.entry.title }}</a>
          @for (campaign of n.campaigns; track campaign.id) {
            <ui-tag lane-tags [label]="campaign.title ?? ''" />
          }
          @if (status(); as status) {
            <ui-tag lane-tags [label]="status" />
          }
          <a lane-gutter class="font-mono" [routerLink]="link">{{ n.entry.qualifiedId }}</a>
          @for (child of n.children; track child.entry.id) {
            <app-work-list-node [node]="child" [base]="base()" [view]="view()" />
          }
        </ui-list-lane>
      }
      @case ('FEATURE') {
        <ui-list-row>
          @for (child of n.children; track child.entry.id) {
            <app-work-list-node [node]="child" [base]="base()" [view]="view()" />
          }
          <span row-id class="font-mono">{{ n.entry.qualifiedId }}</span>
          <a row-footer [routerLink]="link">{{ n.entry.title }}</a>
        </ui-list-row>
      }
      @default {
        <ui-board-card
          [code]="n.entry.qualifiedId ?? ''"
          [title]="n.entry.title ?? ''"
          [kind]="n.entry.archetype?.toLowerCase() ?? ''"
          [link]="link"
        >
          @if (n.campaigns.length || status()) {
            <div class="mt-1 flex flex-wrap gap-1">
              @for (campaign of n.campaigns; track campaign.id) {
                <ui-tag [label]="campaign.title ?? ''" />
              }
              @if (status(); as status) {
                <ui-tag [label]="status" />
              }
            </div>
          }
        </ui-board-card>
      }
    }
  `,
})
export class WorkListNode {
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();

  protected readonly summary = computed(() => {
    const { total } = taskProgress(this.node());
    const tasks = `${total} ${total === 1 ? 'task' : 'tasks'}`;
    // Everything in the Archive is final: a done epic's tasks are all done.
    return this.view() === 'archive' && this.node().entry.status === 'DONE'
      ? `${total} / ${total} ✅`
      : tasks;
  });

  /** In the Archive, which final state the item is in. */
  protected readonly status = computed(() =>
    this.view() === 'archive' && !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
