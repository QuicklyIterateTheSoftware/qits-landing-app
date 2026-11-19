import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  QitsEntity,
  QitsField,
  qitsResource,
  sourceMark,
  type QitsDomainEvent,
} from '@qits/angular';
import { BUILD_EVENTS, buildOfRepository } from '$core/ci/build-events';
import type { CiSummaryRun } from '$core/ci/ci-runs.consumes';
import { ACTIVE_RUNS, REPOSITORY_SUMMARIES } from '$core/ci/ci.operations';
import {
  CI_RUN_STATUSES,
  ciRepositoryHref,
  ciRows,
  ciRunHref,
  filterCiRows,
  isRunStatus,
  projectActiveRuns,
  runStatusLabel,
  runStatusTone,
  type CiFilters,
  type CiRepositoryRow,
} from '$core/ci/project-ci';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The open project's CI, at `/projects/<slug>/ci` (qits-2314): one row per repository of the
 * project, each with its newest run (status, branch, commit, when) and its newest run on main,
 * ordered by the newest run, newest first; a repository without a run comes last, "No runs yet".
 * Above them, "Running now": the project's queued and running runs, hidden while there are none.
 *
 * Three reads, each its own `qitsResource`, in the browser only (the server render has no session):
 * the project's repositories (`PROJECT_REPOSITORIES`), every repository's summary from qits-ci
 * (`REPOSITORY_SUMMARIES`, one bounded answer) and every active run (`ACTIVE_RUNS`). The rows join
 * the summaries to the repositories by repository id (`ciRows`), never by the summary's
 * `projectId`, which qits-ci knows only for a push on the public address; the active runs are
 * narrowed to the project's repository ids the same way.
 *
 * The filters are the query: `?repository=` (a part of the name, any case) and `?status=` (the
 * newest run's status, one of `CI_RUN_STATUSES`), applied here to the one answer (`filterCiRows`).
 * A change writes the URL, so a filter can be bookmarked and Back undoes it (typing on in the
 * repository field replaces the entry it started).
 *
 * Links lead to qits-ci's own pages until qits-2320 and qits-2321 bring them here: a repository's
 * name to `/<slug>/<group>/<repository>` (its component, else its archetype's category; the
 * wrapper, which has neither, to qits-ci's tree with it expanded), a run to `/runs/<id>`.
 *
 * States: loading, a failed read with Retry, "No CI runs for this project yet" when no repository
 * of the project has a run, and "No repository matches" with a link that clears the filters.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` (`BuildStatusChanged`, `BuildSuccessful`, `BuildFailed`)
 * naming a repository of the project (`buildOfRepository`) → the summaries and the active runs
 * (each resource's `refreshOn`, debounced 1 s as `ProjectReleaseRequests`' is); `SCMPublishCommit`
 * to the wrapper's main branch (`movesWrapper`) → the project's repositories, as on the
 * Repositories page. No polling. A refresh keeps the rows on show.
 */
@Component({
  selector: 'app-ci-runs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsField, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="CI">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          Every repository of this project with its newest CI run and its newest run on main, the
          most recent first.
        </p>
        <ui-load-failure
          message="This project’s CI runs could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <section
            aria-labelledby="ci-running-now"
            class="mb-6"
            [class]="running().length ? 'block' : 'hidden'"
            [attr.data-qits-source]="activeSource"
          >
            <h2 id="ci-running-now" class="mt-0 mb-2 text-base font-semibold">Running now</h2>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (run of running(); track run.id) {
                <li
                  class="flex flex-wrap items-baseline gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
                  [qitsEntity]="run"
                  entityKey="id"
                  data-active-run
                >
                  <ui-chip
                    [label]="statusLabel(run.status)"
                    [tone]="tone(run.status)"
                    [fieldOf]="run"
                    [qitsField]="marks.status"
                  />
                  <a
                    class="font-semibold text-accent no-underline hover:underline"
                    [attr.href]="runHref(run.id)"
                    [qitsEntity]="run"
                    entityKey="repoId"
                    [entitySource]="repositories"
                    [fieldOf]="run"
                    [qitsField]="marks.repoId"
                    >{{ repositoryName(run.repoId) }}</a
                  >
                  <span
                    class="font-mono text-xs text-fg-muted"
                    [fieldOf]="run"
                    [qitsField]="marks.branch"
                    >{{ run.branch }}</span
                  >
                  <span
                    class="text-xs text-fg-muted"
                    [title]="instant(run.startedAt ?? run.createdAt)"
                    [fieldOf]="run"
                    [qitsField]="marks.since"
                    >{{ run.startedAt ? 'started' : 'queued' }}
                    {{ ago(run.startedAt ?? run.createdAt) }}</span
                  >
                </li>
              }
            </ul>
          </section>

          <div
            role="search"
            class="mb-3 flex flex-wrap items-center gap-2 text-sm"
            [class]="anyRun() ? 'flex' : 'hidden'"
          >
            <input
              type="search"
              class="min-w-48 rounded-md border border-line bg-surface px-2 py-1 text-sm"
              placeholder="Filter by repository"
              aria-label="Filter by repository"
              [value]="filters().repository"
              (input)="filterRepository($any($event.target).value)"
            />
            <select
              class="rounded-md border border-line bg-surface px-2 py-1 text-sm"
              aria-label="Status of the newest run"
              (change)="filterStatus($any($event.target).value)"
            >
              <option value="" [selected]="!filters().status">Any status</option>
              @for (status of statuses; track status) {
                <option [value]="status" [selected]="filters().status === status">
                  {{ statusLabel(status) }}
                </option>
              }
            </select>
          </div>

          <ul
            class="m-0 flex list-none flex-col gap-2 p-0"
            aria-label="Repositories"
            [attr.data-qits-source]="summarySource"
          >
            @for (row of shown(); track row.id) {
              <li
                class="flex flex-col gap-1 rounded-md border border-line bg-surface px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4"
                [qitsEntity]="row"
                entityKey="id"
                data-ci-row
              >
                <a
                  class="min-w-0 font-semibold wrap-anywhere text-accent no-underline hover:underline sm:w-64"
                  [attr.href]="repositoryHref(row)"
                  [qitsEntity]="row"
                  entityKey="id"
                  [entitySource]="repositories"
                  [fieldOf]="row"
                  [qitsField]="marks.name"
                  >{{ row.name }}</a
                >
                @if (row.lastRun; as run) {
                  <a
                    class="flex min-w-0 flex-wrap items-baseline gap-2 text-fg no-underline hover:underline"
                    [attr.href]="runHref(run.id)"
                    [title]="'Open the run in CI'"
                    data-last-run
                  >
                    <ui-chip
                      [label]="statusLabel(run.status)"
                      [tone]="tone(run.status)"
                      [fieldOf]="row"
                      [qitsField]="marks.lastStatus"
                    />
                    <span
                      class="font-mono text-xs wrap-anywhere text-fg-soft"
                      [fieldOf]="row"
                      [qitsField]="marks.lastBranch"
                      >{{ run.branch }}</span
                    >
                    <span
                      class="font-mono text-xs text-fg-muted"
                      [title]="run.commitSha ?? ''"
                      [fieldOf]="row"
                      [qitsField]="marks.lastSha"
                      >{{ short(run.commitSha) }}</span
                    >
                    <span
                      class="text-xs text-fg-muted"
                      [title]="instant(run.createdAt)"
                      [fieldOf]="row"
                      [qitsField]="marks.lastCreated"
                      >{{ ago(run.createdAt) }}</span
                    >
                  </a>
                  @if (row.lastMainRun; as main) {
                    <a
                      class="inline-flex items-baseline gap-1 text-xs text-fg-muted no-underline hover:underline sm:ml-auto"
                      [attr.href]="runHref(main.id)"
                      [title]="mainTitle(main)"
                      data-main-run
                    >
                      main
                      <ui-chip
                        [label]="statusLabel(main.status)"
                        [tone]="tone(main.status)"
                        [fieldOf]="row"
                        [qitsField]="marks.mainStatus"
                      />
                    </a>
                  }
                } @else {
                  <span class="text-xs text-fg-muted">No runs yet</span>
                }
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && !anyRun() ? 'block' : 'hidden'"
          >
            No CI runs for this project yet.
          </p>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && anyRun() && shown().length === 0 ? 'block' : 'hidden'"
          >
            No repository matches.
            <a
              class="text-accent no-underline hover:underline"
              [routerLink]="[]"
              [queryParams]="{ repository: null, status: null }"
              queryParamsHandling="merge"
              >Clear filters</a
            >
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class CiRunsPage {
  private readonly selected = inject(SelectedProject);
  private readonly origins = inject(PlatformOrigins);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open project's id, in the browser only: the reads wait for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's repositories, read again after a commit to its wrapper's main branch. */
  protected readonly repositories = qitsResource(
    PROJECT_REPOSITORIES,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: ['SCMPublishCommit'],
        when: (event) => this.commitsToWrapper(event),
      },
    },
  );

  /** Every repository's newest runs, read again after a build of one of the project's. */
  protected readonly summaries = qitsResource(
    REPOSITORY_SUMMARIES,
    () => (this.projectId() ? {} : undefined),
    { refreshOn: { names: BUILD_EVENTS, when: (event) => this.ofProject(event) } },
  );

  /** Every queued or running run, read again after a build of one of the project's repositories. */
  protected readonly active = qitsResource(ACTIVE_RUNS, () => (this.projectId() ? {} : undefined), {
    refreshOn: { names: BUILD_EVENTS, when: (event) => this.ofProject(event) },
  });

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The ids of the project's repositories: what the summaries and the active runs are joined on. */
  private readonly repositoryIds = computed(
    (): ReadonlySet<string> =>
      new Set(
        (this.repositoryAnswer()?.entries ?? []).flatMap((entry) =>
          entry.repository?.id ? [entry.repository.id] : [],
        ),
      ),
  );

  /** Every repository of the project, with its newest runs, newest first. */
  private readonly rows = computed(() =>
    ciRows(
      this.repositoryAnswer()?.entries ?? [],
      this.summaries.hasValue() ? (this.summaries.value()?.repositories ?? []) : [],
    ),
  );

  /** Whether any repository of the project has a run: else the page says it has none. */
  protected readonly anyRun = computed(() => this.rows().some((row) => !!row.lastRun));

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The filters the query names; an unknown `?status=` filters nothing. */
  protected readonly filters = computed((): CiFilters => {
    const query = this.query();
    const status = query.get('status');
    return {
      repository: query.get('repository') ?? '',
      status: isRunStatus(status) ? status : undefined,
    };
  });

  /** The rows the filters keep. */
  protected readonly shown = computed(() => filterCiRows(this.rows(), this.filters()));

  /** The project's queued and running runs, in qits-ci's order. */
  protected readonly running = computed(() =>
    projectActiveRuns(
      this.active.hasValue() ? (this.active.value()?.runs ?? []) : [],
      this.repositoryIds(),
    ),
  );

  /** Each repository's name by its id, for the active runs. */
  private readonly names = computed(
    (): ReadonlyMap<string, string> =>
      new Map(
        (this.repositoryAnswer()?.entries ?? []).flatMap((entry) =>
          entry.repository?.id ? [[entry.repository.id, entry.repository.name ?? ''] as const] : [],
        ),
      ),
  );

  /**
   * The page's read: failed when the repositories or the summaries could not be read, loaded once
   * both answered. The active runs are a part of the page only: a failed read of them shows none.
   */
  protected readonly state = computed((): LoadState => {
    const reads = [loadState(this.repositories), loadState(this.summaries)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** The reads the rows and the active runs show, as their data marks name them. */
  protected readonly summarySource = sourceMark(REPOSITORY_SUMMARIES);
  protected readonly activeSource = sourceMark(ACTIVE_RUNS);

  protected readonly marks = MARKS;
  protected readonly statuses = CI_RUN_STATUSES;
  protected readonly statusLabel = runStatusLabel;
  protected readonly tone = runStatusTone;
  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }

  /** Whether a build event is about a run of one of the project's repositories. */
  private ofProject(event: QitsDomainEvent): boolean {
    return buildOfRepository(event, [...this.repositoryIds()]);
  }

  protected repositoryName(repoId: string | undefined): string {
    return (repoId && this.names().get(repoId)) || (repoId ?? '');
  }

  protected repositoryHref(row: CiRepositoryRow): string | null {
    return ciRepositoryHref(this.origins.page('ci'), this.selected.slug() ?? '', row) ?? null;
  }

  protected runHref(runId: string | undefined): string | null {
    return ciRunHref(this.origins.page('ci'), runId) ?? null;
  }

  protected mainTitle(run: CiSummaryRun): string {
    return `Newest run on main: ${runStatusLabel(run.status)}, ${shortShaOrNone(run.commitSha)}, ${formatInstant(run.createdAt)}`;
  }

  /** Reads again what failed. */
  protected retry(): void {
    if (this.repositories.status() === 'error') this.repositories.reload();
    if (this.summaries.status() === 'error') this.summaries.reload();
  }

  /**
   * `?repository=`: the field's text, empty dropping it. Typing on in a field that already filters
   * replaces the history entry, so Back undoes the whole filter rather than one character.
   */
  protected filterRepository(text: string): void {
    this.navigate({ repository: text || null }, !!this.filters().repository && !!text);
  }

  /** `?status=`: the chosen status, "Any status" dropping it. */
  protected filterStatus(status: string): void {
    this.navigate({ status: isRunStatus(status) ? status : null }, false);
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}

/**
 * The data marks of what a row and an active run show (each a class constant, as the rule reads).
 * A row is the summary of its repository; its name, and an active run's repository, are joined
 * from the project's repositories (`entitySource`).
 */
const MARKS = {
  status: { derived: ['status'] },
  repoId: { derived: ['repoId'] },
  branch: { derived: ['branch'] },
  since: { derived: ['startedAt', 'createdAt'] },
  name: { derived: ['name'] },
  lastStatus: { derived: ['lastRun.status'] },
  lastBranch: { derived: ['lastRun.branch'] },
  lastSha: { derived: ['lastRun.commitSha'] },
  lastCreated: { derived: ['lastRun.createdAt'] },
  mainStatus: { derived: ['lastMainRun.status', 'lastMainRun.commitSha', 'lastMainRun.createdAt'] },
} as const;
