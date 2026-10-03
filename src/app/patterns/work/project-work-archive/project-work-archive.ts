import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '../../../core/projects/selected-project';
import { SelectedWork } from '../../../core/work/selected-work';
import { Spinner } from '../../../ui/components/spinner/spinner';
import { WorkListNode } from '../work-list-node/work-list-node';

/**
 * A project's finished work, at `/projects/<slug>/work/archive`: everything in a final state (Done
 * or Dropped), nested as on the board, in the same groups the Backlog uses.
 */
@Component({
  selector: 'app-project-work-archive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Spinner, WorkListNode],
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
        <div
          class="flex-col gap-12 [&_ui-board-card]:self-stretch"
          [class]="archived().length ? 'flex' : 'hidden'"
        >
          @for (node of archived(); track node.entry.id) {
            <app-work-list-node [node]="node" [base]="workPath()" view="archive" />
          }
        </div>
        <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="archived().length">
          Nothing here
        </p>
      </ui-spinner>
    </div>
  `,
})
export class ProjectWorkArchive {
  protected readonly work = inject(SelectedWork);

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
  }

  private readonly selected = inject(SelectedProject);

  protected readonly archived = computed(() => this.work.graph().tree('archive'));

  protected readonly workPath = computed(() => `/projects/${this.selected.slug() ?? ''}/work`);
}
