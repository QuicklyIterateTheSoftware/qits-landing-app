import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '../../../../core/projects/selected-project';
import { SelectedWork } from '../../../../core/work/selected-work';
import { BOARD_COLUMNS } from '../../../../core/work/work-statuses';
import type { WorkNode } from '../../../../core/work/work-tree';
import { Board, type BoardColumnSpec } from '../../../../ui/components/board/board';
import { Spinner } from '../../../../ui/components/spinner/spinner';
import { WorkBoardNode } from '../../../../patterns/work/work-board-node/work-board-node';
import { WorkListNode } from '../../../../patterns/work/work-list-node/work-list-node';

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

/**
 * A project's work, at `/projects/<slug>/work`: the Board (work being worked on, nested campaign ›
 * epic › story › task, each container a lane over the columns it and its descendants are in) and
 * below it the Backlog (work not refined yet, nested the same way). The Archive link at the top
 * right leads to the work in a final state.
 */
@Component({
  selector: 'app-project-work-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, Board, WorkBoardNode, WorkListNode],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <div class="flex items-baseline justify-between gap-4">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Work</h1>
        <a
          class="text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
          [routerLink]="archivePath()"
          >Archive</a
        >
      </div>

      <ui-spinner [state]="work.state()" class="mt-6 min-h-48">
        <section aria-labelledby="work-board">
          <h2 id="work-board" class="mt-0 mb-3 text-lg font-semibold">Board</h2>
          <div class="overflow-x-auto">
            <ui-board class="min-w-[40rem]" [columns]="columns()" gutter>
              @for (row of rows(); track row.node.entry.id) {
                <app-work-board-node
                  [node]="row.node"
                  [base]="workPath()"
                  [leaving]="row.leaving"
                  (left)="drop(row.node.entry.id)"
                />
              }
            </ui-board>
          </div>
        </section>

        <section aria-labelledby="work-backlog" class="mt-8">
          <h2 id="work-backlog" class="mt-0 mb-3 text-lg font-semibold">Backlog</h2>
          <div
            class="flex-col gap-12 [&_ui-board-card]:self-stretch"
            [class]="backlog().length ? 'flex' : 'hidden'"
          >
            @for (node of backlog(); track node.entry.id) {
              <app-work-list-node [node]="node" [base]="workPath()" view="backlog" />
            }
          </div>
          <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="backlog().length">
            Nothing here
          </p>
        </section>
      </ui-spinner>
    </div>
  `,
})
export class ProjectWorkPage {
  protected readonly work = inject(SelectedWork);

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
  }

  private readonly selected = inject(SelectedProject);

  protected readonly board = computed(() => this.work.graph().tree('board'));

  /**
   * The board's top-level nodes as drawn: the tree's, plus any that just left it (finished, here
   * or in another tab), kept in place while they shrink away (`leaving`) and dropped on `left`.
   */
  protected readonly rows = linkedSignal<readonly WorkNode[], readonly BoardRowState[]>({
    source: this.board,
    computation: (next, previous) => withLeaving(previous?.value ?? [], next),
  });

  protected drop(id: string | undefined): void {
    this.rows.update((rows) => rows.filter((row) => row.node.entry.id !== id));
  }
  protected readonly backlog = computed(() => this.work.graph().tree('backlog'));

  /** The board's columns, each with how many entities sit in it. */
  protected readonly columns = computed((): readonly BoardColumnSpec[] => {
    const graph = this.work.graph();
    const entries = this.work.entries();
    return BOARD_COLUMNS.map((column, index) => ({
      label: column.label,
      body: column.body,
      header: column.header,
      count: entries.filter((entry) => graph.columnOf(entry) === index).length,
    }));
  });

  protected readonly workPath = computed(() => `/projects/${this.selected.slug() ?? ''}/work`);

  protected readonly archivePath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work-archive`,
  );
}
