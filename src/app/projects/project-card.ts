import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getProjectsApiProjectsByProjectIdRepositoriesResource } from '../api/projects/@angular/common.gen';
import type { ProjectDto } from '../api/projects';
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
          @if (repositories.error()) {
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

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly repositories = getProjectsApiProjectsByProjectIdRepositoriesResource(() => {
    const projectId = this.project().id;
    return this.browser && projectId ? { path: { projectId } } : undefined;
  });

  protected readonly componentCount = computed(() =>
    this.repositories.hasValue() ? (this.repositories.value().entries ?? []).length : undefined,
  );
}
