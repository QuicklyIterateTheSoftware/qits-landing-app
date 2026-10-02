import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ProjectCard } from './project-card';
import { ProjectsStore } from '../core/projects/projects.store';
import { Spinner, type LoadState } from '../ui/components/spinner/spinner';

/**
 * The start page: every project, one card each.
 *
 * `ProjectsStore` holds the list and loads it in the browser only: the server render has no
 * `qits-session` cookie to send, so it renders the heading and a loading state. Loading and
 * failure are shown by `ui-spinner` over the list's place, never as text.
 */
@Component({
  selector: 'app-project-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectCard, Spinner],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <header>
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">Projects</h1>
      </header>

      <ui-spinner [state]="state()" class="mt-12 min-h-48">
        @if (store.status() === 'loaded') {
          @if (store.entities().length === 0) {
            <p class="m-0 text-gray-500">There are no projects yet.</p>
          } @else {
            <ul
              class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6 p-0"
            >
              @for (project of store.entities(); track project.id) {
                <li>
                  <app-project-card [project]="project" />
                </li>
              }
            </ul>
          }
        }
      </ui-spinner>
    </div>
  `,
})
export class ProjectPicker {
  protected readonly store = inject(ProjectsStore);

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });
}
