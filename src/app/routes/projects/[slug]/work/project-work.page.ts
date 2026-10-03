import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { KanbanBoard } from '$patterns/work/kanban-board/kanban-board';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * A project's work, at `/projects/<slug>/work`: the Board (work being worked on, nested campaign ›
 * epic › story › task, each container a lane over the columns it and its descendants are in) and
 * below it the Backlog (work not refined yet, nested the same way). The Archive link at the top
 * right leads to the work in a final state.
 */
@Component({
  selector: 'app-project-work-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, KanbanBoard, WorkList],
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
          <app-kanban-board [tree]="board()" [base]="workPath()" />
        </section>

        <section aria-labelledby="work-backlog" class="mt-8">
          <h2 id="work-backlog" class="mt-0 mb-3 text-lg font-semibold">Backlog</h2>
          <app-work-list [tree]="backlog()" [base]="workPath()" view="backlog" />
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

  protected readonly backlog = computed(() => this.work.graph().tree('backlog'));

  protected readonly workPath = computed(() => `/projects/${this.selected.slug() ?? ''}/work`);

  protected readonly archivePath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work-archive`,
  );
}
