import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '../../../core/projects/selected-project';
import { SelectedWork } from '../../../core/work/selected-work';
import { BOARD_COLUMNS } from '../../../core/work/work-statuses';
import { Board, type BoardColumnSpec } from '../../../ui/components/board/board';
import { Spinner } from '../../../ui/components/spinner/spinner';
import { WorkBoardNode } from '../work-board-node/work-board-node';
import { WorkGroupNode } from '../work-group-node/work-group-node';

/**
 * A project's work, at `/projects/<slug>/work`: the Board (work being worked on, nested campaign ›
 * epic › story › task, each container a lane over the columns it and its descendants are in) and
 * below it the Backlog (work not refined yet, nested the same way). The Archive link at the top
 * right leads to the work in a final state.
 */
@Component({
  selector: 'app-project-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, Board, WorkBoardNode, WorkGroupNode],
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
              @for (node of board(); track node.entry.id) {
                <app-work-board-node [node]="node" [base]="workPath()" />
              }
            </ui-board>
          </div>
        </section>

        <section aria-labelledby="work-backlog" class="mt-8">
          <h2 id="work-backlog" class="mt-0 mb-3 text-lg font-semibold">Backlog</h2>
          <div class="flex-col gap-2" [class]="backlog().length ? 'flex' : 'hidden'">
            @for (node of backlog(); track node.entry.id) {
              <app-work-group-node [node]="node" [base]="workPath()" />
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
export class ProjectWork {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly board = computed(() => this.work.graph().tree('board'));
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
    () => `/projects/${this.selected.slug() ?? ''}/work/archive`,
  );
}
