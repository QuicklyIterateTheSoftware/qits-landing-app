import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Spinner } from '../ui/components/spinner/spinner';
import { SelectedProject } from './selected-project';
import { SelectedWork } from './work/selected-work';
import { WorkList } from './work/work-list';
import { ARCHIVE_STATUSES, withStatus } from './work/work-statuses';

/**
 * A project's finished work, at `/projects/<slug>/work/archive`: everything in a final state (Done
 * or Dropped), in the same list the Backlog uses.
 */
@Component({
  selector: 'app-project-work-archive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <div class="flex items-baseline justify-between gap-4">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Archive</h1>
        <a
          class="text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
          [routerLink]="workPath()"
          >Back to Work</a
        >
      </div>
      <ui-spinner [state]="work.state()" class="mt-6 min-h-48">
        <app-work-list [entries]="archived()" showStatus />
      </ui-spinner>
    </div>
  `,
})
export class ProjectWorkArchive {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly archived = computed(() => withStatus(this.work.entries(), ARCHIVE_STATUSES));

  protected readonly workPath = computed(() => `/projects/${this.selected.slug() ?? ''}/work`);
}
