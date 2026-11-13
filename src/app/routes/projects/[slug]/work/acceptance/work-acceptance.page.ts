import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { InProgressViewStore } from '$core/work/in-progress-view';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * The work waiting to be accepted, at `/projects/<slug>/work/acceptance`: VERIFIED epics and
 * tickets. An epic carries its finish button (the finish waits for its Undo in a toast); a ticket
 * carries no such button — qits-projects-service refuses any caller's move of a TICKET to DONE
 * (qits-150), and the platform sets it itself once the workspace's wrapper release request is
 * finalized — and shows a quiet hint instead.
 *
 * It follows the In Progress tab's view (qits-2051, `InProgressViewStore`). With epic boards, a
 * VERIFIED feature or task of a root epic still on the board (READY_FOR_DEV to VERIFYING) is not
 * listed: that epic's own board shows it in its Verified column. Inline, the one board has no
 * Verified column, so they are listed here, with their epic as context.
 */
@Component({
  selector: 'app-work-acceptance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Acceptance">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-work-list [tree]="acceptance()" view="acceptance" />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkAcceptancePage {
  protected readonly work = inject(SelectedWork);
  private readonly views = inject(InProgressViewStore);

  protected readonly acceptance = computed(() =>
    this.work.graph().tree('acceptance', { withoutEpicBoards: this.views.view() === 'epics' }),
  );

  constructor() {
    // The open project's work is read once a page wants it (`SelectedWork`, qits-2146).
    this.work.want();
  }
}
