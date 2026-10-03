import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ProjectsStore } from '../../../../core/projects/projects.store';
import { Spinner, type LoadState } from '../../../../ui/components/spinner/spinner';
import { SelectedProject } from '../../../../core/projects/selected-project';

/**
 * A project's settings, at `/projects/<slug>/setup`, reached by the gear in the top bar. For now it
 * only names the project; the settings come later.
 */
@Component({
  selector: 'app-project-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <ui-spinner [state]="state()" class="min-h-12">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Setup</h1>
        <p class="mt-2 mb-0 text-gray-500">{{ selected.project()?.name ?? '' }}</p>
      </ui-spinner>
    </div>
  `,
})
export class ProjectSetupPage {
  protected readonly selected = inject(SelectedProject);
  private readonly store = inject(ProjectsStore);

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    if (status === 'error') return 'error';
    if (status !== 'loaded') return 'loading';
    return this.selected.project() ? 'loaded' : 'error';
  });
}
