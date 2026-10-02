import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocStore } from '../core/loc/loc.store';
import { ProjectsStore, type Project } from '../core/projects/projects.store';
import { CardBody, CardHeader } from '../ui/components/card/base-card';
import { CardSilent } from '../ui/components/card/card-silent';

/**
 * One project in the picker: its name, and facts about it read from its repositories.
 *
 * - Every repository counts as one component. The list answer carries the project's wrapper in a
 *   field of its own, so it is not counted.
 * - Its lines of code are the sum over its repositories (`LocStore`, one request for all cards).
 *   While qits-githost has not counted some of them yet, the card says "at least", or "Counting
 *   lines…" when nothing is counted.
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
          <span class="components">
            @if (repositories()?.status === 'error') {
              <span class="muted">Components unavailable</span>
            } @else if (componentCount() === undefined) {
              <span class="muted">Loading…</span>
            } @else {
              {{ componentCount() }} {{ componentCount() === 1 ? 'component' : 'components' }}
            }
          </span>
          @if (lines(); as lines) {
            <span class="lines">
              @if (lines === 'error') {
                <span class="muted">Lines unavailable</span>
              } @else if (lines.partial && lines.main === 0 && lines.test === 0) {
                <span class="muted">Counting lines…</span>
              } @else {
                {{ lines.partial ? 'at least ' : '' }}{{ format(lines.main) }}
                {{ lines.main === 1 ? 'line' : 'lines' }}, {{ format(lines.test) }} in tests
              }
            </span>
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

    .components,
    .lines {
      display: block;
    }

    .muted {
      color: #6b7280;
    }
  `,
})
export class ProjectCard {
  readonly project = input.required<Project>();

  private readonly store = inject(ProjectsStore);
  private readonly loc = inject(LocStore);

  protected readonly repositories = computed(() => {
    const projectId = this.project().id;
    return projectId ? this.store.repositories()[projectId] : undefined;
  });

  protected readonly componentCount = computed(() => {
    const repositories = this.repositories();
    return repositories?.status === 'loaded' ? repositories.entries.length : undefined;
  });

  /** The project's lines of code, 'error' when qits-githost failed, undefined until known. */
  protected readonly lines = computed(() => {
    if (this.loc.status() === 'error') return 'error' as const;
    const repositories = this.repositories();
    if (repositories?.status !== 'loaded') return undefined;
    const ids = repositories.entries.flatMap((entry) => entry.repository?.id ?? []);
    return this.loc.totals(ids);
  });

  /** Thousands separated with commas, the same on every machine. */
  protected format(value: number): string {
    return value.toLocaleString('en-US');
  }

  constructor() {
    // In the browser only: the server render has no `qits-session` cookie to send. Only the
    // project id is tracked: `loadRepositories` reads the store's state, and tracking that would
    // fetch again every time an answer lands, without end after an error.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const projectId = this.project().id;
      if (browser && projectId) untracked(() => void this.store.loadRepositories(projectId));
    });
  }
}
