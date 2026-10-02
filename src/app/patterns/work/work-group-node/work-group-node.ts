import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WorkNode } from '../../../core/work/work-tree';
import { BoardLane } from '../../../ui/components/board/board-lane';
import { ListItem } from '../../../ui/components/list-item/list-item';

/**
 * One node of the work tree in a list (Backlog, Archive): a group band (`ui-board-lane` off a
 * board) when it has children, rendered recursively, else a list row (`ui-list-item`). A group
 * whose own item lives elsewhere (`context`) is drawn muted. With `showStatus`, rows also show
 * their status (the Archive mixes Done and Dropped).
 */
@Component({
  selector: 'app-work-group-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardLane, ListItem, WorkGroupNode],
  host: { class: 'contents' },
  template: `
    @let n = node();
    @if (n.children.length) {
      <ui-board-lane [muted]="n.context">
        <span lane-header class="font-mono">{{ n.entry.qualifiedId }}</span>
        <span lane-header class="min-w-0 flex-1 truncate">{{ n.entry.title }}</span>
        <span lane-header class="opacity-70">{{ chips(n).join(' · ') }}</span>
        @for (child of n.children; track child.entry.id) {
          <app-work-group-node [node]="child" [showStatus]="showStatus()" />
        }
      </ui-board-lane>
    } @else {
      <ui-list-item
        [code]="n.entry.qualifiedId ?? ''"
        [title]="n.entry.title ?? ''"
        [chips]="chips(n)"
      />
    }
  `,
})
export class WorkGroupNode {
  readonly node = input.required<WorkNode>();
  readonly showStatus = input(false, { transform: booleanAttribute });

  protected chips(n: WorkNode): string[] {
    const kind = n.entry.archetype?.toLowerCase() ?? '';
    const status = this.showStatus() && !n.context ? n.entry.status?.toLowerCase() : undefined;
    return status ? [status, kind] : [kind];
  }
}
