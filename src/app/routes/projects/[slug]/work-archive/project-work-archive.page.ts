import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$ui/components/page-layout/page-layout';
import { WorkList } from '$patterns/work/work-list/work-list';

/**
 * A project's finished work, at `/projects/<slug>/work-archive`: everything in a final state (Done
 * or Dropped), nested as on the board, in the same groups the Backlog uses.
 */
@Component({
  selector: 'app-project-work-archive-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageLayoutComponent, Spinner, WorkList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <ui-page-layout title="Archive">
        <a
          slot="actions"
          class="text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900"
          [routerLink]="workPath()"
          >Back to Work</a
        >
        <ui-spinner [state]="work.state()" class="min-h-48">
          <app-work-list [tree]="archived()" [base]="workPath()" view="archive" />
        </ui-spinner>
      </ui-page-layout>
    </div>
  `,
})
export class ProjectWorkArchivePage {
  protected readonly work = inject(SelectedWork);

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
  }

  private readonly selected = inject(SelectedProject);

  protected readonly archived = computed(() => this.work.graph().tree('archive'));

  protected readonly workPath = computed(() => `/projects/${this.selected.slug() ?? ''}/work`);
}
