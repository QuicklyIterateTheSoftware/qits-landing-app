import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ProjectsStore } from '../core/projects/projects.store';
import { Spinner, type LoadState } from '../ui/components/spinner/spinner';
import { SelectedProject } from './selected-project';

/**
 * One project's page, at `/projects/<slug>`. For now it only names the project; its content comes
 * later. Loading and failure show through `ui-spinner`, an unknown slug as an error.
 */
@Component({
  selector: 'app-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <ui-spinner [state]="state()" class="min-h-12">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">{{ selected.project()?.name ?? '' }}</h1>
      </ui-spinner>
    </div>
  `,
})
export class ProjectPage {
  protected readonly selected = inject(SelectedProject);
  private readonly store = inject(ProjectsStore);

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    if (status === 'error') return 'error';
    if (status !== 'loaded') return 'loading';
    return this.selected.project() ? 'loaded' : 'error';
  });
}
