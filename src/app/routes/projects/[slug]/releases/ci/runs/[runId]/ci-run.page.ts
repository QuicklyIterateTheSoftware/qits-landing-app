import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
  stay,
} from '@qits/angular';
import { ansiSegments } from '$core/ci/ansi';
import { BUILD_EVENTS, buildOfRun } from '$core/ci/build-events';
import type { CiRunDetail } from '$core/ci/ci-run.consumes';
import {
  cancellationNote,
  durationBetween,
  elapsedSince,
  formatEta,
  isTerminal,
  LIVE_STEP,
  openSteps,
  phaseLabel,
  queuePlace,
  runDuration,
  stepKey,
  stepOutput,
  stepStatusLabel,
  stepTitle,
  toggledSteps,
  triggerLabel,
  triggerProvenance,
} from '$core/ci/ci-run';
import { CiRunLinks } from '$core/ci/ci-run-links';
import { CANCEL_RUN, RETRY_RUN, RUN } from '$core/ci/ci.operations';
import { runStatusLabel, runStatusTone } from '$core/ci/project-ci';
import { pollWhile, RUNNING_RUN_POLL_MS } from '$core/events/poll-while';
import { SelectedProject } from '$core/projects/selected-project';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import { PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { RunReports } from '$patterns/release-requests/run-reports/run-reports';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What Cancel sends as the reason: qits-ci keeps it beside the cancellation. */
const CANCEL_REASON = 'Cancelled from the run page';

/**
 * One CI run of the open project, at `/projects/<slug>/ci/runs/<runId>` (qits-2321; replaces
 * qits-ci-frontend's `runs/:runId`): the run read once and kept current by its events, its step
 * output in colour, the open step in the URL, and the fields the old page dropped.
 *
 * - Header: the status, the repository (its CI page, `projects/<slug>/ci/<repository>`,
 *   qits-2320), branch, short commit and run id, "← CI", and the page's two writes: Cancel (a
 *   queued or running run, behind a confirm step) and Run again (a finished run, which then opens
 *   the new run).
 * - Facts: queued, started and finished (relative, the instant in the title) and the duration;
 *   while QUEUED its place in the queue and expected start, while RUNNING its expected finish; the
 *   trigger (`push`, or `event` with `triggerEventName · configPath`), the archetype and version,
 *   the release request (its qualified id and phase, linking the request's page), the target and
 *   lease (text: there is no target page), the daemon version, what it re-runs or continues, an
 *   automatic retry with its reason and deferral, and a cancelled run's note with the run that
 *   superseded it.
 * - Steps: one row per step (index, name else image, status, exit code, start, duration; "killed
 *   by OOM (<scope>)" on the step that exited 137 when the run counts OOM kills) and a row for the
 *   live step with its elapsed time. A row opens to its output, coloured (`ansiSegments`, text in
 *   styled spans, never HTML); output qits-ci cut to its tail (`stepOutput`) says so above it.
 *   The open rows are `?step=` (repeatable, `live` for the live row); without one, the first FAILED
 *   or TIMED_OUT step is open, else the live step, else the last (`openSteps`). A toggle replaces
 *   the URL (`replaceUrl`), so Back leaves the page rather than walking the rows.
 * - Reports: `app-run-reports` for the run once it finished (reports land with its finish).
 *
 * Reads, each its own `qitsResource`, in the browser only (the server render has no session): the
 * run (`RUN`) and the project's repositories (`PROJECT_REPOSITORIES`). The run belongs to the page
 * only when its `repoId` is one of the project's repository ids (never by `projectId`, which qits-ci
 * knows only for a push on the public address); a run of another project, or a 404, is "No run
 * <id> in this project" with a link back to the project's CI page.
 *
 * States: loading, a failed read with Retry, not in this project, queued ("Waiting for a CI slot"
 * with its place), running and finished.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` naming this run (`buildOfRun`) → the run (`refreshOn`,
 * debounced as `CiRunsPage`'s). A running run's live step writes output no event announces, so
 * while the run is RUNNING and the document is visible the run is read again every 10 s
 * (`pollWhile`, `RUNNING_RUN_POLL_MS`); a queued or finished run is never polled. A refresh keeps
 * the run on show.
 */
@Component({
  selector: 'app-ci-run-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsExit,
    QitsField,
    RunReports,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="CI run" [actions]="actions()">
        <p class="mt-0 mb-4 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ slug: slug() }"
            [exitCurrent]="null"
            data-back
            >← CI</a
          >
        </p>
        @if (refusal(); as refusal) {
          <p class="mt-0 mb-3 text-right text-sm text-danger" role="alert" data-refusal>
            {{ refusal }}
          </p>
        }
        @if (cancelAsked()) {
          <p class="mt-0 mb-3 text-right text-sm text-fg-soft" role="status" data-cancel-asked>
            Cancel asked: the run stops shortly.
          </p>
        }
        <ui-load-failure
          message="This CI run could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        @if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No run {{ runId() }} in this project.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="leaving.back"
              [exitParams]="{ slug: slug() }"
              [exitCurrent]="null"
              >Back to CI</a
            >
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || missing()"
        >
          @if (shown(); as run) {
            <article [qitsEntity]="run" entityKey="id" data-run>
              <header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <ui-chip
                  [label]="statusLabel(run.status)"
                  [tone]="tone(run.status)"
                  [fieldOf]="run"
                  [qitsField]="marks.status"
                />
                <a
                  class="font-semibold wrap-anywhere text-accent no-underline hover:underline"
                  [qitsExit]="leaving.repository"
                  [exitParams]="{ slug: slug(), repo: run.repoName ?? '' }"
                  [title]="'The CI runs of ' + (run.repoName ?? '')"
                  [fieldOf]="run"
                  qitsField="repoName"
                  data-repository
                  >{{ run.repoName }}</a
                >
                <span
                  class="font-mono text-xs wrap-anywhere text-fg-soft"
                  [fieldOf]="run"
                  qitsField="branch"
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
                <span
                  class="font-mono text-xs text-fg-muted"
                  [title]="run.id ?? ''"
                  [fieldOf]="run"
                  [qitsField]="marks.id"
                  >{{ (run.id ?? '').slice(0, 8) }}</span
                >
              </header>

              @if (run.status === 'CANCELLED') {
                <p
                  class="mt-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg-soft"
                  role="status"
                  [fieldOf]="run"
                  [qitsField]="marks.cancellation"
                  data-cancellation
                >
                  {{ cancelled(run.cancellationReason) }}
                  @if (run.supersededByRunId; as newer) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="runs.opening.run"
                      [exitParams]="runs.params(newer)"
                      data-superseded-by
                      >The run that superseded it</a
                    >
                  }
                </p>
              }

              @if (run.status === 'QUEUED') {
                <p
                  class="mt-0 mb-4 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-fg"
                  role="status"
                  [fieldOf]="run"
                  [qitsField]="marks.queue"
                  data-waiting
                >
                  Waiting for a CI slot{{
                    place(run.queuePosition) ? ': ' + place(run.queuePosition) : ''
                  }}.
                </p>
              }

              <dl
                class="mt-0 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                aria-label="Facts"
                data-facts
              >
                <dt class="text-fg-muted">Queued</dt>
                <dd
                  class="m-0"
                  [title]="instant(run.createdAt)"
                  [fieldOf]="run"
                  [qitsField]="marks.createdAt"
                >
                  {{ ago(run.createdAt) }}
                </dd>
                @if (run.startedAt) {
                  <dt class="text-fg-muted">Started</dt>
                  <dd
                    class="m-0"
                    [title]="instant(run.startedAt)"
                    [fieldOf]="run"
                    [qitsField]="marks.startedAt"
                  >
                    {{ ago(run.startedAt) }}
                  </dd>
                }
                @if (run.finishedAt) {
                  <dt class="text-fg-muted">Finished</dt>
                  <dd
                    class="m-0"
                    [title]="instant(run.finishedAt)"
                    [fieldOf]="run"
                    [qitsField]="marks.finishedAt"
                  >
                    {{ ago(run.finishedAt) }}
                  </dd>
                  <dt class="text-fg-muted">Duration</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.duration" data-duration>
                    {{ duration(run) }}
                  </dd>
                }
                @if (run.status === 'QUEUED') {
                  @if (place(run.queuePosition); as place) {
                    <dt class="text-fg-muted">Queue</dt>
                    <dd class="m-0" [fieldOf]="run" [qitsField]="marks.queue" data-queue-position>
                      {{ place }}
                    </dd>
                  }
                  @if (
                    run.expectedStartInMillis !== null && run.expectedStartInMillis !== undefined
                  ) {
                    <dt class="text-fg-muted">Expected start</dt>
                    <dd
                      class="m-0"
                      [fieldOf]="run"
                      [qitsField]="marks.expectedStart"
                      data-expected-start
                    >
                      {{ eta(run.expectedStartInMillis) }}
                    </dd>
                  }
                }
                @if (
                  run.status === 'RUNNING' &&
                  run.expectedFinishInMillis !== null &&
                  run.expectedFinishInMillis !== undefined
                ) {
                  <dt class="text-fg-muted">Expected finish</dt>
                  <dd
                    class="m-0"
                    [fieldOf]="run"
                    [qitsField]="marks.expectedFinish"
                    data-expected-finish
                  >
                    {{ eta(run.expectedFinishInMillis) }}
                  </dd>
                }
                @if (trigger(run.triggerType); as trigger) {
                  <dt class="text-fg-muted">Trigger</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.trigger" data-trigger>
                    {{ trigger }}
                    @if (provenance(run); as provenance) {
                      <span class="font-mono text-xs text-fg-soft">{{ provenance }}</span>
                    }
                  </dd>
                }
                @if (run.archetypeName) {
                  <dt class="text-fg-muted">Archetype</dt>
                  <dd class="m-0 font-mono text-xs" [fieldOf]="run" [qitsField]="marks.archetype">
                    {{ run.archetypeName }} {{ run.archetypeVersion }}
                  </dd>
                }
                @if (run.releaseRequestId) {
                  <dt class="text-fg-muted">Release request</dt>
                  <dd
                    class="m-0"
                    [fieldOf]="run"
                    [qitsField]="marks.releaseRequest"
                    data-release-request
                  >
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="requesting.request"
                      [exitParams]="{ slug: slug(), requestId: run.releaseRequestId }"
                      >{{ run.releaseRequestQualifiedId || run.releaseRequestId }}</a
                    >
                    @if (phase(run.phase); as phase) {
                      <span class="text-fg-soft"> · {{ phase }}</span>
                    }
                  </dd>
                }
                @if (run.retryOfRunId) {
                  <dt class="text-fg-muted">Re-run of</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.retryOf">
                    <a
                      class="font-mono text-xs text-accent no-underline hover:underline"
                      [qitsExit]="runs.opening.run"
                      [exitParams]="runs.params(run.retryOfRunId)"
                      data-retry-of
                      >{{ run.retryOfRunId.slice(0, 8) }}</a
                    >
                  </dd>
                }
                @if (run.continuedFromRunId) {
                  <dt class="text-fg-muted">Continues</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.continues">
                    <a
                      class="font-mono text-xs text-accent no-underline hover:underline"
                      [qitsExit]="runs.opening.run"
                      [exitParams]="runs.params(run.continuedFromRunId)"
                      data-continues
                      >{{ run.continuedFromRunId.slice(0, 8) }}</a
                    >
                  </dd>
                }
                @if (run.autoRetry || run.retryReason || run.autoRetryDeferredUntil) {
                  <dt class="text-fg-muted">Retry</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.retry" data-retry>
                    {{ run.autoRetry ? 'automatic' : 'by hand' }}
                    @if (run.retryReason) {
                      <span class="text-fg-soft"> · {{ run.retryReason }}</span>
                    }
                    @if (run.autoRetryDeferredUntil) {
                      <span class="text-fg-soft" [title]="instant(run.autoRetryDeferredUntil)">
                        · deferred until {{ instant(run.autoRetryDeferredUntil) }}</span
                      >
                    }
                  </dd>
                }
                @if (run.targetId) {
                  <dt class="text-fg-muted">Target</dt>
                  <dd class="m-0 font-mono text-xs" [fieldOf]="run" qitsField="targetId">
                    {{ run.targetId }}
                  </dd>
                }
                @if (run.leaseId) {
                  <dt class="text-fg-muted">Lease</dt>
                  <dd class="m-0 font-mono text-xs" [fieldOf]="run" qitsField="leaseId">
                    {{ run.leaseId }}
                  </dd>
                }
                @if (run.daemonVersion) {
                  <dt class="text-fg-muted">Daemon</dt>
                  <dd class="m-0 font-mono text-xs" [fieldOf]="run" qitsField="daemonVersion">
                    {{ run.daemonVersion }}
                  </dd>
                }
                @if (oomFact(run); as oom) {
                  <dt class="text-fg-muted">OOM kills</dt>
                  <dd class="m-0" [fieldOf]="run" [qitsField]="marks.oom">{{ oom }}</dd>
                }
              </dl>

              @if ((run.steps ?? []).length || run.live) {
                <section aria-labelledby="ci-run-steps" class="mb-6">
                  <h2 id="ci-run-steps" class="mt-0 mb-2 text-base font-semibold">Steps</h2>
                  <ol class="m-0 flex list-none flex-col gap-1 p-0">
                    @for (step of run.steps ?? []; track step.stepIndex) {
                      @let key = keyOf(step);
                      <li
                        class="rounded-md border border-line bg-surface text-sm"
                        [qitsEntity]="step"
                        entityKey="stepIndex"
                        [attr.data-step]="key"
                      >
                        <button
                          type="button"
                          class="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-transparent px-3 py-1.5 text-left hover:bg-surface-subtle"
                          [attr.aria-expanded]="isOpen(key)"
                          (click)="toggle(key)"
                        >
                          <span
                            class="font-mono text-xs text-fg-muted"
                            [fieldOf]="step"
                            qitsField="stepIndex"
                            >{{ step.stepIndex }}</span
                          >
                          <span
                            class="font-semibold wrap-anywhere"
                            [fieldOf]="step"
                            [qitsField]="marks.stepTitle"
                            >{{ title(step) }}</span
                          >
                          <ui-chip
                            [label]="stepStatus(step.status)"
                            [tone]="tone(step.status)"
                            [fieldOf]="step"
                            [qitsField]="marks.status"
                          />
                          @if (step.exitCode !== null && step.exitCode !== undefined) {
                            <span
                              class="font-mono text-xs text-fg-soft"
                              [fieldOf]="step"
                              qitsField="exitCode"
                              data-exit-code
                              >exit {{ step.exitCode }}</span
                            >
                          }
                          @if (oomStep(run) === key) {
                            <span
                              class="text-xs font-semibold text-danger"
                              [fieldOf]="run"
                              [qitsField]="marks.oom"
                              data-oom
                              >killed by OOM ({{ run.oomScope }})</span
                            >
                          }
                          <span
                            class="ml-auto text-xs text-fg-muted"
                            [title]="instant(step.startedAt)"
                            [fieldOf]="step"
                            [qitsField]="marks.startedAt"
                            >{{ ago(step.startedAt) }}</span
                          >
                          <span
                            class="text-xs text-fg-muted"
                            [fieldOf]="step"
                            [qitsField]="marks.stepDuration"
                            data-step-duration
                            >{{ between(step.startedAt, step.finishedAt) }}</span
                          >
                        </button>
                        @if (isOpen(key)) {
                          @let output = outputOf(step.output);
                          <div
                            class="border-t border-line-subtle px-3 py-2"
                            [fieldOf]="step"
                            [qitsField]="marks.output"
                          >
                            @if (output.truncated) {
                              <p class="mt-0 mb-1 text-xs text-fg-muted" data-truncated>
                                Showing the last 64 KiB of this step’s output.
                              </p>
                            }
                            <pre
                              class="m-0 max-h-[32rem] overflow-auto rounded bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap text-fg"
                              data-output
                            >@for (segment of segments(output.text); track $index) {<span [class]="segment.classes">{{ segment.text }}</span>}</pre>
                          </div>
                        }
                      </li>
                    }
                    @if (run.live; as live) {
                      <li
                        class="rounded-md border border-warning-line bg-surface text-sm"
                        [qitsEntity]="live"
                        entityKey="stepIndex"
                        data-step="live"
                      >
                        <button
                          type="button"
                          class="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-transparent px-3 py-1.5 text-left hover:bg-surface-subtle"
                          [attr.aria-expanded]="isOpen(live_)"
                          (click)="toggle(live_)"
                        >
                          <span
                            class="font-mono text-xs text-fg-muted"
                            [fieldOf]="live"
                            qitsField="stepIndex"
                            >{{ live.stepIndex }}</span
                          >
                          <span class="font-semibold">Running now</span>
                          <ui-chip label="running" tone="waiting" />
                          <span
                            class="ml-auto text-xs text-fg-muted"
                            [title]="instant(live.startedAt)"
                            [fieldOf]="live"
                            [qitsField]="marks.liveSince"
                            data-elapsed
                            >{{ since(live.startedAt) }}</span
                          >
                        </button>
                        @if (isOpen(live_)) {
                          @let output = outputOf(live.output);
                          <div
                            class="border-t border-line-subtle px-3 py-2"
                            [fieldOf]="live"
                            [qitsField]="marks.output"
                          >
                            @if (output.truncated) {
                              <p class="mt-0 mb-1 text-xs text-fg-muted" data-truncated>
                                Showing the last 64 KiB of this step’s output.
                              </p>
                            }
                            <pre
                              class="m-0 max-h-[32rem] overflow-auto rounded bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap text-fg"
                              data-output
                            >@for (segment of segments(output.text); track $index) {<span [class]="segment.classes">{{ segment.text }}</span>}</pre>
                          </div>
                        }
                      </li>
                    }
                  </ol>
                </section>
              }

              @if (finished(run.status)) {
                <app-run-reports [runId]="runId()" title="Reports" [linkRun]="false" />
              }
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class CiRunPage {
  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly runs = inject(CiRunLinks);

  /** "← CI", and the repository (its CI page, qits-2320). */
  protected readonly leaving = outcomes('leave-ci-run', {
    back: exit('projects/:slug/releases/ci'),
    repository: exit('projects/:slug/releases/ci/:repo'),
  });
  /** The release request the run was for. */
  protected readonly requesting = outcomes('open-ci-run-release-request', {
    request: exit('projects/:slug/releases/requests/:requestId'),
  });
  /** Cancel, confirmed: the page stays, saying the cancel was asked or why it was refused. */
  protected readonly cancelling = outcomes('cancel-ci-run', {
    cancelled: stay(),
    refused: stay(),
  });
  /** Run again: the new run's page, or the page kept with the refusal. */
  protected readonly retrying = outcomes('retry-ci-run', {
    started: exit('projects/:slug/releases/ci/runs/:runId'),
    refused: stay(),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The run the address names. */
  protected readonly runId = computed(() => this.params().get('runId') ?? '');
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The open project's id, in the browser only: the repositories' read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The run, read again after a build event naming it (and every 10 s while it runs). */
  protected readonly read = qitsResource(
    RUN,
    () => {
      const runId = this.runId();
      return this.browser && runId ? { path: { runId } } : undefined;
    },
    { refreshOn: { names: BUILD_EVENTS, when: (event) => buildOfRun(event, this.runId()) } },
  );

  /** The open project's repositories: the run belongs to the page only when it is of one of them. */
  protected readonly repositories = qitsResource(PROJECT_REPOSITORIES, () => {
    const projectId = this.projectId();
    return projectId ? { path: { projectId } } : undefined;
  });

  private readonly cancel_ = qitsMutation(CANCEL_RUN);
  private readonly retry_ = qitsMutation(RETRY_RUN);

  /** The run's answer, once there, and only for the run the address names. */
  private readonly answer = computed((): CiRunDetail | undefined => {
    const run = this.read.hasValue() ? this.read.value() : undefined;
    return run && run.id === this.runId() ? run : undefined;
  });

  /** The ids of the project's repositories. */
  private readonly repositoryIds = computed((): ReadonlySet<string> | undefined =>
    this.repositories.hasValue()
      ? new Set(
          (this.repositories.value()?.entries ?? []).flatMap((entry) =>
            entry.repository?.id ? [entry.repository.id] : [],
          ),
        )
      : undefined,
  );

  /** Whether the run is the project's: its `repoId` is one of the project's repository ids. */
  private readonly belongs = computed(() => {
    const run = this.answer();
    const ids = this.repositoryIds();
    return !!run && !!ids && !!run.repoId && ids.has(run.repoId);
  });

  /** The run as the page shows it: read, and of the project. */
  protected readonly shown = computed(() => (this.belongs() ? this.answer() : undefined));

  /** No such run (a 404), or a run of another project's repository. */
  protected readonly missing = computed(
    () => isMissing(this.read) || (!!this.answer() && !!this.repositoryIds() && !this.belongs()),
  );

  /**
   * Failed when the run (but for a 404, which is {@link missing}) or the repositories could not be
   * read; loaded once both answered.
   */
  protected readonly state = computed((): LoadState => {
    const reads = [
      isMissing(this.read) ? 'loading' : loadState(this.read),
      loadState(this.repositories),
    ];
    if (reads.includes('error')) return 'error';
    return reads.every((read) => read === 'loaded') ? 'loaded' : 'loading';
  });

  /** The open rows: `?step=`, else the first failed step, the live step or the last. */
  private readonly open = computed((): ReadonlySet<string> => {
    const run = this.shown();
    return run ? openSteps(run, this.query().getAll('step')) : new Set();
  });

  /** What Cancel or Run again was refused with, in words. */
  protected readonly refusal = signal<string | null>(null);
  /** Cancel was taken: shown until the run is read finished. */
  private readonly cancelTaken = signal(false);
  protected readonly cancelAsked = computed(
    () => this.cancelTaken() && !isTerminal(this.shown()?.status),
  );
  /** Pressed once: Cancel asks for confirmation. */
  private readonly confirming = signal(false);
  private readonly busy = signal(false);

  /** Cancel on a run still going; Run again on a finished one. */
  protected readonly actions = computed((): readonly Action[] => {
    const run = this.shown();
    if (!run) return [];
    if (!isTerminal(run.status)) {
      return [
        {
          label: this.confirming() ? 'Confirm cancel?' : 'Cancel',
          variant: this.confirming() ? 'danger' : 'muted',
          disabled: this.busy() || this.cancelAsked(),
          outcomes: [this.cancelling.cancelled, this.cancelling.refused],
          callback: () => void this.cancel(),
        },
      ];
    }
    return [
      {
        label: 'Run again',
        variant: 'muted',
        disabled: this.busy(),
        outcomes: [this.retrying.started, this.retrying.refused],
        callback: () => void this.runAgain(),
      },
    ];
  });

  protected readonly marks = MARKS;
  protected readonly live_ = LIVE_STEP;
  protected readonly statusLabel = runStatusLabel;
  protected readonly stepStatus = stepStatusLabel;
  protected readonly tone = runStatusTone;
  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);
  protected readonly duration = (run: CiRunDetail) => runDuration(run) ?? '–';
  protected readonly between = durationBetween;
  protected readonly eta = formatEta;
  protected readonly place = queuePlace;
  protected readonly trigger = triggerLabel;
  protected readonly provenance = triggerProvenance;
  protected readonly phase = phaseLabel;
  protected readonly cancelled = cancellationNote;
  protected readonly title = stepTitle;
  protected readonly keyOf = stepKey;
  protected readonly outputOf = stepOutput;
  protected readonly segments = ansiSegments;
  protected readonly finished = isTerminal;

  constructor() {
    pollWhile({
      active: () => this.shown()?.status === 'RUNNING',
      everyMs: RUNNING_RUN_POLL_MS,
      refresh: () => this.read.reload(),
    });
  }

  /** How long the live step has run; past a day, when it started. */
  protected since(iso: string | null | undefined): string {
    return elapsedSince(iso) ?? `since ${formatRelativeTime(iso)}`;
  }

  /** The step that exited 137 when the run counts OOM kills: its row says so. */
  protected oomStep(run: CiRunDetail): string | undefined {
    if (!run.oomKills) return undefined;
    const killed = (run.steps ?? []).find((step) => step.exitCode === 137);
    return killed ? stepKey(killed) : undefined;
  }

  /** OOM kills no step's row shows (none exited 137): a fact of the run instead. */
  protected oomFact(run: CiRunDetail): string | undefined {
    if (!run.oomKills || this.oomStep(run) !== undefined) return undefined;
    return run.oomScope ? `${run.oomKills} (${run.oomScope})` : String(run.oomKills);
  }

  protected isOpen(key: string): boolean {
    return this.open().has(key);
  }

  /** Opens or closes a row: `?step=` names the open rows (`''` for none), replacing the entry. */
  protected toggle(key: string): void {
    const steps = toggledSteps(this.open(), key);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: steps.length ? steps : [''] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Reads again what failed. */
  protected retry(): void {
    if (this.read.status() === 'error') this.read.reload();
    if (this.repositories.status() === 'error') this.repositories.reload();
  }

  private async cancel(): Promise<void> {
    const run = this.shown();
    if (!run?.id || this.busy()) return;
    if (!this.confirming()) {
      this.confirming.set(true);
      this.refusal.set(null);
      return;
    }
    this.confirming.set(false);
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.cancel_.run({
        path: { runId: run.id },
        body: { reason: CANCEL_REASON },
        headers: { 'Content-Type': 'application/json' },
      });
      this.cancelTaken.set(true);
      this.cancelling.cancelled.reach();
      this.read.reload();
    } catch (error) {
      const { status, message } = refusedBy(error);
      this.refusal.set(
        status === 409
          ? 'This run had already finished, so there was nothing to stop.'
          : refusalText('cancel this run', status, message),
      );
      this.cancelling.refused.reach();
      this.read.reload();
    } finally {
      this.busy.set(false);
    }
  }

  private async runAgain(): Promise<void> {
    const run = this.shown();
    if (!run?.id || this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    let runId: string | undefined;
    try {
      runId = (await this.retry_.run({ path: { runId: run.id } }))?.runId;
    } catch (error) {
      const { status, message } = refusedBy(error);
      this.refusal.set(
        status === 409
          ? `This run cannot be run again${message ? `: ${message}` : '.'}`
          : refusalText('run this pipeline again', status, message),
      );
      this.retrying.refused.reach();
      return;
    } finally {
      this.busy.set(false);
    }
    if (!runId) {
      this.refusal.set('qits-ci took the run, but named no new run.');
      this.retrying.refused.reach();
      return;
    }
    void this.retrying.started.go({ slug: this.slug(), runId });
  }
}

/** A write's refusal in words: 403 is a permission, anything else the status and message. */
function refusalText(what: string, status: number, message: string | undefined): string {
  if (status === 403) return `You may not ${what} (403).`;
  if (status === 0) return `Could not ${what}: qits-ci is unreachable.`;
  return `Could not ${what}: ${status}${message ? ` ${message}` : ''}.`;
}

/** The data marks of what the page derives from the run (each a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['status'] },
  createdAt: { derived: ['createdAt'] },
  startedAt: { derived: ['startedAt'] },
  finishedAt: { derived: ['finishedAt'] },
  expectedStart: { derived: ['expectedStartInMillis'] },
  expectedFinish: { derived: ['expectedFinishInMillis'] },
  retryOf: { derived: ['retryOfRunId'] },
  continues: { derived: ['continuedFromRunId'] },
  sha: { derived: ['commitSha'] },
  id: { derived: ['id'] },
  cancellation: { derived: ['cancellationReason'] },
  queue: { derived: ['queuePosition'] },
  duration: { derived: ['startedAt', 'createdAt', 'finishedAt'] },
  trigger: { derived: ['triggerType', 'triggerEventName', 'configPath'] },
  archetype: { derived: ['archetypeName', 'archetypeVersion'] },
  releaseRequest: { derived: ['releaseRequestId', 'releaseRequestQualifiedId', 'phase'] },
  retry: { derived: ['autoRetry', 'retryReason', 'autoRetryDeferredUntil'] },
  oom: { derived: ['oomKills', 'oomScope'] },
  stepTitle: { derived: ['name', 'image', 'stepIndex'] },
  stepDuration: { derived: ['startedAt', 'finishedAt'] },
  output: { derived: ['output'] },
  liveSince: { derived: ['startedAt'] },
} as const;
