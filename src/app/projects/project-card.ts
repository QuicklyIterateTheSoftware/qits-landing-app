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
import { LocStore, type LanguageLines } from '../core/loc/loc.store';
import { ProjectsStore, type Project } from '../core/projects/projects.store';
import { CardBody, CardHeader } from '../ui/components/card/base-card';
import { CardSilent } from '../ui/components/card/card-silent';

/** How many languages the card names before it sums the rest as "Other". */
export const LANGUAGES_SHOWN = 4;

/**
 * One project in the picker: its name, and facts about it read from its repositories.
 *
 * - Every repository counts as one component. The list answer carries the project's wrapper in a
 *   field of its own, so it is not counted.
 * - Its lines of code per language, summed over its repositories, main and test lines apart,
 *   largest first: the first {@link LANGUAGES_SHOWN} by name, and the rest summed as "Other"
 *   (`LocStore`, one request for all cards). No grand total: the rows say it.
 * - While qits-githost has not counted some repositories yet, a note says so, or "Counting
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
          <div class="facts">
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
              @if (lines === 'error') {
                <span class="lines muted">Lines unavailable</span>
              } @else if (lines.partial && lines.main === 0 && lines.test === 0) {
                <span class="lines muted">Counting lines…</span>
              } @else if (lines.partial) {
                <span class="lines muted">Still counting some repositories</span>
              } @else if (!lines.languages.length) {
                <span class="lines muted">No lines yet</span>
              }
              @if (languageRows().length) {
                <table class="languages">
                  <thead>
                    <tr>
                      <th scope="col">Language</th>
                      <th scope="col">Main</th>
                      <th scope="col">Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of languageRows(); track row.language) {
                      <tr>
                        <th scope="row">{{ row.language }}</th>
                        <td>{{ format(row.main) }}</td>
                        <td>{{ format(row.test) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </div>
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

    .facts {
      width: fit-content;
      margin-inline: auto;
    }

    .components,
    .lines {
      display: block;
    }

    .muted {
      color: #6b7280;
    }

    .lines {
      font-size: 0.8125rem;
    }

    .languages {
      margin-top: 0.5rem;
      border-collapse: collapse;
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
    }

    .languages th,
    .languages td {
      padding: 0.0625rem 0;
      font-weight: 400;
      text-align: right;
    }

    .languages th[scope='row'],
    .languages thead th:first-child {
      padding-right: 1.5rem;
      text-align: left;
    }

    .languages td:last-child,
    .languages thead th:last-child {
      padding-left: 1rem;
    }

    .languages thead th {
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

  /** The lines per language: the largest {@link LANGUAGES_SHOWN}, then the rest as "Other". */
  protected readonly languageRows = computed((): readonly LanguageLines[] => {
    const lines = this.lines();
    if (!lines || lines === 'error') return [];
    const all = lines.languages;
    if (all.length <= LANGUAGES_SHOWN) return all;
    const rest = all.slice(LANGUAGES_SHOWN);
    return [
      ...all.slice(0, LANGUAGES_SHOWN),
      {
        language: 'Other',
        main: rest.reduce((sum, row) => sum + row.main, 0),
        test: rest.reduce((sum, row) => sum + row.test, 0),
      },
    ];
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
