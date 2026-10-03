import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { WorkNode } from '$core/work/work-tree';
import { BoardCard } from '$ui/components/board/board-card';
import { Tag } from '$ui/components/tag/tag';
import type { WorkListView } from '$patterns/work/work-list/work-list-view';

/**
 * A ticket in a list (Backlog, Archive): the board's small card (`ui-board-card`), its id down the
 * left edge, its title linking to it, its kind and its campaigns as tags. In the Archive it also
 * shows its final state (Done and Dropped mix there). `display: contents`, so the card is itself
 * the list's item.
 */
@Component({
  selector: 'app-ticket-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardCard, Tag],
  host: { class: 'contents' },
  template: `
    @let n = node();
    <ui-board-card
      [code]="n.entry.qualifiedId ?? ''"
      [title]="n.entry.title ?? ''"
      [kind]="n.entry.archetype?.toLowerCase() ?? ''"
      [link]="base() + '/' + n.entry.qualifiedId"
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
  `,
})
export class TicketListItem {
  readonly node = input.required<WorkNode>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();

  /** In the Archive, which final state the ticket is in. */
  protected readonly status = computed(() =>
    this.view() === 'archive' && !this.node().context
      ? this.node().entry.status?.toLowerCase()
      : undefined,
  );
}
