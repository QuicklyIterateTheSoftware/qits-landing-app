import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * A project's finished work, at `/projects/<slug>/work/archive`: everything in a final state (Done
 * or Dropped), nested as on the board, in the same groups the backlog uses.
 */
@Component({
  selector: 'app-work-archive-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Archive">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-work-list [tree]="archived()" [base]="detailPath()" view="archive" />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkArchivePage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly archived = computed(() => this.work.graph().tree('archive'));

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );
}
