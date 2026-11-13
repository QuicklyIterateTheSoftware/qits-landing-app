import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
  type QitsDomainEvent,
} from '@qits/angular';
import { LinesOfCode, type LanguageLines } from '$core/loc/lines-of-code';
import type { Project } from '$core/projects/selected-project';
import { LIST_PROJECT_WRAPPER } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import { loadState } from '$core/resources/load-state';
import { countsAsWork } from '$core/work/work.consumes';
import { PROJECT_CARD_WORK } from '$core/work/work.operations';
import { CardBody, CardExpandable, CardHeader } from '$ui/components/card/base-card';
import { CardSilent } from '$ui/components/card/card-silent';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { Stat } from '$ui/components/stat/stat';

/** How many languages the card names before it sums the rest as "Other". */
export const LANGUAGES_SHOWN = 4;

/**
 * One project in the picker: its name, and facts about it read from its repositories. The name
 * opens the project, through the declared exit `open-project-card:project`.
 *
 * - Two `ui-stat` tiles side by side: "Work", the project's work entities that count as work
 *   (`countsAsWork` in `core/work/work.consumes.ts`, REFINED for now), and "Components".
 * - Every repository counts as one component. The list answer carries
 *   the project's wrapper in a field of its own, so it is not counted.
 * - Its lines of code per language, summed over its repositories, main and test lines apart,
 *   largest first: the first {@link LANGUAGES_SHOWN} by name, and the rest summed as "Other"
 *   (`LinesOfCode`, one request for all cards). No grand total: the rows say it.
 * - A repository qits-githost counts only at an older commit (`STALE`) shows that count; one never
 *   counted is left out. The table shows its loading spinner only while nothing at all is counted.
 *
 * It reads through `qitsResource` (qits-2146): the project's repositories (`LIST_PROJECT_WRAPPER`)
 * and its planning tree (`PROJECT_CARD_WORK`), in the browser only (the server render has no
 * session to send); the lines of code are `LinesOfCode`'s, shared by every card. It marks what it
 * shows (qits-2141): the card is the project, its title the project's name, each tile the read it
 * counts, the language rows derived from the repositories' ids (their lines are qits-githost's
 * `listLoc`, which the table names as its source).
 *
 * Staleness (qits-1270): "Components" → the repositories' `refreshOn` (a commit to the project's
 * wrapper on its main branch reads them again, `movesWrapper`).
 * The lines of code are read once (`LinesOfCode`): qits-githost emits no event when it has counted
 * a commit, so none can say they moved. "Work" is read once, as `WorkStore` read a card's.
 */
@Component({
  selector: 'app-project-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    CardSilent,
    CardHeader,
    CardBody,
    CardExpandable,
    Spinner,
    Stat,
  ],
  host: { class: 'block' },
  template: `
    <!--
      The whole card opens the project: the title's link stretches over the card (after:inset-0,
      above the positioned tiles and table with after:z-[1]), and the expand button sits above it
      (z-10), so no button is nested in a link. The hover ring is on the card itself.
    -->
    <div
      class="relative rounded-xl has-[a.card-link:focus-visible]:ring-1 has-[a.card-link:focus-visible]:ring-line-strong hover:ring-1 hover:ring-line-strong"
      [qitsEntity]="project()"
      entityKey="id"
    >
      <ui-card-silent>
        <card-header class="bg-surface-muted text-center text-[1.35rem] text-fg">
          <a
            class="card-link text-inherit no-underline outline-none after:absolute after:inset-0 after:z-[1] after:rounded-xl"
            [qitsExit]="opening.project"
            [exitParams]="{ slug: project().slug ?? '' }"
            [fieldOf]="project()"
            qitsField="name"
            >{{ project().name }}</a
          >
        </card-header>
        <card-body flush>
          <div class="w-full">
            <div class="grid grid-cols-2">
              <ui-spinner [state]="workState()" [qitsEntityList]="work">
                <ui-stat
                  class="work w-full"
                  label="Work"
                  mirrored
                  [fieldOf]="workShown()"
                  [qitsField]="{ derived: ['entities'] }"
                >
                  {{ workCount() ?? '–' }}
                </ui-stat>
              </ui-spinner>
              <ui-spinner [state]="componentsState()" [qitsEntityList]="repositories">
                <ui-stat
                  class="components w-full [&_dt]:border-l-[0.5px] [&_dt]:border-line-strong"
                  label="Components"
                  [fieldOf]="repositoriesShown()"
                  [qitsField]="{ derived: ['entries'] }"
                >
                  {{ componentCount() ?? '–' }}
                </ui-stat>
              </ui-spinner>
            </div>
          </div>
        </card-body>
        <card-expandable (opened)="loadLines()">
          <ui-spinner
            [state]="linesState()"
            [qitsEntityList]="repositories"
            [fieldOf]="repositoriesShown()"
            [qitsField]="{ derived: ['entries'] }"
          >
            <table
              class="languages w-full border-collapse text-[0.8125rem] tabular-nums"
              data-qits-source="qits-githost-service#listLoc"
            >
              <thead class="text-[0.5417rem] text-fg-muted">
                <tr>
                  <th
                    scope="col"
                    class="pt-[calc(0.40625rem+1px)] pb-px pr-6 pl-2 text-left font-normal"
                  >
                    Language
                  </th>
                  <th
                    scope="col"
                    class="px-2 pt-[calc(0.40625rem+1px)] pb-px text-right font-normal"
                  >
                    Main
                  </th>
                  <th
                    scope="col"
                    class="pt-[calc(0.40625rem+1px)] pb-px pr-2 pl-4 text-right font-normal"
                  >
                    Tests
                  </th>
                </tr>
              </thead>
              <tbody>
                @if (!languageRows().length) {
                  <!-- No rows to show: one cell four rows tall, any message in its middle. -->
                  <tr>
                    <td
                      colspan="3"
                      class="lines h-[calc(4*(1.21875rem+2px))] text-center align-middle text-fg-muted"
                    >
                      {{ linesState() === 'loaded' ? 'No lines yet' : '' }}
                    </td>
                  </tr>
                } @else {
                  @for (row of languageRows(); track row.language) {
                    <tr class="even:bg-surface-muted" [qitsEntity]="row" entityKey="language">
                      <th
                        scope="row"
                        class="py-px pr-6 pl-2 text-left font-normal"
                        [fieldOf]="row"
                        qitsField="language"
                      >
                        {{ row.language }}
                      </th>
                      <td
                        class="px-2 py-px text-right"
                        [fieldOf]="row"
                        [qitsField]="{ derived: ['main'] }"
                      >
                        {{ format(row.main) }}
                      </td>
                      <td
                        class="py-px pr-2 pl-4 text-right"
                        [fieldOf]="row"
                        [qitsField]="{ derived: ['test'] }"
                      >
                        {{ format(row.test) }}
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </ui-spinner>
        </card-expandable>
      </ui-card-silent>
    </div>
  `,
})
export class ProjectCard {
  readonly project = input.required<Project>();

  /** The card's title opens the project (`open-project-card`, epic qits-2000). */
  protected readonly opening = outcomes('open-project-card', { project: exit('projects/:slug') });

  private readonly loc = inject(LinesOfCode);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The project's id, in the browser only: the reads wait for it. */
  private readonly projectId = computed(() => (this.browser ? this.project().id : undefined));

  /** The project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    LIST_PROJECT_WRAPPER,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    { refreshOn: { names: ['SCMPublishCommit'], when: (event) => this.commitsToWrapper(event) } },
  );

  /** The project's planning tree, read once. */
  protected readonly work = qitsResource(PROJECT_CARD_WORK, () => {
    const project = this.projectId();
    return project ? { path: { project } } : undefined;
  });

  /** The repositories read; an empty one until it answered. */
  protected readonly repositoriesShown = computed(
    () => (this.repositories.hasValue() ? this.repositories.value() : undefined) ?? NO_ANSWER,
  );

  /** The planning tree read; an empty one until it answered. */
  protected readonly workShown = computed(
    () => (this.work.hasValue() ? this.work.value() : undefined) ?? NO_ANSWER,
  );

  protected readonly workState = computed((): LoadState => loadState(this.work));

  /** How many of the project's work entities count as work (`countsAsWork`), once loaded. */
  protected readonly workCount = computed(() =>
    this.work.hasValue()
      ? (this.work.value()?.entities ?? []).filter(countsAsWork).length
      : undefined,
  );

  /** Loading until the repositories answer (or fail). */
  protected readonly componentsState = computed((): LoadState => loadState(this.repositories));

  protected readonly componentCount = computed(() =>
    this.repositories.hasValue() ? (this.repositories.value()?.entries ?? []).length : undefined,
  );

  /** The project's lines of code, 'error' when qits-githost failed, undefined until known. */
  protected readonly lines = computed(() => {
    if (this.loc.status() === 'error') return 'error' as const;
    if (!this.repositories.hasValue()) return undefined;
    const entries = this.repositories.value()?.entries ?? [];
    return this.loc.totals(entries.flatMap((entry) => entry.repository?.id ?? []));
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

  /** The lines are loaded on first opening only (one request for every card, then shared). */
  protected loadLines(): void {
    this.loc.load();
  }

  /** Thousands separated with commas, the same on every machine. */
  protected format(value: number): string {
    return value.toLocaleString('en-US');
  }

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(
      event,
      this.repositories.hasValue() ? this.repositories.value() : undefined,
    );
  }
}

/** What a tile's mark reads before its read answered: nothing. */
const NO_ANSWER: { readonly entries?: readonly unknown[] } = {};
