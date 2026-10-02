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
import { Stat } from '../ui/components/stat/stat';

/** How many languages the card names before it sums the rest as "Other". */
export const LANGUAGES_SHOWN = 4;

/**
 * One project in the picker: its name, and facts about it read from its repositories.
 *
 * - Every repository counts as one component, shown in a `ui-stat` tile. The list answer carries
 *   the project's wrapper in a field of its own, so it is not counted.
 * - Its lines of code per language, summed over its repositories, main and test lines apart,
 *   largest first: the first {@link LANGUAGES_SHOWN} by name, and the rest summed as "Other"
 *   (`LocStore`, one request for all cards). No grand total: the rows say it.
 * - While qits-githost has not counted some repositories yet, a note says so, or "Counting
 *   lines…" when nothing is counted.
 */
@Component({
  selector: 'app-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardSilent, CardHeader, CardBody, Stat],
  host: { class: 'block' },
  template: `
    <a
      class="card-link block rounded-xl text-inherit no-underline hover:ring-1 hover:ring-gray-400 focus-visible:ring-1 focus-visible:ring-gray-400"
      [routerLink]="['/projects', project().slug]"
    >
      <ui-card-silent>
        <card-header>{{ project().name }}</card-header>
        <card-body>
          <div class="mx-auto w-fit">
            <ui-stat class="components" label="Components">
              @if (repositories()?.status === 'error') {
                <span class="text-base font-normal text-gray-500">Unavailable</span>
              } @else if (componentCount() === undefined) {
                <span class="text-base font-normal text-gray-500">Loading…</span>
              } @else {
                {{ componentCount() }}
              }
            </ui-stat>
            @if (lines(); as lines) {
              @if (lines === 'error') {
                <!-- The table's frame, four rows tall, with the message in the middle. -->
                <table class="languages mt-2 border-collapse text-[0.8125rem] tabular-nums">
                  <thead class="bg-gray-200/70 text-gray-500">
                    <tr>
                      <th scope="col" class="py-px pr-6 pl-2 text-left font-normal">Language</th>
                      <th scope="col" class="px-2 py-px text-right font-normal">Main</th>
                      <th scope="col" class="py-px pr-2 pl-4 text-right font-normal">Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        colspan="3"
                        class="lines h-[calc(4*(1.21875rem+2px))] text-center align-middle text-gray-500"
                      >
                        Lines unavailable
                      </td>
                    </tr>
                  </tbody>
                </table>
              } @else if (lines.partial && lines.main === 0 && lines.test === 0) {
                <span class="lines block text-[0.8125rem] text-gray-500">Counting lines…</span>
              } @else if (lines.partial) {
                <span class="lines block text-[0.8125rem] text-gray-500"
                  >Still counting some repositories</span
                >
              } @else if (!lines.languages.length) {
                <span class="lines block text-[0.8125rem] text-gray-500">No lines yet</span>
              }
              @if (languageRows().length) {
                <table class="languages mt-2 border-collapse text-[0.8125rem] tabular-nums">
                  <thead class="bg-gray-200/70 text-gray-500">
                    <tr>
                      <th scope="col" class="py-px pr-6 pl-2 text-left font-normal">Language</th>
                      <th scope="col" class="px-2 py-px text-right font-normal">Main</th>
                      <th scope="col" class="py-px pr-2 pl-4 text-right font-normal">Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of languageRows(); track row.language) {
                      <tr class="even:bg-gray-100">
                        <th scope="row" class="py-px pr-6 pl-2 text-left font-normal">
                          {{ row.language }}
                        </th>
                        <td class="px-2 py-px text-right">{{ format(row.main) }}</td>
                        <td class="py-px pr-2 pl-4 text-right">{{ format(row.test) }}</td>
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
