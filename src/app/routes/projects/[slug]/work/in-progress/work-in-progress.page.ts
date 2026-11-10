import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { InProgressViewStore } from '$core/work/in-progress-view';
import { SelectedWork } from '$core/work/selected-work';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import { Spinner } from '$ui/components/spinner/spinner';
import { EpicBoard } from '$patterns/work/epic-board/epic-board';
import { KanbanBoard } from '$patterns/work/kanban-board/kanban-board';
import { WorkList } from '$patterns/work/work-list/work-list';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';

/**
 * The work being worked on, at `/projects/<slug>/work/in-progress`, in one of two views (qits-2051,
 * `InProgressViewStore`, switched by the gear on the In Progress tab):
 *
 * - **Epic boards** (the default): first each root epic on the board (READY_FOR_DEV to VERIFYING)
 *   with its own epic board (`app-epic-board`, with its bar: this page does not name it), its whole
 *   subtree over five columns, Verified included (`WorkGraph.epicBoards`); then one board for the
 *   rest (`tree('board', { withoutEpicBoards: true })`): tickets, and an epic off the board whose
 *   pieces are on it, as context. That board is drawn only when it holds something, or when there
 *   is no epic board either: then its empty columns say that nothing is in progress, as the inline
 *   board's do.
 * - **Inline**: one board, nested epic › feature › task, each epic a lane over the columns it and
 *   its descendants are in.
 *
 * Below `md` the columns do not fit a phone's width, so the same work is drawn stacked instead, each
 * item with its own status (`app-work-list`, view `board`; qits-1861): with epic boards, those
 * epics' subtrees first, then the rest. Both are always rendered and switched by class, so a server
 * render hydrates as is.
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
  imports: [PageLayoutComponent, Spinner, EpicBoard, KanbanBoard, WorkList],
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
            <app-work-list [tree]="before()" [base]="detailPath()" view="mixed" />
          </section>
          @if (epics()) {
            <div class="hidden flex-col gap-12 md:flex">
              @for (epic of epicBoards(); track epic.entry.id) {
                <app-epic-board [node]="epic" [base]="detailPath()" [header]="true" />
              }
              @if (rest().length || !epicBoards().length) {
                <app-kanban-board [tree]="rest()" [base]="detailPath()" />
              }
            </div>
            <div class="md:hidden">
              <app-work-list [tree]="stacked()" [base]="detailPath()" view="board" />
            </div>
          } @else {
            <div class="hidden md:block">
              <app-kanban-board [tree]="board()" [base]="detailPath()" />
            </div>
            <div class="md:hidden">
              <app-work-list [tree]="board()" [base]="detailPath()" view="board" />
            </div>
          }
          <section
            class="mt-10 flex flex-col gap-4"
            aria-label="Agents on later work"
            [class.hidden]="!after().length"
          >
            <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">
              Agents on later work
            </h2>
            <app-work-list [tree]="after()" [base]="detailPath()" view="mixed" />
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
  private readonly views = inject(InProgressViewStore);

  /** Whether the epic boards view is in use; else the inline one. */
  protected readonly epics = computed(() => this.views.view() === 'epics');

  /** The inline view's board: everything on the board. */
  protected readonly board = computed(() => this.work.graph().tree('board'));

  /** Each root epic on the board, whole, for its own epic board. */
  protected readonly epicBoards = computed(() => this.work.graph().epicBoards());

  /** The board without the epics that have their own. */
  protected readonly rest = computed(() =>
    this.work.graph().tree('board', { withoutEpicBoards: true }),
  );

  /** Below `md`, with epic boards: those epics first, then the rest, as the boards are drawn. */
  protected readonly stacked = computed(() => [...this.epicBoards(), ...this.rest()]);

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
    // In the browser only, as the work: the server render holds no token to send. The
    // layout's `follow` reads the agents again after work moves.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.workspaces.loadAgents();
    }
  }
}
