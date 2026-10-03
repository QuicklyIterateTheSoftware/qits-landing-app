import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { KanbanBoard } from '$patterns/work/kanban-board/kanban-board';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';

/**
 * The work being worked on, at `/projects/<slug>/work/in-progress`: the board, nested epic ›
 * feature › task, each epic a lane over the columns it and its descendants are in.
 */
@Component({
  selector: 'app-work-in-progress-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, KanbanBoard],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="In Progress">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-kanban-board [tree]="board()" [base]="detailPath()" />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkInProgressPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly board = computed(() => this.work.graph().tree('board'));

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
