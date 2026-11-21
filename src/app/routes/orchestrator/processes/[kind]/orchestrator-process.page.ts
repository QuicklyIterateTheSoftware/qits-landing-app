import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsMutation,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { formatBytes, plural } from '$core/artifacts/artifact-listings';
import { pollWhile, RUNNING_RUN_POLL_MS } from '$core/events/poll-while';
import { valueMarks } from '$core/marks/value-marks';
import {
  callPath,
  explainStart,
  ORCHESTRATOR_ROLES,
  processStatusTone,
  readableJson,
  took,
} from '$core/orchestrator/process-runs';
import type {
  Process,
  ProcessRun,
  ProcessRunStep,
  ProcessRunSummary,
} from '$core/orchestrator/processes.consumes';
import {
  PROCESS_LIST,
  PROCESS_RUN,
  PROCESS_RUN_STEP,
  PROCESS_RUNS,
  START_PROCESS_RUN,
} from '$core/orchestrator/processes.operations';
import { columns } from '$core/orchestrator/step-columns';
import { formatInstant, NONE } from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { JsonBlock } from '$ui/components/json-block/json-block';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A process run as the page last read it: the run it is of, and its answer. */
interface ShownRunSource {
  readonly id: string | undefined;
  readonly value: ProcessRun | undefined;
}

/**
 * One technical process of qits-orchestrator (qits-2359), at `/orchestrator/processes/<kind>`:
 * what it is, its latest runs, one run's steps as a board by dependency depth, and one step's call
 * whole. It replaces qits-orchestrator-frontend's `processes/:kind` (and its `''`, which forwarded
 * to the only process); gc is the only kind today.
 *
 * **Load budget: 3 + 1 per opened step, never a body until asked.** `PROCESS_LIST`
 * (`listProcesses`: the title, the lede, and whether the kind exists), `PROCESS_RUNS`
 * (`listProcessRuns`: the latest 20, newest first) and `PROCESS_RUN` (`getProcessRun` with
 * `bodies=false`: the shown run's facts and its steps, each with `responseBytes` but no request
 * body or response). The old page re-read the whole run, every step's bodies included, every 2 s
 * (2.8 MB for one read of a running gc run, measured 2026-11-21). Opening a step reads that step
 * alone (`PROCESS_RUN_STEP`, `getProcessRunStep`), and its response stays collapsed behind a toggle
 * naming its size. Every read is made in the browser only (the server render has no session).
 *
 * **A run is an address.** `?run=<id>` is the shown run (else the newest listed), `?step=<id>` the
 * open step; a Started link (`open-orchestrator-run`) and a card's press (`open-orchestrator-step`,
 * a second press closes it) replace the URL rather than push it, so Back leaves the page.
 *
 * - Header: the process's `name` (the kind until it is read), its `description` as the lede; Run
 *   now, Dry run, Refresh.
 * - Runs: status, Started (the row's link), Took (`finishedAt − startedAt`, "—" while running or
 *   for a run that never finished), trigger with a "dry run" chip, and the summary clamped to two
 *   lines (the whole in `title`). The shown run's row is `aria-current`.
 * - The shown run: status, trigger, dry run, started, took, id; then its steps in columns by
 *   dependency depth (`columns`, `core/orchestrator/step-columns.ts`), the service's order within
 *   a column, each card a step's name, status, target, call (`method` and the path without the
 *   peer's host), summary and how long it took. No wires between the cards: the open step's facts
 *   list what it depends on.
 * - The open step: its facts, summary and error (from the shown run), then its request (`method
 *   url`, the body or "No body."; "This step made no request." without one) and its response,
 *   collapsed behind "Show <size>" ("Nothing came back." without one). A response the service cut
 *   at 1 MiB keeps its marker as text.
 *
 * **Writes.** Dry run sends `{ dryRun: true }` at once (`start-orchestrator-dry-run`). Run now
 * deletes, so its first press asks (`ask-orchestrator-run`) and the second sends `{ dryRun: false }`
 * (`start-orchestrator-run`). Both go through `qitsMutation`, `online-only`: a run is never queued
 * offline and never sent again by itself. Neither is disabled while a run is active: the service
 * holds the one-active-run rule and answers 409, which the page says in its words, showing the
 * newest run. A 202 shows the new run; a 403 says the role; anything else says it is not known
 * whether a run started (`explainStart`).
 *
 * States: loading; each read's failure with Retry (the process, the runs, the run, the step); an
 * unknown kind (a 404 on the runs, or a kind `listProcesses` does not name) is "There is no process
 * called <kind>."; a `?run=` the service does not know is "There is no run <id> of this process",
 * with a link to the newest; a 403 names the roles.
 *
 * Marks (qits-2141): the lede is the process's entity by `kind`; the runs table the runs' read,
 * each row a run by `id`; the shown run the run's read by `id`, each card a step by `id`; the open
 * step's call the step's read by `id`.
 *
 * Staleness (qits-1270): qits-orchestrator publishes no domain event, so nothing here has a
 * `refreshOn`. The one poll the rule allows (`pollWhile`, `RUNNING_RUN_POLL_MS`, the document
 * visible): while the shown run is RUNNING its body-less read is made again every 10 s, since its
 * steps move with no event to say so; when it leaves RUNNING the run list is read again (its row's
 * status, took and summary), and so is an open step whose status moved. A failed poll keeps the
 * last run on screen and says the update did not arrive. The gap: no event announces a run started
 * elsewhere (gc's deploy trigger, another operator), so the run list follows only this page's
 * presses, a shown run stopping and Refresh (qits-2472 asks qits-orchestrator for run events).
 */
@Component({
  selector: 'app-orchestrator-process-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    JsonBlock,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsField,
    QitsTriggers,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[80rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()" [actions]="actions()">
        @if (process(); as known) {
          <p
            class="mt-0 mb-4 max-w-[60rem] text-sm text-fg-soft"
            [qitsEntity]="known"
            entityKey="kind"
            [entitySource]="processes"
            data-lede
          >
            <span [fieldOf]="known" qitsField="description">{{ known.description }}</span>
          </p>
        }

        @if (unknownKind()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no process called “{{ kind() }}”.
          </p>
        } @else if (refused()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the technical processes needs an admin role: {{ roles }}.
          </p>
        } @else {
          <ui-load-failure
            class="mb-4"
            message="The process could not be read."
            [class.hidden]="processes.status() !== 'error'"
            (retry)="processes.reload()"
          />

          @if (confirming()) {
            <div
              class="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
              data-confirm
            >
              @if (process(); as known) {
                <p
                  class="m-0"
                  role="alert"
                  [qitsEntity]="known"
                  entityKey="kind"
                  [entitySource]="processes"
                  [fieldOf]="known"
                  [qitsField]="marks.question"
                >
                  {{ question(known) }}
                </p>
              } @else {
                <p class="m-0" role="alert">
                  Run “{{ kind() }}” now? It deletes what the plan names.
                </p>
              }
              <button
                type="button"
                class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                [qitsTriggers]="[asking.withdrawn]"
                (click)="withdraw()"
              >
                Not now
              </button>
            </div>
          }
          @if (startNote(); as note) {
            <p
              role="alert"
              class="mt-0 mb-4 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
              data-start-note
            >
              {{ note }}
            </p>
          }

          <section aria-labelledby="orchestrator-runs" class="mb-8">
            <h2 id="orchestrator-runs" class="mt-0 mb-2 text-base font-semibold">Runs</h2>
            <ui-load-failure
              message="The runs could not be read."
              [class.hidden]="runsState() !== 'error'"
              (retry)="runs.reload()"
            />
            <ui-spinner
              [state]="runsState()"
              class="min-h-24"
              [class.hidden]="runsState() === 'error'"
            >
              @if (listed().length === 0) {
                <p
                  role="status"
                  class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                >
                  This process has never run here. Run now starts it; Dry run does everything except
                  the deletions.
                </p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-left text-sm" aria-label="Runs">
                    <caption
                      class="mb-2 text-left text-sm text-fg-soft"
                      [qitsEntityList]="runs"
                      data-caption
                    >
                      <span [fieldOf]="listed()" [qitsField]="marks.count">{{ caption() }}</span>
                    </caption>
                    <thead>
                      <tr class="border-b border-line text-xs text-fg-muted">
                        <th scope="col" class="py-1.5 pr-3 font-semibold">Status</th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">Started</th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">Took</th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">Trigger</th>
                        <th scope="col" class="py-1.5 font-semibold">Summary</th>
                      </tr>
                    </thead>
                    <tbody [qitsEntityList]="runs">
                      @for (row of listed(); track row.id) {
                        <tr
                          class="border-b border-line-subtle align-top aria-[current=true]:bg-surface-active"
                          [attr.aria-current]="row.id === shownRunId() ? 'true' : null"
                          [qitsEntity]="row"
                          entityKey="id"
                        >
                          <td class="py-1.5 pr-3 whitespace-nowrap">
                            <ui-chip
                              [label]="row.status ?? ''"
                              [tone]="tone(row.status)"
                              [fieldOf]="row"
                              [qitsField]="marks.status"
                            />
                          </td>
                          <td class="py-1.5 pr-3 whitespace-nowrap">
                            <a
                              class="text-accent no-underline hover:underline"
                              [routerLink]="[]"
                              [queryParams]="{ run: row.id, step: null }"
                              queryParamsHandling="merge"
                              [replaceUrl]="true"
                              [qitsTriggers]="[selecting.opened]"
                              (click)="selecting.opened.reach()"
                              [fieldOf]="row"
                              [qitsField]="marks.started"
                              >{{ instant(row.startedAt) }}</a
                            >
                          </td>
                          <td
                            class="py-1.5 pr-3 whitespace-nowrap tabular-nums"
                            [fieldOf]="row"
                            [qitsField]="marks.took"
                          >
                            {{ took(row.startedAt, row.finishedAt) }}
                          </td>
                          <td class="py-1.5 pr-3 whitespace-nowrap">
                            <span [fieldOf]="row" qitsField="trigger">{{ row.trigger }}</span>
                            @if (row.dryRun) {
                              <ui-chip
                                class="ml-1.5"
                                label="dry run"
                                [fieldOf]="row"
                                [qitsField]="marks.dryRun"
                              />
                            }
                          </td>
                          <td class="min-w-64 py-1.5 text-fg-soft">
                            <span
                              class="line-clamp-2"
                              [title]="row.summary ?? ''"
                              [fieldOf]="row"
                              [qitsField]="marks.summary"
                              >{{ row.summary || none }}</span
                            >
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              <p class="mt-2 mb-0 text-xs text-fg-muted">
                No event announces a run started elsewhere (the deploy trigger, another operator):
                Refresh reads the runs again.
              </p>
            </ui-spinner>
          </section>

          @if (shownRunId()) {
            <section aria-labelledby="orchestrator-run" class="mb-6">
              <h2 id="orchestrator-run" class="mt-0 mb-2 text-base font-semibold">
                The run's steps
              </h2>
              @if (runMissing()) {
                <p
                  role="alert"
                  class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                >
                  There is no run <span class="font-mono">{{ runParam() }}</span> of this process.
                  @if (listed().length) {
                    <a
                      class="ml-1 text-accent no-underline hover:underline"
                      [routerLink]="[]"
                      [queryParams]="{ run: null, step: null }"
                      queryParamsHandling="merge"
                      [replaceUrl]="true"
                      [qitsTriggers]="[selecting.opened]"
                      (click)="selecting.opened.reach()"
                      >Show the newest run</a
                    >
                  }
                </p>
              } @else {
                @if (shownRun(); as run) {
                  @if (pollFailed()) {
                    <p
                      role="status"
                      class="mt-0 mb-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                      data-poll-failed
                    >
                      The last update did not arrive. This is the run as it was last read.
                    </p>
                  }
                  <div [qitsEntity]="run" entityKey="id" [entitySource]="runRead" data-run>
                    <dl
                      class="mt-0 mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                      aria-label="The run"
                    >
                      <dt class="text-fg-muted">Status</dt>
                      <dd class="m-0">
                        <ui-chip
                          [label]="run.status ?? ''"
                          [tone]="tone(run.status)"
                          [fieldOf]="run"
                          [qitsField]="marks.status"
                        />
                      </dd>
                      <dt class="text-fg-muted">Trigger</dt>
                      <dd class="m-0" [fieldOf]="run" qitsField="trigger">{{ run.trigger }}</dd>
                      <dt class="text-fg-muted">Dry run</dt>
                      <dd class="m-0" [fieldOf]="run" [qitsField]="marks.dryRun">
                        {{ run.dryRun ? 'Yes: nothing is deleted' : 'No' }}
                      </dd>
                      <dt class="text-fg-muted">Started</dt>
                      <dd class="m-0" [fieldOf]="run" [qitsField]="marks.started">
                        {{ instant(run.startedAt) }}
                      </dd>
                      <dt class="text-fg-muted">Took</dt>
                      <dd class="m-0 tabular-nums" [fieldOf]="run" [qitsField]="marks.took">
                        {{ took(run.startedAt, run.finishedAt) }}
                      </dd>
                      <dt class="text-fg-muted">Id</dt>
                      <dd class="m-0 font-mono text-xs" [fieldOf]="run" qitsField="id">
                        {{ run.id }}
                      </dd>
                    </dl>

                    @if ((run.steps ?? []).length === 0) {
                      <p class="m-0 text-sm text-fg-muted">This run recorded no steps.</p>
                    } @else {
                      <div class="overflow-x-auto pb-2">
                        <ol
                          class="m-0 grid list-none auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 p-0"
                          aria-label="Steps"
                        >
                          @for (column of board(); track $index) {
                            <li class="flex flex-col gap-2" [attr.data-column]="$index">
                              @for (step of column; track step.id) {
                                <button
                                  type="button"
                                  class="flex w-full flex-col items-start gap-1 rounded-md border border-line bg-surface px-3 py-2 text-left text-xs hover:bg-surface-subtle aria-pressed:border-accent-line aria-pressed:bg-accent-soft"
                                  [attr.aria-pressed]="step.id === stepParam()"
                                  [attr.data-step]="step.id"
                                  [qitsEntity]="step"
                                  entityKey="id"
                                  [qitsTriggers]="[stepping.opened, stepping.closed]"
                                  (click)="toggleStep(step.id)"
                                >
                                  <span class="flex w-full items-baseline gap-2">
                                    <span
                                      class="min-w-0 flex-1 text-sm font-semibold text-fg"
                                      [fieldOf]="step"
                                      qitsField="name"
                                      >{{ step.name }}</span
                                    >
                                    <ui-chip
                                      [label]="step.status ?? ''"
                                      [tone]="tone(step.status)"
                                      [fieldOf]="step"
                                      [qitsField]="marks.status"
                                    />
                                  </span>
                                  <span class="text-fg-muted" [fieldOf]="step" qitsField="target">{{
                                    step.target
                                  }}</span>
                                  @if (step.request) {
                                    <span
                                      class="font-mono break-all text-fg-soft"
                                      [fieldOf]="step"
                                      [qitsField]="marks.call"
                                      >{{ step.request.method }} {{ path(step.request.url) }}</span
                                    >
                                  }
                                  <span
                                    class="text-fg-soft"
                                    [fieldOf]="step"
                                    [qitsField]="marks.outcome"
                                    >{{ step.summary || step.error || none }}</span
                                  >
                                  <span
                                    class="text-fg-muted tabular-nums"
                                    [fieldOf]="step"
                                    [qitsField]="marks.took"
                                    >took {{ took(step.startedAt, step.finishedAt) }}</span
                                  >
                                </button>
                              }
                            </li>
                          }
                        </ol>
                      </div>

                      @if (stepParam(); as stepId) {
                        @if (openStep(); as step) {
                          <section
                            aria-labelledby="orchestrator-step"
                            class="mt-4 rounded-md border border-line px-4 py-3"
                            [qitsEntity]="step"
                            entityKey="id"
                            data-step-detail
                          >
                            <h3
                              id="orchestrator-step"
                              class="mt-0 mb-2 flex flex-wrap items-center gap-2 text-base font-semibold"
                            >
                              <span [fieldOf]="step" qitsField="name">{{ step.name }}</span>
                              <ui-chip
                                [label]="step.status ?? ''"
                                [tone]="tone(step.status)"
                                [fieldOf]="step"
                                [qitsField]="marks.status"
                              />
                            </h3>
                            <dl
                              class="mt-0 mb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                              aria-label="The step"
                            >
                              <dt class="text-fg-muted">Step id</dt>
                              <dd class="m-0 font-mono text-xs" [fieldOf]="step" qitsField="id">
                                {{ step.id }}
                              </dd>
                              <dt class="text-fg-muted">Target</dt>
                              <dd class="m-0" [fieldOf]="step" qitsField="target">
                                {{ step.target }}
                              </dd>
                              <dt class="text-fg-muted">Depends on</dt>
                              <dd
                                class="m-0 font-mono text-xs"
                                [fieldOf]="step"
                                [qitsField]="marks.dependsOn"
                              >
                                {{ dependsOn(step) }}
                              </dd>
                              <dt class="text-fg-muted">Started</dt>
                              <dd class="m-0" [fieldOf]="step" [qitsField]="marks.started">
                                {{ instant(step.startedAt) }}
                              </dd>
                              <dt class="text-fg-muted">Finished</dt>
                              <dd class="m-0" [fieldOf]="step" [qitsField]="marks.finished">
                                {{ instant(step.finishedAt) }}
                              </dd>
                              <dt class="text-fg-muted">HTTP status</dt>
                              <dd class="m-0" [fieldOf]="step" [qitsField]="marks.httpStatus">
                                {{ step.httpStatus ?? none }}
                              </dd>
                            </dl>
                            @if (step.summary) {
                              <p class="mt-0 mb-3 text-sm" [fieldOf]="step" qitsField="summary">
                                {{ step.summary }}
                              </p>
                            }
                            @if (step.error) {
                              <p
                                role="alert"
                                class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
                                [fieldOf]="step"
                                qitsField="error"
                              >
                                {{ step.error }}
                              </p>
                            }

                            @if (stepMissing()) {
                              <p class="m-0 text-sm text-fg-muted">
                                The service holds no call of this step.
                              </p>
                            } @else {
                              <ui-load-failure
                                message="The step’s request and response could not be read."
                                [class.hidden]="stepState() !== 'error'"
                                (retry)="stepRead.reload()"
                              />
                              <ui-spinner
                                [state]="stepState()"
                                class="min-h-16"
                                [class.hidden]="stepState() === 'error'"
                              >
                                @if (call(); as detail) {
                                  <div
                                    class="flex flex-col gap-3"
                                    [qitsEntity]="detail"
                                    entityKey="id"
                                    [entitySource]="stepRead"
                                    data-call
                                  >
                                    <div>
                                      <h4 class="mt-0 mb-1 text-sm font-semibold">Request</h4>
                                      @if (detail.request; as request) {
                                        <p
                                          class="mt-0 mb-2 font-mono text-xs break-all"
                                          [fieldOf]="detail"
                                          [qitsField]="marks.request"
                                          data-request
                                        >
                                          {{ request.method }} {{ request.url }}
                                        </p>
                                        @if (request.body) {
                                          <ui-json-block
                                            heading="Request body"
                                            [json]="readable(request.body)"
                                            [fieldOf]="detail"
                                            [qitsField]="marks.requestBody"
                                          />
                                        } @else {
                                          <p class="m-0 text-xs text-fg-muted">No body.</p>
                                        }
                                      } @else {
                                        <p class="m-0 text-xs text-fg-muted">
                                          This step made no request.
                                        </p>
                                      }
                                    </div>
                                    <div>
                                      <h4 class="mt-0 mb-1 text-sm font-semibold">Response</h4>
                                      @if (detail.response; as response) {
                                        <button
                                          type="button"
                                          class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent"
                                          [attr.aria-expanded]="showResponse()"
                                          [fieldOf]="detail"
                                          [qitsField]="marks.responseBytes"
                                          (click)="showResponse.set(!showResponse())"
                                        >
                                          {{ responseToggle(detail.responseBytes) }}
                                        </button>
                                        @if (showResponse()) {
                                          <ui-json-block
                                            class="mt-2"
                                            heading="Response"
                                            [json]="readable(response)"
                                            [fieldOf]="detail"
                                            [qitsField]="marks.response"
                                          />
                                        }
                                      } @else {
                                        <p class="m-0 text-xs text-fg-muted">Nothing came back.</p>
                                      }
                                    </div>
                                  </div>
                                }
                              </ui-spinner>
                            }
                          </section>
                        } @else {
                          <p class="mt-4 mb-0 text-sm text-fg-muted" role="status">
                            This run has no step “{{ stepId }}”.
                          </p>
                        }
                      } @else {
                        <p class="mt-3 mb-0 text-sm text-fg-muted">
                          Press a step to see the request it made and the answer it got.
                        </p>
                      }
                    }
                  </div>
                } @else {
                  <!-- Only before the run's first answer: once a run is on screen it stays, and a
                       failed read again is said above it instead. -->
                  <ui-load-failure
                    message="The run could not be read."
                    [class.hidden]="runState() !== 'error'"
                    (retry)="runRead.reload()"
                  />
                  <ui-spinner
                    [state]="runState()"
                    class="min-h-32"
                    [class.hidden]="runState() === 'error'"
                  />
                }
              }
            </section>
          }
        }
      </app-page-layout>
    </div>
  `,
})
export class OrchestratorProcessPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** A run's Started (or "Show the newest run"): that run shown, the URL replaced. */
  protected readonly selecting = outcomes('open-orchestrator-run', { opened: stay() });

  /** A step's card: its call opened below the board, or closed again by a second press. */
  protected readonly stepping = outcomes('open-orchestrator-step', {
    opened: stay(),
    closed: stay(),
  });

  /** Run now's first press asks; Not now takes the question back. No request. */
  protected readonly asking = outcomes('ask-orchestrator-run', {
    asked: stay(),
    withdrawn: stay(),
  });

  /** Run now's second press: the new run shown, or the refusal said. */
  protected readonly running = outcomes('start-orchestrator-run', {
    started: stay(),
    refused: stay(),
  });

  /** Dry run: the new run shown, or the refusal said. */
  protected readonly dryRunning = outcomes('start-orchestrator-dry-run', {
    started: stay(),
    refused: stay(),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The URL's process kind. */
  protected readonly kind = computed(() => this.params().get('kind') ?? '');
  /** `?run=`: the run asked for; none shows the newest listed. */
  protected readonly runParam = computed(() => this.query().get('run') || undefined);
  /** `?step=`: the open step. */
  protected readonly stepParam = computed(() => this.query().get('step') || undefined);

  /** The technical processes: the title, the lede, and whether the kind is one. */
  protected readonly processes = qitsResource(PROCESS_LIST, () => (this.browser ? {} : undefined));

  /** The process's latest runs, newest first. */
  protected readonly runs = qitsResource(PROCESS_RUNS, () => {
    const kind = this.kind();
    return this.browser && kind ? { path: { kind } } : undefined;
  });

  /** The run shown: `?run=`, else the newest listed. */
  protected readonly shownRunId = computed(
    (): string | undefined => this.runParam() ?? this.listed()[0]?.id,
  );

  /** The shown run, without any step's bodies; read again every 10 s while it runs. */
  protected readonly runRead = qitsResource(PROCESS_RUN, () => {
    const id = this.shownRunId();
    return this.browser && id ? { path: { id }, query: { bodies: false } } : undefined;
  });

  /** The open step's call, whole: its request body and its response. */
  protected readonly stepRead = qitsResource(PROCESS_RUN_STEP, () => {
    const id = this.shownRunId();
    const stepId = this.stepParam();
    return this.browser && id && stepId && this.stepShown() ? { path: { id, stepId } } : undefined;
  });

  /**
   * The start. `online-only`: a run is sent now or not at all, never kept in an outbox to be sent
   * later, and nothing here sends it again by itself.
   */
  private readonly starting = qitsMutation(START_PROCESS_RUN, { offline: 'online-only' });

  /** The process the URL names, once listed. */
  protected readonly process = computed((): Process | undefined =>
    this.processes.hasValue()
      ? (this.processes.value() ?? []).find((known) => known.kind === this.kind())
      : undefined,
  );

  /** The process's name once it is known, the kind until then. */
  protected readonly title = computed(() => this.process()?.name || this.kind());

  /** The title's data marks: the process's name, once read. */
  protected readonly titleMarks = computed(() => {
    const known = this.process();
    return known?.name ? valueMarks(PROCESS_LIST, known, 'kind', 'name') : undefined;
  });

  /** The listed runs, newest first; none while unread. */
  protected readonly listed = computed(
    (): readonly ProcessRunSummary[] => (this.runs.hasValue() ? this.runs.value() : []) ?? [],
  );

  /**
   * The shown run as last read: kept through a failed poll (the resource keeps its value through a
   * failed reload, but not through a 404, which this keeps too: the last thing the service said),
   * and dropped when another run is shown.
   */
  protected readonly shownRun = linkedSignal<ShownRunSource, ProcessRun | undefined>({
    source: () => ({
      id: this.shownRunId(),
      value: this.runRead.hasValue() ? this.runRead.value() : undefined,
    }),
    computation: (source, previous) => {
      if (source.value && source.value.id === source.id) return source.value;
      const kept = previous?.value;
      return kept && kept.id === source.id ? kept : undefined;
    },
  });

  /** The shown run's steps in columns by dependency depth. */
  protected readonly board = computed(() => columns(this.shownRun()?.steps ?? []));

  /** The open step, as the shown run holds it. */
  protected readonly openStep = computed((): ProcessRunStep | undefined => {
    const stepId = this.stepParam();
    return stepId ? this.shownRun()?.steps?.find((step) => step.id === stepId) : undefined;
  });

  /** Whether the shown run holds the open step (a boolean, so a poll does not read it again). */
  private readonly stepShown = computed(() => this.openStep() !== undefined);

  /** The open step's call, once read, and only for the step open now. */
  protected readonly call = computed(() => {
    const call = this.stepRead.hasValue() ? this.stepRead.value() : undefined;
    return call && call.id === this.stepParam() ? call : undefined;
  });

  /** The response is shown: closed again whenever another step or run is opened. */
  protected readonly showResponse = linkedSignal({
    source: () => `${this.shownRunId()} ${this.stepParam()}`,
    computation: () => false,
  });

  private readonly statusOf = (read: { status(): string; error(): unknown }) => {
    if (read.status() !== 'error') return undefined;
    const error = read.error();
    return error instanceof QitsApiError ? error.status : undefined;
  };

  /** A 404 on the runs, or a kind the listed processes do not name. */
  protected readonly unknownKind = computed(
    () =>
      isMissing(this.runs) ||
      (this.processes.hasValue() && !!this.kind() && this.process() === undefined),
  );

  /** A 403 on the processes or the runs: the viewer's roles may not read them. */
  protected readonly refused = computed(
    () => this.statusOf(this.processes) === 403 || this.statusOf(this.runs) === 403,
  );

  /** A `?run=` (or a listed run) the service does not know, with nothing read of it. */
  protected readonly runMissing = computed(
    () => isMissing(this.runRead) && this.shownRun() === undefined,
  );

  /** A step the service holds no call of. */
  protected readonly stepMissing = computed(() => isMissing(this.stepRead));

  protected readonly runsState = computed((): LoadState => loadState(this.runs));

  /** The run's first read (once a run is on screen, a failed read again is `pollFailed`). */
  protected readonly runState = computed((): LoadState => loadState(this.runRead));

  protected readonly stepState = computed((): LoadState => loadState(this.stepRead));

  /** A poll (or Refresh) failed while a run is on screen: it stays, and the page says so. */
  protected readonly pollFailed = computed(
    () =>
      (this.runRead.reloadError() !== undefined || this.runRead.status() === 'error') &&
      this.shownRun() !== undefined,
  );

  /** `3 runs, newest first`, saying the list stops at the latest 20. */
  protected readonly caption = computed(
    () => `${plural(this.listed().length, 'run')}, newest first (the latest 20 at most)`,
  );

  /** Run now is waiting for its second press; a new process asks again from the start. */
  protected readonly confirming = linkedSignal({ source: this.kind, computation: () => false });

  /** A start is on its way. */
  private readonly busy = signal(false);

  /** What the last start came to when it brought no new run, in this page's words. */
  protected readonly startNote = linkedSignal<string, string | null>({
    source: this.kind,
    computation: () => null,
  });

  /** `Run garbage collection now? It deletes what the plan names.` */
  protected question(known: Process): string {
    const name = known.name || known.kind || '';
    return `Run ${name.charAt(0).toLowerCase()}${name.slice(1)} now? It deletes what the plan names.`;
  }

  /** Run now (its second press confirms), Dry run, Refresh. */
  protected readonly actions = computed((): readonly Action[] => [
    this.confirming()
      ? {
          label: 'Confirm: run now',
          variant: 'danger',
          disabled: this.busy(),
          outcomes: [this.running.started, this.running.refused],
          callback: () => void this.start(false),
        }
      : {
          label: 'Run now',
          variant: 'danger',
          disabled: this.busy(),
          outcomes: [this.asking.asked],
          callback: () => this.ask(),
        },
    {
      label: 'Dry run',
      variant: 'muted',
      disabled: this.busy(),
      outcomes: [this.dryRunning.started, this.dryRunning.refused],
      callback: () => void this.start(true),
    },
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ]);

  protected readonly marks = MARKS;
  protected readonly roles = ORCHESTRATOR_ROLES;
  protected readonly none = NONE;
  protected readonly instant = formatInstant;
  protected readonly took = took;
  protected readonly tone = processStatusTone;
  protected readonly path = callPath;
  protected readonly readable = readableJson;

  /** The shown run's id and status, and the open step's status, as last seen. */
  private seen: { run?: string; status?: string; step?: string; stepStatus?: string } = {};

  constructor() {
    pollWhile({
      active: () => this.shownRun()?.status === 'RUNNING',
      everyMs: RUNNING_RUN_POLL_MS,
      refresh: () => this.runRead.reload(),
    });

    // A shown run that leaves RUNNING moved its row (status, took, summary): the list is read
    // again. An open step whose status moved has a call (or a response) it did not have.
    effect(() => {
      const run = this.shownRun();
      const step = this.openStep();
      untracked(() => {
        const before = this.seen;
        this.seen = { run: run?.id, status: run?.status, step: step?.id, stepStatus: step?.status };
        if (!run || before.run !== run.id) return;
        if (before.status === 'RUNNING' && run.status !== 'RUNNING') this.runs.reload();
        if (step && before.step === step.id && before.stepStatus !== step.status) {
          this.stepRead.reload();
        }
      });
    });
  }

  /** `artifacts.plan, pins.ci`, or "—" for a step that waits for nothing. */
  protected dependsOn(step: ProcessRunStep): string {
    const names = step.dependsOn ?? [];
    return names.length ? names.join(', ') : NONE;
  }

  /** `Show 305 KiB`: what opening the response costs; `Hide the response` once open. */
  protected responseToggle(bytes: number | null | undefined): string {
    return this.showResponse() ? 'Hide the response' : `Show ${formatBytes(bytes)}`;
  }

  /** Opens a step's call below the board, or closes it on a second press; replaces the URL. */
  protected toggleStep(stepId: string | undefined): void {
    if (!stepId) return;
    const closing = this.stepParam() === stepId;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: closing ? null : stepId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (closing) this.stepping.closed.reach();
    else this.stepping.opened.reach();
  }

  /** Refresh: the process, the runs, the shown run and the open step, read again. */
  protected refresh(): void {
    this.processes.reload();
    this.runs.reload();
    if (this.shownRunId()) this.runRead.reload();
    if (this.openStep()) this.stepRead.reload();
  }

  /** Not now: the question taken back. */
  protected withdraw(): void {
    this.confirming.set(false);
    this.asking.withdrawn.reach();
  }

  /** Run now's first press: it asks. */
  private ask(): void {
    this.confirming.set(true);
    this.startNote.set(null);
    this.asking.asked.reach();
  }

  /**
   * Starts a run, dry or real, once. A 202 shows the new run and reads the list again; a refusal
   * is said, and a 409 (a run already active) shows the newest run, which is the active one.
   */
  private async start(dryRun: boolean): Promise<void> {
    const kind = this.kind();
    if (this.busy() || !kind) return;
    const reached = dryRun ? this.dryRunning : this.running;
    this.busy.set(true);
    this.confirming.set(false);
    this.startNote.set(null);
    try {
      const started = await this.starting.run({ path: { kind }, body: { dryRun } });
      if (started?.id) {
        this.show(started.id);
        this.runs.reload();
        reached.started.reach();
      } else {
        this.startNote.set(explainStart(undefined));
        this.runs.reload();
        reached.refused.reach();
      }
    } catch (error) {
      this.startNote.set(explainStart(error));
      if (error instanceof QitsApiError && error.status === 409) this.show(null);
      this.runs.reload();
      reached.refused.reach();
    } finally {
      this.busy.set(false);
    }
  }

  /** Shows run `id` (the newest for `null`), no step open; replaces the URL. */
  private show(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { run: id, step: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  status: { derived: ['status'] },
  summary: { derived: ['summary'] },
  requestBody: { derived: ['request.body'] },
  response: { derived: ['response'] },
  question: { derived: ['name', 'kind'] },
  started: { derived: ['startedAt'] },
  finished: { derived: ['finishedAt'] },
  took: { derived: ['startedAt', 'finishedAt'] },
  outcome: { derived: ['summary', 'error'] },
  dryRun: { derived: ['dryRun'] },
  call: { derived: ['request.method', 'request.url'] },
  request: { derived: ['request.method', 'request.url'] },
  dependsOn: { derived: ['dependsOn'] },
  httpStatus: { derived: ['httpStatus'] },
  responseBytes: { derived: ['responseBytes'] },
} as const;
