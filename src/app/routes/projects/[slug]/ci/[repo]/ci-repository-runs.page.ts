import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsResource,
  sourceMark,
  type QitsDomainEvent,
} from '@qits/angular';
import { BUILD_EVENTS, buildOfRepository } from '$core/ci/build-events';
import type { CiRun } from '$core/ci/ci-runs.consumes';
import { REPOSITORY_RUNS, RUNS_LIMIT } from '$core/ci/ci.operations';
import {
  CI_RUN_STATUSES,
  ciRunHref,
  isRunStatus,
  runStatusLabel,
  runStatusTone,
} from '$core/ci/project-ci';
import {
  filterRepositoryRuns,
  isRunTrigger,
  repositoryNamed,
  RUN_TRIGGERS,
  runDuration,
  runProvenance,
  runTrigger,
  shortRunId,
  type RepositoryRunFilters,
} from '$core/ci/repository-ci';
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
 * One repository's CI, at `/projects/<slug>/ci/<repository name>` (qits-2320): the repository's
 * newest {@link RUNS_LIMIT} runs in one flat list, newest first as qits-ci answers. Each row says
 * the run's status, short id, branch, short commit, when it was queued (the instant in the title),
 * how long it took (`runDuration`: "running" while unfinished) and how it was triggered (a `push`
 * or `event` chip; an `EVENT` run's event and config file beside it). A cancelled run says why, and
 * links the newer run that superseded it. With exactly {@link RUNS_LIMIT} runs a line says the
 * list is the newest ones; there is no show-all (qits-ci's unbounded read stays unused).
 *
 * Two reads, each its own `qitsResource`, in the browser only (the server render has no session):
 * the project's repositories (`PROJECT_REPOSITORIES`), where the address's name is found
 * (`repositoryNamed`), and that repository's runs (`REPOSITORY_RUNS`, `?repositoryId=&limit=`, the
 * read the release request page makes). A name the project does not hold says so, with a link back
 * to the project's CI page, and reads no runs.
 *
 * The filters are the query: `?status=` (one of `CI_RUN_STATUSES`), `?branch=` (a part of the
 * branch, any case) and `?trigger=` (`push` or `event`), applied here to the one answer
 * (`filterRepositoryRuns`); a value the page does not know filters nothing. A change writes the
 * URL, so a filter can be bookmarked and Back undoes it (typing on in the branch field replaces
 * the entry it started).
 *
 * Runs link to qits-ci's own page, `/runs/<id>`, until qits-2321 brings it here.
 *
 * States: loading, a failed read with Retry, the unknown repository, "No CI runs for this
 * repository yet", and "No run matches" with a link that clears the filters.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` naming this repository (`buildOfRepository`) → the runs
 * (`refreshOn`, debounced as `CiRunsPage`'s); `SCMPublishCommit` to the wrapper's main branch
 * (`movesWrapper`) → the project's repositories. No polling. A refresh keeps the rows on show.
 */
@Component({
  selector: 'app-ci-repository-runs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsExit,
    QitsField,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="repo()">
        <p class="mt-0 mb-4 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.ci"
            [exitParams]="{ slug: slug() }"
            data-back
            >← CI</a
          >
          <span class="text-fg-soft"> · This repository’s CI runs, the most recent first.</span>
        </p>
        <ui-load-failure
          message="This repository’s CI runs could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        @if (unknown()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-unknown>
            No repository {{ repo() }} in this project.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.ci"
              [exitParams]="{ slug: slug() }"
              >Back to CI</a
            >
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || unknown()"
        >
          <div
            role="search"
            class="mb-3 flex-wrap items-center gap-2 text-sm"
            [class]="runs().length ? 'flex' : 'hidden'"
          >
            <select
              class="rounded-md border border-line bg-surface px-2 py-1 text-sm"
              aria-label="Status"
              (change)="filterStatus($any($event.target).value)"
            >
              <option value="" [selected]="!filters().status">Any status</option>
              @for (status of statuses; track status) {
                <option [value]="status" [selected]="filters().status === status">
                  {{ statusLabel(status) }}
                </option>
              }
            </select>
            <input
              type="search"
              class="min-w-48 rounded-md border border-line bg-surface px-2 py-1 text-sm"
              placeholder="Filter by branch"
              aria-label="Filter by branch"
              [value]="filters().branch"
              (input)="filterBranch($any($event.target).value)"
            />
            <select
              class="rounded-md border border-line bg-surface px-2 py-1 text-sm"
              aria-label="Trigger"
              (change)="filterTrigger($any($event.target).value)"
            >
              <option value="" [selected]="!filters().trigger">Any trigger</option>
              @for (trigger of triggers; track trigger) {
                <option [value]="trigger" [selected]="filters().trigger === trigger">
                  {{ trigger }}
                </option>
              }
            </select>
          </div>

          <ul
            class="m-0 flex list-none flex-col gap-2 p-0"
            aria-label="Runs"
            [attr.data-qits-source]="runsSource"
          >
            @for (run of shown(); track run.id) {
              <li
                class="flex flex-col gap-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                [qitsEntity]="run"
                entityKey="id"
                data-run
              >
                <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ui-chip
                    [label]="statusLabel(run.status)"
                    [tone]="tone(run.status)"
                    [fieldOf]="run"
                    [qitsField]="marks.status"
                  />
                  <a
                    class="font-mono text-xs font-semibold text-accent no-underline hover:underline"
                    [attr.href]="runHref(run.id)"
                    [title]="'Open the run in CI'"
                    [fieldOf]="run"
                    [qitsField]="marks.id"
                    data-run-link
                    >{{ shortId(run.id) }}</a
                  >
                  <span
                    class="min-w-0 font-mono text-xs wrap-anywhere text-fg-soft"
                    [fieldOf]="run"
                    [qitsField]="marks.branch"
                    data-branch
                    >{{ run.branch }}</span
                  >
                  <span
                    class="font-mono text-xs text-fg-muted"
                    [title]="run.commitSha ?? ''"
                    [fieldOf]="run"
                    [qitsField]="marks.sha"
                    >{{ short(run.commitSha) }}</span
                  >
                  @if (trigger(run.triggerType); as kind) {
                    <ui-chip
                      [label]="kind"
                      tone="neutral"
                      [fieldOf]="run"
                      [qitsField]="marks.trigger"
                      data-trigger
                    />
                  }
                  <span
                    class="text-xs text-fg-muted sm:ml-auto"
                    [title]="instant(run.createdAt)"
                    [fieldOf]="run"
                    [qitsField]="marks.created"
                    >{{ ago(run.createdAt) }}</span
                  >
                  <span
                    class="text-xs text-fg-muted"
                    [fieldOf]="run"
                    [qitsField]="marks.duration"
                    data-duration
                    >{{ duration(run) }}</span
                  >
                </div>
                @if (provenance(run); as from) {
                  <span
                    class="font-mono text-xs wrap-anywhere text-fg-muted"
                    [fieldOf]="run"
                    [qitsField]="marks.provenance"
                    data-provenance
                    >{{ from }}</span
                  >
                }
                @if (run.status === 'CANCELLED' && run.cancellationReason) {
                  <span class="text-xs text-fg-muted" data-cancelled>
                    Cancelled:
                    <span [fieldOf]="run" [qitsField]="marks.reason">{{
                      run.cancellationReason
                    }}</span>
                    @if (run.supersededByRunId) {
                      ·
                      <a
                        class="text-accent no-underline hover:underline"
                        [attr.href]="runHref(run.supersededByRunId)"
                        [fieldOf]="run"
                        [qitsField]="marks.supersededBy"
                        data-superseded-by
                        >newer run</a
                      >
                    }
                  </span>
                }
              </li>
            }
          </ul>
          <p
            class="m-0 mt-3 text-xs text-fg-muted"
            [class]="state() === 'loaded' && runs().length >= limit ? 'block' : 'hidden'"
            data-limit
          >
            The newest {{ limit }} runs.
          </p>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && !runs().length ? 'block' : 'hidden'"
          >
            No CI runs for this repository yet.
          </p>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="state() === 'loaded' && runs().length && !shown().length ? 'block' : 'hidden'"
          >
            No run matches.
            <a
              class="text-accent no-underline hover:underline"
              [routerLink]="[]"
              [queryParams]="{ status: null, branch: null, trigger: null }"
              queryParamsHandling="merge"
              >Clear filters</a
            >
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class CiRepositoryRunsPage {
  private readonly selected = inject(SelectedProject);
  private readonly origins = inject(PlatformOrigins);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');

  /** The open project's slug, for the links back to its CI page. */
  protected readonly slug = computed(() => this.selected.slug() ?? this.params().get('slug') ?? '');

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

  /** The repositories' answer, once there. */
  private readonly repositoryAnswer = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** The repository the address names, once the project's repositories are read. */
  private readonly repository = computed(() =>
    repositoryNamed(this.repositoryAnswer()?.entries ?? [], this.repo()),
  );

  /** Its id: what the runs are read by. */
  private readonly repositoryId = computed(() => this.repository()?.id ?? undefined);

  /** Whether the project's repositories are read and none has the address's name. */
  protected readonly unknown = computed(() => !!this.repositoryAnswer() && !this.repositoryId());

  /** The repository's newest runs, read again after a build of that repository. */
  protected readonly runRead = qitsResource(
    REPOSITORY_RUNS,
    () => {
      const repositoryId = this.repositoryId();
      return repositoryId ? { query: { repositoryId, limit: RUNS_LIMIT } } : undefined;
    },
    { refreshOn: { names: BUILD_EVENTS, when: (event) => this.ofRepository(event) } },
  );

  /** The repository's runs, newest first as qits-ci answers. */
  protected readonly runs = computed(
    (): readonly CiRun[] =>
      (this.runRead.hasValue() ? this.runRead.value()?.runs : undefined) ?? [],
  );

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The filters the query names; a value the page does not know filters nothing. */
  protected readonly filters = computed((): RepositoryRunFilters => {
    const query = this.query();
    const status = query.get('status');
    const trigger = query.get('trigger');
    return {
      status: isRunStatus(status) ? status : undefined,
      branch: query.get('branch') ?? '',
      trigger: isRunTrigger(trigger) ? trigger : undefined,
    };
  });

  /** The runs the filters keep. */
  protected readonly shown = computed(() => filterRepositoryRuns(this.runs(), this.filters()));

  /**
   * The page's read: failed when the repositories or the runs could not be read, loaded once both
   * answered. An unknown name reads no runs: the page says so instead of the spinner.
   */
  protected readonly state = computed((): LoadState => {
    const reads = [loadState(this.repositories), loadState(this.runRead)];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** The read the rows show, as their data marks name it. */
  protected readonly runsSource = sourceMark(REPOSITORY_RUNS);

  /** Back to the project's CI page (qits-2320). */
  protected readonly leaving = outcomes('leave-ci-repository', {
    ci: exit('projects/:slug/ci'),
  });

  protected readonly marks = MARKS;
  protected readonly limit = RUNS_LIMIT;
  protected readonly statuses = CI_RUN_STATUSES;
  protected readonly triggers = RUN_TRIGGERS;
  protected readonly statusLabel = runStatusLabel;
  protected readonly tone = runStatusTone;
  protected readonly trigger = runTrigger;
  protected readonly duration = runDuration;
  protected readonly provenance = runProvenance;
  protected readonly short = shortShaOrNone;
  protected readonly shortId = shortRunId;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);

  /** Whether a commit is to the wrapper's main branch, as the repositories read names them. */
  private commitsToWrapper(event: QitsDomainEvent): boolean {
    return movesWrapper(event, this.repositoryAnswer());
  }

  /** Whether a build event is about a run of this repository. */
  private ofRepository(event: QitsDomainEvent): boolean {
    return buildOfRepository(event, [this.repositoryId()]);
  }

  protected runHref(runId: string | null | undefined): string | null {
    return ciRunHref(this.origins.page('ci'), runId ?? undefined) ?? null;
  }

  /** Reads again what failed. */
  protected retry(): void {
    if (this.repositories.status() === 'error') this.repositories.reload();
    if (this.runRead.status() === 'error') this.runRead.reload();
  }

  /** `?status=`: the chosen status, "Any status" dropping it. */
  protected filterStatus(status: string): void {
    this.navigate({ status: isRunStatus(status) ? status : null }, false);
  }

  /**
   * `?branch=`: the field's text, empty dropping it. Typing on in a field that already filters
   * replaces the history entry, so Back undoes the whole filter rather than one character.
   */
  protected filterBranch(text: string): void {
    this.navigate({ branch: text || null }, !!this.filters().branch && !!text);
  }

  /** `?trigger=`: the chosen trigger, "Any trigger" dropping it. */
  protected filterTrigger(trigger: string): void {
    this.navigate({ trigger: isRunTrigger(trigger) ? trigger : null }, false);
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

/** The data marks of what a row shows (each a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['status'] },
  id: { derived: ['id'] },
  branch: { derived: ['branch'] },
  sha: { derived: ['commitSha'] },
  trigger: { derived: ['triggerType'] },
  created: { derived: ['createdAt'] },
  duration: { derived: ['finishedAt', 'startedAt', 'createdAt'] },
  provenance: { derived: ['triggerType', 'triggerEventName', 'configPath'] },
  reason: { derived: ['cancellationReason'] },
  supersededBy: { derived: ['supersededByRunId'] },
} as const;
