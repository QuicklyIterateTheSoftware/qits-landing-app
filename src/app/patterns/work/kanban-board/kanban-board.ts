import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { BOARD_COLUMNS } from '$core/work/work-statuses';
import type { WorkNode } from '$core/work/work-tree';
import { Board, type BoardColumnSpec } from '$ui/components/board/board';
import { EpicCard } from '$patterns/work/epic-card/epic-card';
import { TicketCard } from '$patterns/work/ticket-card/ticket-card';

/** A top-level board node as drawn, and whether it is on its way out. */
export interface BoardRowState {
  readonly node: WorkNode;
  readonly leaving: boolean;
}

/**
 * The rows to draw for the tree `next`, given those drawn before: `next`'s nodes in its order,
 * and every node drawn before that `next` no longer has, still in its place, marked leaving.
 */
export function withLeaving(
  previous: readonly BoardRowState[],
  next: readonly WorkNode[],
): readonly BoardRowState[] {
  const nextIds = new Set(next.map((node) => node.entry.id));
  const rows: BoardRowState[] = next.map((node) => ({ node, leaving: false }));
  previous.forEach((row, index) => {
    if (nextIds.has(row.node.entry.id)) return;
    rows.splice(Math.min(index, rows.length), 0, { node: row.node, leaving: true });
  });
  return rows;
}

/** How many items of `tree` (not context) sit in each of the board's columns. */
export function columnCounts(tree: readonly WorkNode[]): readonly number[] {
  const counts = BOARD_COLUMNS.map(() => 0);
  const walk = (node: WorkNode) => {
    if (!node.context && node.column !== undefined) counts[node.column]++;
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return counts;
}

/**
 * The Work board: the board's work tree (`WorkGraph.tree('board')`) over the status columns, each
 * column headed with how many items sit in it. Each top-level epic is an `app-epic-card` (a lane,
 * with its features and tasks), anything else an `app-ticket-card`.
 *
 * A node that leaves the tree (finished, here or in another tab) stays in its place while it
 * shrinks away, and goes when it has (`withLeaving`). No scrolling or clipping box around the
 * board: the finish button sits on a card's corner, partly outside it, and must stay clickable.
 */
@Component({
  selector: 'app-kanban-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Board, EpicCard, TicketCard],
  host: { class: 'block' },
  template: `
    <ui-board class="min-w-[40rem]" [columns]="columns()" gutter>
      @for (row of rows(); track row.node.entry.id) {
        @if (row.node.entry.archetype === 'EPIC') {
          <app-epic-card
            [node]="row.node"
            [base]="base()"
            [leaving]="row.leaving"
            (left)="drop(row.node.entry.id)"
          />
        } @else {
          <app-ticket-card
            [node]="row.node"
            [base]="base()"
            [leaving]="row.leaving"
            (left)="drop(row.node.entry.id)"
          />
        }
      }
    </ui-board>
  `,
})
export class KanbanBoard {
  /** The board's work tree: its top-level nodes, in order. */
  readonly tree = input.required<readonly WorkNode[]>();
  /** The work section's path, e.g. `/projects/qits/work`; items are below it. */
  readonly base = input.required<string>();

  /**
   * The top-level nodes as drawn: the tree's, plus any that just left it, kept in place while they
   * shrink away (`leaving`) and dropped on `left`.
   */
  protected readonly rows = linkedSignal<readonly WorkNode[], readonly BoardRowState[]>({
    source: this.tree,
    computation: (next, previous) => withLeaving(previous?.value ?? [], next),
  });

  protected drop(id: string | undefined): void {
    this.rows.update((rows) => rows.filter((row) => row.node.entry.id !== id));
  }

  /** The columns, each with how many items sit in it. */
  protected readonly columns = computed((): readonly BoardColumnSpec[] => {
    const counts = columnCounts(this.tree());
    return BOARD_COLUMNS.map((column, index) => ({
      label: column.label,
      body: column.body,
      header: column.header,
      count: counts[index],
    }));
  });
}
