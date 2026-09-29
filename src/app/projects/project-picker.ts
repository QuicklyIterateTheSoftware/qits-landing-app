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
    <div class="picker">
      <header>
        <p class="eyebrow">qits</p>
        <h1>Projects</h1>
      </header>

      @if (store.status() === 'error') {
        <p class="note" role="alert">The projects could not be loaded.</p>
      } @else if (store.status() === 'loaded') {
        @if (store.entities().length === 0) {
          <p class="note">There are no projects yet.</p>
        } @else {
          <ul class="cards">
            @for (project of store.entities(); track project.id) {
              <li>
                <app-project-card [project]="project" />
              </li>
            }
          </ul>
        }
      } @else {
        <p class="note">Loading projects…</p>
      }
    </div>
  `,
  styles: `
    .picker {
      margin: 0 auto;
      max-width: 60rem;
      padding: 4rem 1.5rem 3rem;
    }

    .eyebrow {
      color: #6b7280;
      font-size: 0.875rem;
      letter-spacing: 0.35em;
      margin: 0 0 0.75rem;
      text-transform: uppercase;
    }

    h1 {
      font-size: clamp(2.25rem, 6vw, 3.5rem);
      font-weight: 700;
      line-height: 1.1;
      margin: 0;
    }

    .note {
      color: #6b7280;
      margin: 3rem 0 0;
    }

    .cards {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      list-style: none;
      margin: 3rem 0 0;
      padding: 0;
    }
  `,
})
export class ProjectPicker {
  protected readonly store = inject(ProjectsStore);
}
