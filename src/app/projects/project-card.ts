import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectDto } from '../api/projects';
import { ProjectsStore } from '../core/projects/projects.store';
import { CardBody, CardHeader } from '../ui/components/card/base-card';
import { CardSilent } from '../ui/components/card/card-silent';

/**
 * One project in the picker: its name, and facts about it read from its repositories.
 *
 * Every repository counts as one component. The list answer carries the project's wrapper in a
 * field of its own, so it is not counted.
 */
@Component({
  selector: 'app-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardSilent, CardHeader, CardBody],
  template: `
    <a class="card-link" [routerLink]="['/projects', project().slug]">
      <ui-card-silent>
        <card-header>{{ project().name }}</card-header>
        <card-body>
          @if (repositories()?.status === 'error') {
            <span class="muted">Components unavailable</span>
          } @else if (componentCount() === undefined) {
            <span class="muted">Loading…</span>
          } @else {
            {{ componentCount() }} {{ componentCount() === 1 ? 'component' : 'components' }}
          }
        </card-body>
      </ui-card-silent>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    .card-link {
      display: block;
      border-radius: 0.75rem;
      color: inherit;
      text-decoration: none;
    }

    .card-link:hover,
    .card-link:focus-visible {
      box-shadow: 0 0 0 1px #9ca3af;
    }

    .muted {
      color: #6b7280;
    }
  `,
})
export class ProjectCard {
  readonly project = input.required<ProjectDto>();

  private readonly store = inject(ProjectsStore);

  protected readonly repositories = computed(() => {
    const projectId = this.project().id;
    return projectId ? this.store.repositories()[projectId] : undefined;
  });

  protected readonly componentCount = computed(() => {
    const repositories = this.repositories();
    return repositories?.status === 'loaded' ? repositories.entries.length : undefined;
  });

  constructor() {
    // In the browser only: the server render has no `qits-session` cookie to send.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const projectId = this.project().id;
      if (browser && projectId) void this.store.loadRepositories(projectId);
    });
  }
}
