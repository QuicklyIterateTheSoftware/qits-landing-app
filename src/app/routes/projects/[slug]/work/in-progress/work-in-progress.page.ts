import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import { Spinner } from '$ui/components/spinner/spinner';
import { KanbanBoard } from '$patterns/work/kanban-board/kanban-board';
import { WorkList } from '$patterns/work/work-list/work-list';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';

/**
 * The work being worked on, at `/projects/<slug>/work/in-progress`: the board, nested epic ›
 * feature › task, each epic a lane over the columns it and its descendants are in.
 *
 * Work an agent is on (an ACTIVE agent in qits-workspaces, `WorkspacesStore.loadAgents`) is in
 * progress too, whatever its status. On a board status it is on the board already. Before the board
 * ("Agents on earlier work"): such work still REPORTED or REFINED. After it ("Agents on later
 * work"): such work VERIFIED, DONE or DROPPED. Each is drawn like the lists, with its own status,
 * and shown only when it holds something.
 */
@Component({
  selector: 'app-work-in-progress-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, KanbanBoard, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="In Progress">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <section
            class="mb-10 flex flex-col gap-4"
            aria-label="Agents on earlier work"
            [class.hidden]="!before().length"
          >
            <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">
              Agents on earlier work
            </h2>
            <app-work-list [tree]="before()" [base]="detailPath()" view="campaign" />
          </section>
          <app-kanban-board [tree]="board()" [base]="detailPath()" />
          <section
            class="mt-10 flex flex-col gap-4"
            aria-label="Agents on later work"
            [class.hidden]="!after().length"
          >
            <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">
              Agents on later work
            </h2>
            <app-work-list [tree]="after()" [base]="detailPath()" view="campaign" />
          </section>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkInProgressPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);
  private readonly workspaces = inject(WorkspacesStore);

  protected readonly board = computed(() => this.work.graph().tree('board'));

  /** Work an agent is on that has not reached the board. */
  protected readonly before = computed(() =>
    this.work.graph().treeOf(this.workspaces.agentSet(), ['backlog', 'schedule']),
  );

  /** Work an agent is on that is past the board. */
  protected readonly after = computed(() =>
    this.work.graph().treeOf(this.workspaces.agentSet(), ['acceptance', 'archive']),
  );

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );

  constructor() {
    // In the browser only, as the work: the server render has no session cookie to send. The
    // layout's `follow` reads the agents again after work moves.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.workspaces.loadAgents();
    }
  }
}
