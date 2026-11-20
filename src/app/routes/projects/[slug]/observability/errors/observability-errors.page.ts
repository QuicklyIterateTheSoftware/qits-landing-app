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
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import {
  attribute,
  evidenceCounts,
  exceptionText,
  firstException,
  viewErrorGroups,
  type ErrorGroupView,
} from '$core/observability/error-groups';
import type { TelemetryErrorSpan } from '$core/observability/observability.consumes';
import { TELEMETRY_ERRORS, TELEMETRY_SOURCES } from '$core/observability/observability.operations';
import {
  levelTone,
  lineTime,
  minutesOf,
  refused,
  SINCE_MINUTES,
  sinceLabel,
  versionOf,
} from '$core/observability/telemetry';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { TelemetrySourcePicker } from '$patterns/observability/source-picker/source-picker';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page reads of the URL's query (`?source=&since=`, the old frontend's names). */
interface ErrorsQuery {
  readonly source: string | undefined;
  readonly since: number | undefined;
}

/** A group's identity on the page: its trace id and its service (the uncorrelated one has no id). */
function groupKey(view: Pick<ErrorGroupView, 'traceId' | 'serviceName'>): string {
  return `${view.traceId}\u0000${view.serviceName}`;
}

/** A span's duration: milliseconds below a second, else seconds. */
export function spanDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '';
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(2)} s`;
}

/**
 * The Observability section's Errors page, at `/projects/<slug>/observability/errors` (qits-2339,
 * the retired qits-observability-frontend's `errors`): what failed lately in one source of
 * qits-observability's telemetry buffer, which holds only the platform's recent records.
 *
 * On top, the source picker (`app-telemetry-source-picker`, shared with the Logs page); the chosen
 * source's key is `?source=`. Below, its error spans and ERROR-or-worse logs grouped by the trace
 * they belong to (`TELEMETRY_ERRORS`, `listTelemetryErrors`), narrowed by the time range (`?since=`
 * minutes → `sinceMinutes`; absent: everything buffered, the default). Nothing is read until a
 * source is chosen: a sourceless read answers an empty list, which would claim "no errors" about
 * nothing. The service answers at most 200 groups (its default `limit`) and says when it left some
 * out (`truncated`, `total`), which the page repeats.
 *
 * One row per group (`error-groups.ts`), in the service's order with the uncorrelated group (its
 * empty trace id) last: the headline (the exception as `type: message`, else a span's status
 * message, else a log's body), the service, its evidence counts, its latest instant (UTC, like a
 * log line's time), the `service.version` its evidence carries and the trace id, a link to the
 * trace's page at the same source (`open-telemetry-trace`, qits-2343; the uncorrelated group's has
 * none). Each row's
 * Error logs link opens the Logs page at the same source from ERROR up
 * (`open-telemetry-error-logs`). Its headline expands it: the error spans (name, kind, duration,
 * status message, exception and stack trace) and the error logs (time, level, body), all of which
 * arrived inside the group.
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read
 * telemetry) is said as such; any other failure offers Retry; an empty answer says no errors are
 * buffered, which on a working service is good news. Marks (qits-2141): the picker is the sources
 * read; the group list is the errors read, each row a group by its `traceId`, each span by its
 * `startEpochNanos` and each log by its `epochNanos`.
 *
 * Staleness (qits-1270): none, no domain event; Refresh re-reads.
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
    TelemetrySourcePicker,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Errors" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          What failed lately: a source’s error spans and error logs, grouped by the trace they
          belong to. The buffer holds only recent records; older ones are gone.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading telemetry needs qits:admin.
        </p>
        <app-telemetry-source-picker
          [sources]="sources"
          [state]="sourcesState()"
          [selected]="query().source"
          [refused]="refusal()"
        />

        <section
          class="mt-6"
          aria-label="Error groups"
          [class.hidden]="!query().source || refusal()"
        >
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Time range
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ since: value($event) || null })"
              >
                <option value="" [selected]="!query().since">Everything buffered</option>
                @for (minutes of sinceMinutes; track minutes) {
                  <option [value]="minutes" [selected]="minutes === query().since">
                    {{ sinceLabel(minutes) }}
                  </option>
                }
              </select>
            </label>
          </div>
          <ui-load-failure
            message="This source’s errors could not be read."
            [class.hidden]="errorsState() !== 'error' || refusal()"
            (retry)="errors.reload()"
          />
          <ui-spinner
            [state]="errorsState()"
            class="min-h-32"
            [class.hidden]="errorsState() === 'error'"
          >
            <p
              class="m-0 mb-2 text-xs text-fg-muted"
              [class.hidden]="!truncated()"
              [qitsEntityList]="errors"
              [fieldOf]="errorsValue()"
              [qitsField]="{ derived: ['groups', 'total'] }"
              data-truncated
            >
              More groups exist than are shown: {{ groups().length }} of {{ total() }}. Narrow the
              time range.
            </p>
            <ol
              class="m-0 flex list-none flex-col gap-2 p-0"
              [class.hidden]="groups().length === 0"
              [qitsEntityList]="errors"
            >
              @for (view of groups(); track key(view)) {
                <li
                  class="rounded-md border border-line bg-surface text-sm"
                  [qitsEntity]="view.group"
                  entityKey="traceId"
                >
                  <div class="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 pt-2">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 cursor-pointer items-start gap-2 border-0 bg-transparent p-0 text-left text-fg"
                      [attr.aria-expanded]="isOpen(view)"
                      (click)="toggle(view)"
                      [fieldOf]="view.group"
                      [qitsField]="marks.headline"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        class="mt-0.5 size-4 shrink-0 text-fg-muted"
                        [class.-rotate-90]="!isOpen(view)"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                      <span
                        class="min-w-0 font-semibold break-words"
                        [class.italic]="!view.headline"
                      >
                        {{ view.headline || 'No message on any of this group’s evidence.' }}
                      </span>
                    </button>
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="opening.logs"
                      [exitParams]="{ slug: slug() }"
                      [exitQueryParams]="{ source: query().source, level: 'ERROR' }"
                      >Error logs</a
                    >
                  </div>
                  <p
                    class="m-0 flex flex-wrap gap-x-2 px-3 pt-1 pb-2 pl-9 text-xs text-fg-muted"
                    [fieldOf]="view.group"
                    [qitsField]="marks.meta"
                  >
                    <span class="font-semibold text-fg-soft">{{ view.serviceName || '—' }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ counts(view) }}</span>
                    @if (view.latestEpochMillis) {
                      <span aria-hidden="true">·</span>
                      <span class="font-mono">{{ latest(view) }}</span>
                    }
                    @if (view.version) {
                      <span aria-hidden="true">·</span>
                      <span class="font-mono">{{ view.version }}</span>
                    }
                    <span aria-hidden="true">·</span>
                    @if (view.uncorrelated) {
                      <span>Not correlated to a trace</span>
                    } @else {
                      <a
                        class="font-mono text-accent no-underline hover:underline"
                        [qitsExit]="tracing.trace"
                        [exitParams]="{ slug: slug(), traceId: view.traceId }"
                        [exitQueryParams]="{ source: query().source }"
                        data-trace
                        >trace {{ view.traceId }}</a
                      >
                    }
                  </p>
                  @if (isOpen(view)) {
                    <div class="border-t border-line px-3 py-2" data-members>
                      @if (view.spanCount) {
                        <h3 class="mt-0 mb-1 text-sm font-semibold">Error spans</h3>
                        <ul class="m-0 mb-3 flex list-none flex-col gap-2 p-0">
                          @for (span of view.group.errorSpans; track $index) {
                            <li [qitsEntity]="span" entityKey="startEpochNanos">
                              <p class="m-0 flex flex-wrap items-baseline gap-x-2">
                                <span
                                  class="font-mono font-semibold text-fg"
                                  [fieldOf]="span"
                                  qitsField="name"
                                  >{{ span.name || '(unnamed span)' }}</span
                                >
                                <ui-chip
                                  [label]="span.kind || 'UNSPECIFIED'"
                                  tone="neutral"
                                  [fieldOf]="span"
                                  [qitsField]="{ derived: ['kind'] }"
                                />
                                <span
                                  class="text-xs text-fg-muted"
                                  [fieldOf]="span"
                                  [qitsField]="{ derived: ['durationMs'] }"
                                  >{{ duration(span.durationMs) }}</span
                                >
                                <span
                                  class="font-mono text-xs text-fg-muted"
                                  [fieldOf]="span"
                                  [qitsField]="{ derived: ['startEpochNanos'] }"
                                  >{{ time(span.startEpochNanos) }}</span
                                >
                                <span
                                  class="font-mono text-xs text-fg-muted"
                                  [class.hidden]="!version(span.resourceAttributes)"
                                  [fieldOf]="span"
                                  [qitsField]="{ derived: ['resourceAttributes'] }"
                                  >{{ version(span.resourceAttributes) }}</span
                                >
                              </p>
                              <p
                                class="m-0 mt-0.5 text-fg-soft"
                                [class.hidden]="!span.statusMessage"
                                [fieldOf]="span"
                                qitsField="statusMessage"
                              >
                                {{ span.statusMessage }}
                              </p>
                              <p
                                class="m-0 mt-0.5 font-semibold text-fg"
                                [class.hidden]="!exception(span)"
                                [fieldOf]="span"
                                [qitsField]="{ derived: ['events'] }"
                              >
                                {{ exception(span) }}
                              </p>
                              <pre
                                class="m-0 mt-1 overflow-x-auto rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs whitespace-pre text-fg"
                                [class.hidden]="!stacktrace(span)"
                                [fieldOf]="span"
                                [qitsField]="{ derived: ['events'] }"
                                >{{ stacktrace(span) }}</pre>
                            </li>
                          }
                        </ul>
                      }
                      @if (view.logCount) {
                        <h3 class="mt-0 mb-1 text-sm font-semibold">Error logs</h3>
                        <ol
                          class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0 font-mono text-xs"
                        >
                          @for (log of view.group.errorLogs; track $index) {
                            <li
                              class="grid grid-cols-[auto_4rem_1fr] items-baseline gap-x-3 px-3 py-1.5 max-md:grid-cols-[auto_1fr]"
                              [qitsEntity]="log"
                              entityKey="epochNanos"
                            >
                              <span
                                class="whitespace-nowrap text-fg-muted"
                                [fieldOf]="log"
                                [qitsField]="{ derived: ['epochNanos'] }"
                                >{{ time(log.epochNanos) }}</span
                              >
                              <ui-chip
                                class="justify-self-start"
                                [label]="log.severityText ?? ''"
                                [tone]="tone(log.severityText)"
                                [fieldOf]="log"
                                [qitsField]="{ derived: ['severityText'] }"
                              />
                              <span
                                class="min-w-0 break-words whitespace-pre-wrap text-fg max-md:col-span-2"
                                [fieldOf]="log"
                                qitsField="body"
                                >{{ log.body }}</span
                              >
                            </li>
                          }
                        </ol>
                      }
                    </div>
                  }
                </li>
              }
            </ol>
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="errorsState() === 'loaded' && groups().length === 0 ? 'block' : 'hidden'"
            >
              No errors are buffered for this source{{
                query().since ? ' in this time range' : ''
              }}: nothing it sent lately failed.
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

  protected readonly sinceMinutes = SINCE_MINUTES;
  protected readonly sinceLabel = sinceLabel;
  protected readonly time = lineTime;
  protected readonly duration = spanDuration;
  protected readonly version = versionOf;
  protected readonly key = groupKey;
  protected readonly marks = MARKS;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the source and the time range. */
  protected readonly query = computed((): ErrorsQuery => ({
    source: this.params()?.get('source') || undefined,
    since: minutesOf(this.params()?.get('since') ?? null),
  }));

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The buffer's sources, in the browser only (the server has no session). */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /** The chosen source's error groups, over the time range; nothing until a source is chosen. */
  protected readonly errors = qitsResource(TELEMETRY_ERRORS, () => {
    const { source, since } = this.query();
    if (!this.browser || !source) return undefined;
    return { query: { source, ...(since ? { sinceMinutes: since } : {}) } };
  });

  protected readonly errorsValue = computed(() =>
    this.errors.hasValue() ? (this.errors.value() ?? {}) : {},
  );

  /** The rows, the uncorrelated group last. */
  protected readonly groups = computed(() => viewErrorGroups(this.errorsValue().groups ?? []));

  protected readonly truncated = computed(() => this.errorsValue().truncated === true);

  protected readonly total = computed(() => this.errorsValue().total ?? this.groups().length);

  protected readonly sourcesState = computed((): LoadState => loadState(this.sources));
  protected readonly errorsState = computed((): LoadState => loadState(this.errors));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.errors));

  /** The expanded rows, by `groupKey`. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  /** A row's Error logs: the Logs page, a declared exit (epic qits-2000). */
  protected readonly opening = outcomes('open-telemetry-error-logs', {
    logs: exit('projects/:slug/observability/logs'),
  });

  /** A correlated group's trace id: the trace's page at the same source (qits-2343). */
  protected readonly tracing = outcomes('open-telemetry-trace', {
    trace: exit('projects/:slug/observability/traces/:traceId'),
  });

  /** Refresh: reads the sources and the shown errors again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sources.reload();
        this.errors.reload();
      },
    },
  ];

  protected isOpen(view: ErrorGroupView): boolean {
    return this.open().has(groupKey(view));
  }

  protected toggle(view: ErrorGroupView): void {
    const key = groupKey(view);
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected counts(view: ErrorGroupView): string {
    return evidenceCounts(view);
  }

  protected latest(view: ErrorGroupView): string {
    return lineTime(view.latestEpochMillis * 1e6);
  }

  protected exception(span: TelemetryErrorSpan): string {
    return exceptionText(firstException([span]));
  }

  protected stacktrace(span: TelemetryErrorSpan): string {
    return attribute(firstException([span]), 'exception.stacktrace');
  }

  protected tone(level: string | undefined): ChipTone {
    return levelTone(level);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value.trim();
  }

  /** Puts `change` into the URL's query, which is what reads the errors again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}

/** The marks of what a row computes from its group (`error-groups.ts`). */
const MARKS = {
  headline: { derived: ['errorSpans', 'errorLogs'] },
  meta: { derived: ['traceId', 'serviceName', 'errorSpans', 'errorLogs'] },
} as const;
