import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * The backlog, at `/projects/<slug>/work/refinement`: work not refined yet (REPORTED), nested
 * epic › feature › task.
 */
@Component({
  selector: 'app-work-refinement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Refinement">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-work-list [tree]="backlog()" [base]="detailPath()" view="backlog" />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkRefinementPage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly backlog = computed(() => this.work.graph().tree('backlog'));

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
