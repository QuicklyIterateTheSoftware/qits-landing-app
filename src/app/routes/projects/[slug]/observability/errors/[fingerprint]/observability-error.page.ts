import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
} from '@qits/angular';
import {
  hourChart,
  hourLabel,
  issueStateTone,
  issueTitle,
  serviceSource,
} from '$core/observability/error-issues';
import type { ErrorIssueDetail } from '$core/observability/observability.consumes';
import { DISMISS_ERROR_ISSUE, GET_ERROR_ISSUE } from '$core/observability/observability.operations';
import { refused } from '$core/observability/telemetry';
import { SelectedProject } from '$core/projects/selected-project';
import {
  describeRefusal,
  formatInstant,
  formatRelativeTime,
} from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { ActionButton } from '$ui/components/action-button/action-button';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * One stored error issue, at `/projects/<slug>/observability/errors/<fingerprint>` (qits-2538): a
 * detail page with no sidebar entry (the sidebar keeps Errors current), reached from a row of the
 * Errors page (`open-error-issue`) and from a log line's issue link (`open-log-error-issue`).
 *
 * It reads `GET_ERROR_ISSUE` (`getErrorIssue`) by the fingerprint in the path alone: the door's
 * default `hours` is the seven days the chart draws (168), so none is sent. It shows the title
 * (`<simple exception type>: <message>`, else the message), the state as a chip and "regressed N×"
 * when the issue came back after a dismissal; Where (the service, the versions as `first → last`
 * and the location); When (first and last seen, each as an instant and a relative time); How often
 * (the total occurrences and an hourly bar chart of `hourly`, `hourChart` in
 * `core/observability/error-issues.ts`: seven days up to the newest hour it was seen, one bar per
 * hour in the accent token on a muted track, as the Metrics page draws its bars, each bar's hour and
 * count in its tooltip); the sample message; and the sample stack trace in a collapsed `<details>`.
 *
 * Its exits: Show log lines opens the Logs page at `?fingerprint=<fp>&level=ERROR`
 * (`open-error-issue-logs`, qits-2537: by fingerprint, so an occurrence with no trace still shows,
 * though only lines still in the buffer do); Open trace, only when the issue has a sample trace,
 * opens the trace page at the service's buffer source (`_service/<service>`,
 * `open-error-issue-trace`). Dismiss, on an OPEN issue only, sends `DISMISS_ERROR_ISSUE` on a
 * second press ("Confirm dismiss?") through `qitsMutation`; the answer's state takes the shown
 * one's place. A refusal is said beside the button (403: dismissing needs `qits:admin`,
 * `qits:admin-agent` or `qits:desk-admin`, so `qits:agent` cannot).
 *
 * The read runs in the browser only (the server has no session). A refused read (403) says so, a
 * 404 that no issue has this fingerprint, anything else offers Retry. Staleness (qits-1270): no
 * domain event refreshes it (`ErrorIssueOpened` does not reach the browser), so Refresh reads
 * again.
 */
@Component({
  selector: 'app-observability-error-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Error issue" [actions]="actions">
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading error issues needs qits:admin.
        </p>
        <p
          class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
          [class.hidden]="!missing()"
          data-missing
        >
          No error issue has the fingerprint
          <span class="font-mono text-fg">{{ fingerprint() }}</span
          >.
        </p>
        <ui-load-failure
          message="This error issue could not be read."
          [class.hidden]="state() !== 'error' || refusal() || missing()"
          (retry)="read.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          @if (issue(); as issue) {
            <article [qitsEntityList]="read" class="flex flex-col gap-5">
              <header [qitsEntity]="issue" entityKey="fingerprint" class="flex flex-col gap-2">
                <h2
                  class="m-0 text-lg font-semibold break-words text-fg"
                  [fieldOf]="issue"
                  [qitsField]="marks.title"
                >
                  {{ title(issue) || 'No message' }}
                </h2>
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <ui-chip
                    [label]="shownState() ?? ''"
                    [tone]="stateTone(shownState())"
                    [fieldOf]="issue"
                    [qitsField]="{ derived: ['state'] }"
                    data-state
                  />
                  @if (shownState() === 'OPEN' && (issue.regressions ?? 0) > 0) {
                    <ui-chip
                      [label]="'regressed ' + issue.regressions + '×'"
                      tone="waiting"
                      [fieldOf]="issue"
                      [qitsField]="marks.regressed"
                      data-regressed
                    />
                  }
                  <span
                    class="font-mono text-xs text-fg-muted"
                    [fieldOf]="issue"
                    qitsField="fingerprint"
                    >{{ issue.fingerprint }}</span
                  >
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <a
                    class="text-accent no-underline hover:underline"
                    [qitsExit]="logging.logs"
                    [exitParams]="{ slug: slug() }"
                    [exitQueryParams]="{ fingerprint: issue.fingerprint, level: 'ERROR' }"
                    data-issue-logs
                    >Show log lines</a
                  >
                  @if (issue.sampleTraceId) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="tracing.trace"
                      [exitParams]="{ slug: slug(), traceId: issue.sampleTraceId }"
                      [exitQueryParams]="{ source: source(issue) }"
                      [fieldOf]="issue"
                      [qitsField]="{ derived: ['sampleTraceId', 'serviceName'] }"
                      data-issue-trace
                      >Open trace</a
                    >
                  }
                  @if (shownState() === 'OPEN') {
                    <ui-action-button [action]="dismiss()" />
                  }
                </div>
                <p class="m-0 text-xs text-fg-muted">
                  Show log lines lists only the lines still in the telemetry buffer; older
                  occurrences are counted here but their lines are gone.
                </p>
                @if (dismissRefused(); as refusedText) {
                  <p class="m-0 text-sm text-danger" role="alert" data-dismiss-refused>
                    {{ refusedText }}
                  </p>
                }
              </header>

              <section aria-label="Where" [qitsEntity]="issue" entityKey="fingerprint">
                <h3 class="mt-0 mb-1 text-sm font-semibold">Where</h3>
                <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt class="text-fg-muted">Service</dt>
                  <dd class="m-0 text-fg" [fieldOf]="issue" qitsField="serviceName">
                    {{ issue.serviceName || '—' }}
                  </dd>
                  <dt class="text-fg-muted">Versions</dt>
                  <dd
                    class="m-0 font-mono text-fg"
                    [fieldOf]="issue"
                    [qitsField]="{ derived: ['firstVersion', 'lastVersion'] }"
                  >
                    {{ issue.firstVersion || '—' }} → {{ issue.lastVersion || '—' }}
                  </dd>
                  <dt class="text-fg-muted">Location</dt>
                  <dd
                    class="m-0 font-mono break-all text-fg"
                    [fieldOf]="issue"
                    qitsField="location"
                  >
                    {{ issue.location || '—' }}
                  </dd>
                </dl>
              </section>

              <section aria-label="When" [qitsEntity]="issue" entityKey="fingerprint">
                <h3 class="mt-0 mb-1 text-sm font-semibold">When</h3>
                <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt class="text-fg-muted">First seen</dt>
                  <dd
                    class="m-0 text-fg"
                    [fieldOf]="issue"
                    [qitsField]="{ derived: ['firstSeen'] }"
                  >
                    {{ instant(issue.firstSeen) }}
                    <span class="text-fg-muted">({{ ago(issue.firstSeen) }})</span>
                  </dd>
                  <dt class="text-fg-muted">Last seen</dt>
                  <dd class="m-0 text-fg" [fieldOf]="issue" [qitsField]="{ derived: ['lastSeen'] }">
                    {{ instant(issue.lastSeen) }}
                    <span class="text-fg-muted">({{ ago(issue.lastSeen) }})</span>
                  </dd>
                </dl>
              </section>

              <section aria-label="How often" [qitsEntity]="issue" entityKey="fingerprint">
                <h3 class="mt-0 mb-1 text-sm font-semibold">How often</h3>
                <p class="m-0 mb-2 text-sm text-fg" [fieldOf]="issue" qitsField="occurrences">
                  <span class="font-mono text-2xl font-semibold tabular-nums">{{
                    issue.occurrences ?? 0
                  }}</span>
                  occurrences in all
                </p>
                @if (chart().bars.length) {
                  <figure class="m-0" [fieldOf]="issue" [qitsField]="marks.chart" data-chart>
                    <ol
                      class="m-0 flex h-24 list-none items-end gap-px border-b border-line bg-surface-muted p-0"
                      [attr.aria-label]="chartSummary()"
                    >
                      @for (bar of chart().bars; track bar.hour) {
                        <li
                          class="flex h-full min-w-0 flex-1 items-end"
                          [title]="hour(bar.hour) + ': ' + bar.count"
                          data-bar
                        >
                          <span
                            class="block w-full rounded-t-sm bg-accent"
                            [style.height]="bar.height"
                            aria-hidden="true"
                          ></span>
                        </li>
                      }
                    </ol>
                    <figcaption class="mt-1 flex justify-between gap-2 text-xs text-fg-muted">
                      <span>{{ hour(chart().from) }}</span>
                      <span>per hour, peak {{ chart().max }}</span>
                      <span>{{ hour(chart().to) }}</span>
                    </figcaption>
                  </figure>
                } @else {
                  <p class="m-0 text-sm text-fg-muted">No occurrence in the last seven days.</p>
                }
              </section>

              <section aria-label="Sample" [qitsEntity]="issue" entityKey="fingerprint">
                <h3 class="mt-0 mb-1 text-sm font-semibold">Sample</h3>
                <p
                  class="m-0 mb-2 text-sm break-words whitespace-pre-line text-fg"
                  [fieldOf]="issue"
                  qitsField="sampleMessage"
                >
                  {{ issue.sampleMessage || 'No message was recorded.' }}
                </p>
                @if (issue.sampleStacktrace) {
                  <details class="text-sm" data-stacktrace>
                    <summary class="cursor-pointer text-accent">Stack trace</summary>
                    <pre
                      class="m-0 mt-1 overflow-x-auto rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs whitespace-pre text-fg"
                      [fieldOf]="issue"
                      qitsField="sampleStacktrace"
                      >{{ issue.sampleStacktrace }}</pre>
                  </details>
                }
              </section>
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityErrorPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly selected = inject(SelectedProject);
  private readonly dismissing = qitsMutation(DISMISS_ERROR_ISSUE);

  protected readonly title = issueTitle;
  protected readonly stateTone = issueStateTone;
  protected readonly instant = formatInstant;
  protected readonly hour = hourLabel;
  protected readonly source = (issue: ErrorIssueDetail) => serviceSource(issue.serviceName);
  protected readonly marks = MARKS;

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly fingerprint = computed(() => this.paramMap().get('fingerprint') ?? '');

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The issue, in the browser only; the door's default `hours` (168) is the chart's week. */
  protected readonly read = qitsResource(GET_ERROR_ISSUE, () => {
    const fingerprint = this.fingerprint();
    if (!this.browser || !fingerprint) return undefined;
    return { path: { fingerprint } };
  });

  protected readonly issue = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  protected readonly state = computed((): LoadState => loadState(this.read));

  protected readonly refusal = computed(() => refused(this.read));

  /** Whether the read answered that no issue has this fingerprint. */
  protected readonly missing = computed(() => {
    if (this.read.status() !== 'error') return false;
    const error = this.read.error();
    return error instanceof QitsApiError && error.status === 404;
  });

  /** The state a dismissal answered, which replaces the read's until the issue is read again. */
  private readonly dismissed = signal<string | null>(null);

  protected readonly shownState = computed(() => this.dismissed() ?? this.issue()?.state);

  protected readonly chart = computed(() => {
    const issue = this.issue();
    return hourChart(issue?.hourly, issue?.lastSeen);
  });

  /** The chart as words, for a reader who cannot see it. */
  protected readonly chartSummary = computed(() => {
    const { total, max, from, to } = this.chart();
    return `${total} occurrences per hour from ${hourLabel(from)} to ${hourLabel(to)}, at most ${max} in one hour`;
  });

  /** Dismiss pressed once, waiting for its confirmation. */
  protected readonly pending = signal(false);
  /** Dismiss on its way. */
  protected readonly inFlight = signal(false);
  /** Why the last dismissal was not taken, said beside the button. */
  protected readonly dismissRefused = signal<string | null>(null);

  protected readonly dismiss = computed((): Action => ({
    label: this.pending() ? 'Confirm dismiss?' : 'Dismiss',
    variant: 'muted',
    disabled: this.inFlight(),
    details: {
      title: 'Dismiss this issue',
      items: ['It leaves the open issues.', 'If it occurs again, it opens again as a regression.'],
    },
    callback: () => void this.press(),
  }));

  /** Show log lines: the Logs page at the issue's fingerprint (qits-2537). */
  protected readonly logging = outcomes('open-error-issue-logs', {
    logs: exit('projects/:slug/observability/logs'),
  });

  /** Open trace: the sample trace's page at the service's buffer source. */
  protected readonly tracing = outcomes('open-error-issue-trace', {
    trace: exit('projects/:slug/observability/traces/:traceId'),
  });

  /** Refresh: no domain event follows the issue (qits-1270), so it reads it again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.refresh() },
  ];

  constructor() {
    // Another issue's address shows that issue's own state, not the one dismissed here.
    effect(() => {
      this.fingerprint();
      this.dismissed.set(null);
      this.pending.set(false);
      this.dismissRefused.set(null);
    });
  }

  protected ago(iso: string | undefined): string {
    return formatRelativeTime(iso);
  }

  protected refresh(): void {
    this.dismissed.set(null);
    this.read.reload();
  }

  /** Dismiss's press: the first asks to confirm, the second sends it; a refusal is said. */
  protected async press(): Promise<void> {
    this.dismissRefused.set(null);
    if (!this.pending()) {
      this.pending.set(true);
      return;
    }
    const fingerprint = this.issue()?.fingerprint;
    if (!fingerprint) return;
    this.pending.set(false);
    this.inFlight.set(true);
    try {
      const answer = await this.dismissing.run({ path: { fingerprint } });
      if (answer?.state) this.dismissed.set(answer.state);
      else this.read.reload();
    } catch (error) {
      const { status, message } = refusedBy(error);
      this.dismissRefused.set(dismissRefusal(status, message));
    } finally {
      this.inFlight.set(false);
    }
  }
}

/** Why a dismissal was refused, for a person to read. */
export function dismissRefusal(status: number, message: string | undefined): string {
  if (status === 403)
    return 'Could not dismiss: dismissing an error issue needs qits:admin, qits:admin-agent or qits:desk-admin.';
  if (status === 404) return 'Could not dismiss: no error issue has this fingerprint any more.';
  return `Could not dismiss — ${describeRefusal(status, message)}.`;
}

/** The marks of what the page computes from the issue. */
const MARKS = {
  title: { derived: ['exceptionType', 'message'] },
  regressed: { derived: ['state', 'regressions'] },
  chart: { derived: ['hourly', 'lastSeen'] },
} as const;
