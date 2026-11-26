import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import {
  ISSUE_STATES,
  issueStateLabel,
  issueStateOf,
  issueStateTone,
  issueTitle,
  isRegressed,
  type IssueState,
} from '$core/observability/error-issues';
import { LIST_ERROR_ISSUES } from '$core/observability/observability.operations';
import { refused } from '$core/observability/telemetry';
import { SelectedProject } from '$core/projects/selected-project';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page reads of the URL's query (`?state=&service=`). */
interface ErrorsQuery {
  readonly state: IssueState;
  readonly service: string | undefined;
}

/**
 * The Observability section's Errors page, at `/projects/<slug>/observability/errors` (qits-2538,
 * which replaced qits-2339's view derived from the telemetry buffer): the error issues
 * qits-observability stores, one per fingerprint, across the whole estate (an issue belongs to no
 * buffer source, so there is no source picker).
 *
 * It reads `LIST_ERROR_ISSUES` (`listErrorIssues`), the lens in the URL: `?state=` (OPEN, the
 * default and sent as none, DISMISSED or ALL; a segmented control) and `?service=` (→ `service`,
 * shown as a filter to clear). Each row is an issue, most recently seen first as the service answers
 * them: its title (`<simple exception type>: <message>`, else the message), the service, the
 * location, the count, last seen as a relative time (the instant in its tooltip), its state when
 * the lens shows more than OPEN, and a "regressed" chip on an OPEN issue that came back after a
 * dismissal. A row opens the issue's page (`open-error-issue`). The service answers at most 200
 * (its default `limit`, never sent) and says when it left some out, which the page repeats.
 *
 * The read runs in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read issues)
 * is said as such; any other failure offers Retry; an empty answer says no issue is in that state.
 * Marks (qits-2141): the list is the issues read, each row an issue by its `fingerprint`.
 *
 * Staleness (qits-1270): no domain event refreshes it (`ErrorIssueOpened` does not reach the
 * browser), so Refresh reads again.
 */
@Component({
  selector: 'app-observability-errors-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
      <app-page-layout title="Errors" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The errors the platform’s services raised, one issue per kind of failure, kept beyond the
          telemetry buffer. Dismiss an issue once it is dealt with; it opens again if it comes back.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading error issues needs qits:admin.
        </p>

        <section aria-label="Error issues" [class.hidden]="refusal()">
          <div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <div role="group" aria-label="State" class="flex flex-wrap gap-1">
              @for (state of states; track state) {
                <button
                  type="button"
                  class="cursor-pointer rounded px-2 py-0.5 text-xs font-semibold"
                  [class]="
                    state === query().state
                      ? 'bg-surface-inverse text-fg-on-inverse'
                      : 'bg-surface-muted text-fg-soft hover:bg-surface-active'
                  "
                  [attr.aria-pressed]="state === query().state"
                  (click)="setQuery({ state: state === 'OPEN' ? null : state })"
                >
                  {{ stateLabel(state) }}
                </button>
              }
            </div>
            <span
              class="items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg-muted"
              [class]="query().service ? 'inline-flex' : 'hidden'"
              data-service-filter
            >
              Service <span class="font-mono text-fg">{{ query().service }}</span>
              <button
                type="button"
                class="ml-1 cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline"
                (click)="setQuery({ service: null })"
              >
                Clear
              </button>
            </span>
          </div>
          <ui-load-failure
            message="The error issues could not be read."
            [class.hidden]="issuesState() !== 'error' || refusal()"
            (retry)="issues.reload()"
          />
          <ui-spinner
            [state]="issuesState()"
            class="min-h-32"
            [class.hidden]="issuesState() === 'error'"
          >
            <p
              class="m-0 mb-2 text-xs text-fg-muted"
              [class.hidden]="!truncated()"
              [qitsEntityList]="issues"
              [fieldOf]="issuesValue()"
              [qitsField]="{ derived: ['issues', 'total'] }"
              data-truncated
            >
              More issues exist than are shown: {{ rows().length }} of {{ total() }}.
            </p>
            <ol
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0"
              [class.hidden]="rows().length === 0"
              [qitsEntityList]="issues"
            >
              @for (issue of rows(); track issue.fingerprint) {
                <li class="text-sm" [qitsEntity]="issue" entityKey="fingerprint">
                  <a
                    class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2 text-fg no-underline hover:bg-surface-muted"
                    [qitsExit]="opening.issue"
                    [exitParams]="{ slug: slug(), fingerprint: issue.fingerprint ?? '' }"
                    data-issue
                  >
                    <span class="flex min-w-0 flex-wrap items-baseline gap-2">
                      <span
                        class="min-w-0 font-semibold break-words text-accent"
                        [fieldOf]="issue"
                        [qitsField]="marks.title"
                        >{{ title(issue) || 'No message' }}</span
                      >
                      @if (query().state !== 'OPEN') {
                        <ui-chip
                          [label]="issue.state ?? ''"
                          [tone]="stateTone(issue.state)"
                          [fieldOf]="issue"
                          [qitsField]="{ derived: ['state'] }"
                        />
                      }
                      @if (regressed(issue)) {
                        <ui-chip
                          label="regressed"
                          tone="waiting"
                          [fieldOf]="issue"
                          [qitsField]="marks.regressed"
                          data-regressed
                        />
                      }
                    </span>
                    <span
                      class="text-right font-mono font-semibold whitespace-nowrap text-fg tabular-nums"
                      [fieldOf]="issue"
                      [qitsField]="{ derived: ['occurrences'] }"
                      [attr.aria-label]="(issue.occurrences ?? 0) + ' occurrences'"
                      data-count
                      >{{ issue.occurrences ?? 0 }}×</span
                    >
                    <span class="flex min-w-0 flex-wrap gap-x-2 text-xs text-fg-muted">
                      <span
                        class="font-semibold text-fg-soft"
                        [fieldOf]="issue"
                        qitsField="serviceName"
                        >{{ issue.serviceName || '—' }}</span
                      >
                      @if (issue.location) {
                        <span aria-hidden="true">·</span>
                        <span
                          class="min-w-0 font-mono break-all"
                          [fieldOf]="issue"
                          qitsField="location"
                          >{{ issue.location }}</span
                        >
                      }
                    </span>
                    <span
                      class="text-right text-xs whitespace-nowrap text-fg-muted"
                      [title]="instant(issue.lastSeen)"
                      [fieldOf]="issue"
                      [qitsField]="{ derived: ['lastSeen'] }"
                      >last seen {{ ago(issue.lastSeen) }}</span
                    >
                  </a>
                </li>
              }
            </ol>
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="issuesState() === 'loaded' && rows().length === 0 ? 'block' : 'hidden'"
            >
              {{ emptyText() }}
            </p>
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityErrorsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selected = inject(SelectedProject);

  protected readonly states = ISSUE_STATES;
  protected readonly stateLabel = issueStateLabel;
  protected readonly stateTone = issueStateTone;
  protected readonly title = issueTitle;
  protected readonly regressed = isRegressed;
  protected readonly instant = formatInstant;
  protected readonly marks = MARKS;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the state and the service. */
  protected readonly query = computed((): ErrorsQuery => ({
    state: issueStateOf(this.params()?.get('state')),
    service: this.params()?.get('service') || undefined,
  }));

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The stored issues in the lens, in the browser only; OPEN, the default, is sent as nothing. */
  protected readonly issues = qitsResource(LIST_ERROR_ISSUES, () => {
    const { state, service } = this.query();
    if (!this.browser) return undefined;
    return {
      query: { ...(state !== 'OPEN' ? { state } : {}), ...(service ? { service } : {}) },
    };
  });

  protected readonly issuesValue = computed(() =>
    this.issues.hasValue() ? (this.issues.value() ?? {}) : {},
  );

  protected readonly rows = computed(() => this.issuesValue().issues ?? []);

  protected readonly truncated = computed(() => this.issuesValue().truncated === true);

  protected readonly total = computed(() => this.issuesValue().total ?? this.rows().length);

  protected readonly issuesState = computed((): LoadState => loadState(this.issues));

  protected readonly refusal = computed(() => refused(this.issues));

  /** What an empty answer says, by the lens. */
  protected readonly emptyText = computed(() => {
    const { state, service } = this.query();
    const of = service ? ` for ${service}` : '';
    if (state === 'DISMISSED') return `No error issue${of} is dismissed.`;
    if (state === 'ALL') return `No error issue${of} is stored.`;
    return `No error issue${of} is open: nothing has failed since the last ones were dismissed.`;
  });

  /** A row: its issue's page (qits-2538), a declared exit (epic qits-2000). */
  protected readonly opening = outcomes('open-error-issue', {
    issue: exit('projects/:slug/observability/errors/:fingerprint'),
  });

  /** Refresh: no domain event follows the issues (qits-1270), so it reads them again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.issues.reload() },
  ];

  protected ago(iso: string | undefined): string {
    return formatRelativeTime(iso);
  }

  /** Puts `change` into the URL's query, which is what reads the issues again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}

/** The marks of what a row computes from its issue. */
const MARKS = {
  title: { derived: ['exceptionType', 'message'] },
  regressed: { derived: ['state', 'regressions'] },
} as const;
