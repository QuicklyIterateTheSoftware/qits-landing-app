import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { taskProgress, type WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { ListLane } from '$ui/components/list/list-lane';
import { ListRow } from '$ui/components/list/list-row';
import { Tag } from '$ui/components/tag/tag';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * An epic in a list (Backlog, Archive), with its features and their tasks, drawn like the board:
 *
 * - the epic is a lane (`ui-list-lane`): its title in the bar at the top and its id up the left
 *   gutter, both linking to it, its campaigns as tags below the bar. It collapses to one line: in
 *   the Backlog "<n> tasks", expanded at first; in the Archive "<n> / <n> ✅" for a done epic, or
 *   "<n> tasks" for a dropped one, collapsed at first;
 * - each feature is a row (`ui-list-row`): its title along the bottom, its id up the right gutter;
 * - each task is the board's small card (`ui-board-card`), with its campaigns.
 *
 * In the Archive the epic (unless it is only context) also shows its final state. Every item links
 * to its page, `<base>/<qualified id>`. `display: contents`, so the lane is itself the list's item.
 */
@Component({
  selector: 'app-epic-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ListLane, ListRow, BoardCard, Tag],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @let link = base() + '/' + n.entry.qualifiedId;
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
      @for (feature of n.children; track feature.entry.id) {
        <ui-list-row>
          @for (task of feature.children; track task.entry.id) {
            <ui-board-card
              [code]="task.entry.qualifiedId ?? ''"
              [title]="task.entry.title ?? ''"
              [kind]="task.entry.archetype?.toLowerCase() ?? ''"
              [link]="base() + '/' + task.entry.qualifiedId"
            >
              @if (task.campaigns.length) {
                <div class="mt-1 flex flex-wrap gap-1">
                  @for (campaign of task.campaigns; track campaign.id) {
                    <ui-tag [label]="campaign.title ?? ''" />
                  }
                </div>
              }
            </ui-board-card>
          }
          <span row-id class="font-mono">{{ feature.entry.qualifiedId }}</span>
          <a row-footer [routerLink]="base() + '/' + feature.entry.qualifiedId">{{
            feature.entry.title
          }}</a>
        </ui-list-row>
      }
    </ui-list-lane>
  `,
})
export class EpicListItem {
  /** The epic's node: its children are its features, theirs its tasks. */
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

  /** In the Archive, which final state the epic is in. */
  protected readonly status = computed(() =>
    this.view() === 'archive' && !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
