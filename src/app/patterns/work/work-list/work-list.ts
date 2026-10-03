import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WorkNode } from '$core/work/work-tree';
import { SelectionHighlight } from '$ui/components/highlight/highlight';
import { EpicListItem } from '$patterns/work/epic-list-item/epic-list-item';
import { TicketListItem } from '$patterns/work/ticket-list-item/ticket-list-item';
import type { WorkListView } from './work-list-view';

/**
 * A list of work, drawn like the board: the Backlog (`WorkGraph.tree('backlog')`) or the Archive
 * (`tree('archive')`). Each top-level epic is an `app-epic-list-item` (a lane, with its features
 * and tasks), anything else an `app-ticket-list-item`, stacked. An empty tree says "Nothing here".
 * Both are always rendered and switched by class, so a server render hydrates as is. The card, row
 * or lane the text selection is in is highlighted (`SelectionHighlight`).
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
      [class]="tree().length ? 'flex' : 'hidden'"
    >
      @for (node of tree(); track node.entry.id) {
        @if (node.entry.archetype === 'EPIC') {
          <app-epic-list-item [node]="node" [base]="base()" [view]="view()" />
        } @else {
          <app-ticket-list-item [node]="node" [base]="base()" [view]="view()" />
        }
      }
    </div>
    <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="tree().length">Nothing here</p>
  `,
})
export class WorkList {
  /** The list's work tree: its top-level nodes, in order. */
  readonly tree = input.required<readonly WorkNode[]>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();
  readonly view = input.required<WorkListView>();
}
