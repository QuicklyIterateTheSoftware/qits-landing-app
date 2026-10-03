import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * The work waiting to be accepted, at `/projects/<slug>/work/acceptance`: VERIFIED epics and
 * tickets, each with its finish button (the finish waits for its Undo in a toast).
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
          <app-work-list [tree]="acceptance()" [base]="detailPath()" view="acceptance" />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkAcceptancePage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly acceptance = computed(() => this.work.graph().tree('acceptance'));

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
