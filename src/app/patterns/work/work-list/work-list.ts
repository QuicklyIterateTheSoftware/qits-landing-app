import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { withLeaving, type RowState } from '$core/work/leaving';
import type { WorkNode } from '$core/work/work-tree';
import { SelectionHighlight } from '$ui/components/highlight/highlight';
import { EpicListItem } from '$patterns/work/epic-list-item/epic-list-item';
import { TicketListItem } from '$patterns/work/ticket-list-item/ticket-list-item';
import type { WorkListView } from './work-list-view';

/**
 * A list of work, drawn like the board: the Backlog (`WorkGraph.tree('backlog')`), the Acceptance
 * list (`tree('acceptance')`, VERIFIED work with its finish button) or the Archive
 * (`tree('archive')`). Each top-level epic is an `app-epic-list-item` (a lane, with its features
 * and tasks), anything else an `app-ticket-list-item`, stacked. An empty tree says "Nothing here".
 * Both are always rendered and switched by class, so a server render hydrates as is. The card, row
 * or lane the text selection is in is highlighted (`SelectionHighlight`).
 *
 * A node that leaves the tree (finished, here or in another tab) stays in its place while it
 * shrinks away, and goes when it has (`withLeaving`). No clipping box around the items: the finish
 * button sits on an item's corner, partly outside it, and must stay clickable.
 */
@Component({
  selector: 'app-work-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpicListItem, TicketListItem],
  hostDirectives: [SelectionHighlight],
  host: { class: 'block' },
  template: `
    <div
      class="flex-col gap-12 [&_ui-board-card]:self-stretch"
      [class]="rows().length ? 'flex' : 'hidden'"
    >
      @for (row of rows(); track row.node.entry.id) {
        @if (row.node.entry.archetype === 'EPIC') {
          <app-epic-list-item
            [node]="row.node"
            [base]="base()"
            [view]="view()"
            [leaving]="row.leaving"
            (left)="drop(row.node.entry.id)"
          />
        } @else {
          <app-ticket-list-item
            [node]="row.node"
            [base]="base()"
            [view]="view()"
            [leaving]="row.leaving"
            (left)="drop(row.node.entry.id)"
          />
        }
      }
    </div>
    <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="rows().length">Nothing here</p>
  `,
})
export class WorkList {
  /** The list's work tree: its top-level nodes, in order. */
  readonly tree = input.required<readonly WorkNode[]>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();

  /**
   * The top-level nodes as drawn: the tree's, plus any that just left it, kept in place while they
   * shrink away (`leaving`) and dropped on `left`.
   */
  protected readonly rows = linkedSignal<readonly WorkNode[], readonly RowState[]>({
    source: this.tree,
    computation: (next, previous) => withLeaving(previous?.value ?? [], next),
  });

  protected drop(id: string | undefined): void {
    this.rows.update((rows) => rows.filter((row) => row.node.entry.id !== id));
  }
}
