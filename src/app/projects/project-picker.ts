import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectCard } from './project-card';
import { ProjectsStore } from '../core/projects/projects.store';

/**
 * The start page: every project, one card each.
 *
 * `ProjectsStore` holds the list and loads it in the browser only: the server render has no
 * `qits-session` cookie to send, so it renders the heading and a loading state.
 */
@Component({
  selector: 'app-project-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectCard],
  template: `
    <div class="mx-auto max-w-[60rem] px-6 pt-16 pb-12">
      <header>
        <p class="mt-0 mb-3 text-[0.875rem] tracking-[0.35em] text-gray-500 uppercase">qits</p>
        <h1 class="m-0 text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.1] font-bold">Projects</h1>
      </header>

      @if (store.status() === 'error') {
        <p class="mt-12 mb-0 text-gray-500" role="alert">The projects could not be loaded.</p>
      } @else if (store.status() === 'loaded') {
        @if (store.entities().length === 0) {
          <p class="mt-12 mb-0 text-gray-500">There are no projects yet.</p>
        } @else {
          <ul
            class="mt-12 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6 p-0"
          >
            @for (project of store.entities(); track project.id) {
              <li>
                <app-project-card [project]="project" />
              </li>
            }
          </ul>
        }
      } @else {
        <p class="mt-12 mb-0 text-gray-500">Loading projects…</p>
      }
    </div>
  `,
})
export class ProjectPicker {
  protected readonly store = inject(ProjectsStore);
}
