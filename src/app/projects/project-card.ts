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
import { Spinner, type LoadState } from '../ui/components/spinner/spinner';
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
 * - A repository qits-githost counts only at an older commit (`STALE`) shows that count; one never
 *   counted is left out. The table shows its loading spinner only while nothing at all is counted.
 */
@Component({
  selector: 'app-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardSilent, CardHeader, CardBody, Spinner, Stat],
  host: { class: 'block' },
  template: `
    <a
      class="card-link block rounded-xl text-inherit no-underline hover:ring-1 hover:ring-gray-400 focus-visible:ring-1 focus-visible:ring-gray-400"
      [routerLink]="['/projects', project().slug]"
    >
      <ui-card-silent>
        <card-header class="bg-charcoal-brown-100 text-charcoal-brown-900">{{
          project().name
        }}</card-header>
        <card-body flush>
          <div class="w-full">
            <!-- 50/50: the left slot is for the "Work" tile. -->
            <div class="grid grid-cols-2 gap-2">
              <div></div>
              <ui-spinner [state]="componentsState()">
                <ui-stat class="components w-full" label="Components">
                  {{ componentCount() ?? '–' }}
                </ui-stat>
              </ui-spinner>
            </div>
            <ui-spinner [state]="linesState()">
              <table class="languages w-full border-collapse text-[0.8125rem] tabular-nums">
                <thead class="text-[0.5417rem] leading-[1.21875rem] text-gray-500">
                  <tr>
                    <th scope="col" class="py-px pr-6 pl-2 text-left font-normal">Language</th>
                    <th scope="col" class="px-2 py-px text-right font-normal">Main</th>
                    <th scope="col" class="py-px pr-2 pl-4 text-right font-normal">Tests</th>
                  </tr>
                </thead>
                <tbody>
                  @if (!languageRows().length) {
                    <!-- No rows to show: one cell four rows tall, any message in its middle. -->
                    <tr>
                      <td
                        colspan="3"
                        class="lines h-[calc(4*(1.21875rem+2px))] text-center align-middle text-gray-500"
                      >
                        {{ linesState() === 'loaded' ? 'No lines yet' : '' }}
                      </td>
                    </tr>
                  } @else {
                    @for (row of languageRows(); track row.language) {
                      <tr class="even:bg-gray-100">
                        <th scope="row" class="py-px pr-6 pl-2 text-left font-normal">
                          {{ row.language }}
                        </th>
                        <td class="px-2 py-px text-right">{{ format(row.main) }}</td>
                        <td class="py-px pr-2 pl-4 text-right">{{ format(row.test) }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </ui-spinner>
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

  /** True until the repositories answer (or fail). */
  protected readonly componentsState = computed((): LoadState => {
    const status = this.repositories()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
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

  /** Loading until something is counted; an error when qits-githost failed. */
  protected readonly linesState = computed((): LoadState => {
    const lines = this.lines();
    if (lines === 'error') return 'error';
    if (!lines || (lines.uncounted && !lines.languages.length)) return 'loading';
    return 'loaded';
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
