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
import type {
  TelemetryTraceLog,
  TelemetryTraceSpan,
} from '$core/observability/observability.consumes';
import { TELEMETRY_STORE, TELEMETRY_TRACE } from '$core/observability/observability.operations';
import { levelTone, lineTime, refused, versionOf } from '$core/observability/telemetry';
import {
  EMPTY_WATERFALL,
  indentLevels,
  layOutTrace,
  traceDuration,
  traceOffset,
  traceSummary,
  type WaterfallRow,
} from '$core/observability/trace-layout';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** A record's attribute: its key and its value. */
type Pair = readonly [key: string, value: string];

/** An event of a span, as the detail shows it. */
type SpanEvent = NonNullable<TelemetryTraceSpan['events']>[number];

/** `attributes` as pairs, in the order the service gave them: a template cannot iterate a record. */
function pairsOf(attributes: Readonly<Record<string, unknown>> | undefined): readonly Pair[] {
  return Object.entries(attributes ?? {}).map(([key, value]): Pair => [key, String(value)]);
}

/** An event's attribute `key`, or empty. */
function eventAttribute(event: SpanEvent, key: string): string {
  const value = event.attributes?.[key];
  return value === undefined || value === null ? '' : String(value);
}

/**
 * The Observability section's trace page, at
 * `/projects/<slug>/observability/traces/<traceId>?source=<key>` (qits-2343, the retired
 * qits-observability-frontend's `traces/:traceId`): one trace of one source of qits-observability's
 * telemetry buffer, whole. A detail page with no sidebar entry (the sidebar keeps Observability
 * current); a trace id on the Traces, Errors and Logs pages leads here (`open-telemetry-trace`).
 * Its Logs links open the Logs page narrowed to this trace id, every source merged
 * (`open-telemetry-trace-logs`, qits-2535).
 *
 * One read, `TELEMETRY_TRACE` (`getTelemetryTrace`), by the path's trace id and `?source=` alone
 * (never `repositoryId` or `workspaceId`), in the browser only (the server has no session), through
 * `qitsResource`. Without a source there is no read at all: a sourceless read answers an empty
 * trace, which would look exactly like an evicted one; the page says so and points to the Traces
 * page (`open-telemetry-traces`, qits-2536), where a source is chosen. An unknown or evicted trace
 * is a 200 with no spans, never a 404: the page says no span of it is buffered in this source, and
 * reads `TELEMETRY_STORE` (`getTelemetryStore`) then, and only then, to add that it may have been
 * evicted when the buffer has evicted spans (`evictedSpans > 0`).
 *
 * Header: the trace id (monospace), the source, and `core/observability/trace-layout.ts`'s summary
 * (spans, services, total duration, error spans). The waterfall is `layOutTrace` (ported from the
 * old `trace-layout.ts`): spans nested by parent, siblings by start, a span whose parent is not
 * buffered at the top level and marked "parent not buffered", every span drawn once even in a
 * cycle, the indent capped at 12 levels, a bar per span as percentages of the trace's window, an
 * ERROR chip, an exception chip and its correlated log count; a banner when the root is not
 * buffered. Selecting a row (`?span=<spanId>`, written with `replaceUrl`, so Refresh keeps it; the
 * first row when none is chosen) shows the span's detail: ids, service, kind, duration, start (UTC,
 * `lineTime`) and offset, status and its message, scope, `service.version`, attributes, resource
 * attributes and events (an exception's type, message and stack trace, else the event's
 * attributes). Below, the correlated logs, oldest first: level, offset, body and the span it was
 * written in ("its span is not buffered" otherwise).
 *
 * A refusal (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may
 * read telemetry) is said as such; any other failure offers Retry. Marks (qits-2141): the waterfall,
 * the detail and the logs are the trace read, each span by its `spanId`, each log by its
 * `epochNanos`; the eviction hint is the store read.
 *
 * Staleness (qits-1270): none, no domain event follows the buffer; Refresh re-reads. No polling.
 */
@Component({
  selector: 'app-observability-trace-page',
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
      <app-page-layout title="Trace" [actions]="actions">
        <dl class="m-0 mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt class="text-fg-muted">Trace</dt>
          <dd class="m-0 font-mono break-all text-fg" data-trace-id>{{ traceId() }}</dd>
          <dt class="text-fg-muted">Source</dt>
          <dd class="m-0 font-mono break-all text-fg" data-source>{{ source() || '—' }}</dd>
          <dt class="text-fg-muted">Logs</dt>
          <dd class="m-0">
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="logging.logs"
              [exitParams]="{ slug: slug() }"
              [exitQueryParams]="{ traceId: traceId() }"
              data-trace-logs
              >This trace’s lines on the Logs page</a
            >
          </dd>
          <dt class="text-fg-muted" [class.hidden]="rows().length === 0">Spans</dt>
          <dd
            class="m-0 text-fg"
            [class.hidden]="rows().length === 0"
            [qitsEntityList]="trace"
            [fieldOf]="traceValue()"
            [qitsField]="{ derived: ['trace.spans'] }"
            data-summary
          >
            {{ summary() }}
          </dd>
        </dl>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading telemetry needs qits:admin.
        </p>
        <div
          class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
          [class.hidden]="!!source()"
          data-no-source
        >
          <p class="m-0">
            No source is chosen, so this trace is not read: a trace is read within one source of the
            buffer.
          </p>
          <a
            class="mt-2 inline-block text-accent no-underline hover:underline"
            [qitsExit]="opening.traces"
            [exitParams]="{ slug: slug() }"
            >Choose a source on the Traces page</a
          >
        </div>

        <div [class.hidden]="!source() || refusal()">
          <ui-load-failure
            message="This trace could not be read."
            [class.hidden]="traceState() !== 'error' || refusal()"
            (retry)="trace.reload()"
          />
          <ui-spinner
            [state]="traceState()"
            class="min-h-32"
            [class.hidden]="traceState() === 'error'"
          >
            <div
              class="px-3 py-8 text-center text-sm text-fg-muted"
              [class]="traceState() === 'loaded' && rows().length === 0 ? 'block' : 'hidden'"
              [qitsEntityList]="trace"
              [fieldOf]="traceValue()"
              [qitsField]="{ derived: ['trace.spans'] }"
              data-empty
            >
              <p class="m-0">No spans of this trace are buffered in this source.</p>
              <p
                class="m-0 mt-1"
                [class.hidden]="!evicted()"
                [qitsEntityList]="store"
                [fieldOf]="storeValue()"
                [qitsField]="{ derived: ['evictedSpans'] }"
                data-evicted
              >
                It may have been evicted: this buffer has dropped spans at its cap. The id may also
                be wrong, or the trace may belong to another source.
              </p>
            </div>

            <div [class.hidden]="rows().length === 0">
              <p
                class="m-0 mb-4 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-strong"
                [class.hidden]="!layout().rootMissing"
                [qitsEntityList]="trace"
                [fieldOf]="traceValue()"
                [qitsField]="{ derived: ['trace.spans'] }"
                data-root-missing
              >
                The root of this trace is not buffered: no span here lacks a parent, so the top row
                is the earliest span that survived, not the call that began the work.
              </p>

              <section aria-label="Waterfall">
                <h2 class="mt-0 mb-2 text-base font-semibold">Waterfall</h2>
                <ol
                  class="m-0 list-none divide-y divide-line overflow-hidden rounded-md border border-line p-0"
                  [qitsEntityList]="trace"
                >
                  @for (row of rows(); track row.span.spanId) {
                    @let span = row.span;
                    <li
                      [class.bg-accent-soft]="isSelected(row)"
                      [qitsEntity]="span"
                      entityKey="spanId"
                      data-span
                    >
                      <button
                        type="button"
                        class="grid w-full cursor-pointer grid-cols-[minmax(0,22rem)_minmax(6rem,1fr)_5rem] items-center gap-3 border-0 bg-transparent px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-subtle max-md:grid-cols-[minmax(0,1fr)_5rem]"
                        [attr.aria-pressed]="isSelected(row)"
                        [attr.aria-label]="span.name || '(unnamed span)'"
                        (click)="select(row)"
                      >
                        <span
                          class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
                          [style.padding-left.rem]="indent(row.depth)"
                        >
                          <span
                            class="min-w-0 font-mono font-semibold break-all"
                            [fieldOf]="span"
                            qitsField="name"
                            >{{ span.name || '(unnamed span)' }}</span
                          >
                          <span
                            class="font-mono text-xs text-fg-muted"
                            [fieldOf]="span"
                            qitsField="serviceName"
                            >{{ span.serviceName }}</span
                          >
                          @if (row.isError) {
                            <ui-chip
                              label="ERROR"
                              tone="failed"
                              [fieldOf]="span"
                              [qitsField]="{ derived: ['status'] }"
                              data-error
                            />
                          }
                          @if (row.hasException) {
                            <ui-chip
                              label="exception"
                              tone="failed"
                              [fieldOf]="span"
                              [qitsField]="{ derived: ['events'] }"
                              data-exception
                            />
                          }
                          @if (row.logCount > 0) {
                            <span
                              class="rounded-sm bg-surface-muted px-1 text-xs text-fg-soft"
                              [fieldOf]="span"
                              [qitsField]="{ derived: ['spanId'] }"
                              data-log-count
                              >{{ logCountText(row) }}</span
                            >
                          }
                          @if (row.parentMissing) {
                            <span
                              class="text-xs text-fg-muted italic"
                              [fieldOf]="span"
                              [qitsField]="{ derived: ['parentSpanId'] }"
                              data-parent-missing
                              >parent not buffered</span
                            >
                          }
                        </span>
                        <span
                          class="relative block h-4 rounded-sm bg-surface-muted max-md:hidden"
                          aria-hidden="true"
                          [fieldOf]="span"
                          [qitsField]="{ derived: ['startEpochNanos', 'durationMs'] }"
                        >
                          <span
                            class="absolute inset-y-0 block min-w-0.5 rounded-sm"
                            [class]="row.isError ? 'bg-danger' : 'bg-accent'"
                            [style.left.%]="row.leftPercent"
                            [style.width.%]="row.widthPercent"
                          ></span>
                        </span>
                        <span
                          class="text-right font-mono whitespace-nowrap tabular-nums"
                          [fieldOf]="span"
                          [qitsField]="{ derived: ['durationMs'] }"
                          data-duration
                          >{{ duration(span.durationMs) }}</span
                        >
                      </button>
                    </li>
                  }
                </ol>
              </section>

              @if (selected(); as row) {
                @let span = row.span;
                <section
                  class="mt-6 rounded-md border border-line p-4"
                  aria-label="Span detail"
                  [qitsEntity]="span"
                  entityKey="spanId"
                  [entitySource]="trace"
                >
                  <h2 class="m-0 mb-3 font-mono text-base font-semibold break-all">
                    <span [fieldOf]="span" qitsField="name">{{
                      span.name || '(unnamed span)'
                    }}</span>
                  </h2>
                  <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                    <dt class="text-fg-muted">Span</dt>
                    <dd class="m-0 font-mono break-all" [fieldOf]="span" qitsField="spanId">
                      {{ span.spanId }}
                    </dd>
                    <dt class="text-fg-muted">Parent</dt>
                    <dd class="m-0 font-mono break-all" [fieldOf]="span" qitsField="parentSpanId">
                      {{ span.parentSpanId || '— (a root)' }}
                      @if (row.parentMissing) {
                        <span class="font-sans text-xs text-fg-muted italic">not buffered</span>
                      }
                    </dd>
                    <dt class="text-fg-muted">Service</dt>
                    <dd class="m-0 font-mono" [fieldOf]="span" qitsField="serviceName">
                      {{ span.serviceName || '—' }}
                    </dd>
                    <dt class="text-fg-muted">Kind</dt>
                    <dd class="m-0" [fieldOf]="span" qitsField="kind">
                      {{ span.kind || '—' }}
                    </dd>
                    <dt class="text-fg-muted">Duration</dt>
                    <dd
                      class="m-0 font-mono"
                      [fieldOf]="span"
                      [qitsField]="{ derived: ['durationMs'] }"
                    >
                      {{ duration(span.durationMs) }}
                    </dd>
                    <dt class="text-fg-muted">Start</dt>
                    <dd
                      class="m-0 font-mono"
                      [fieldOf]="span"
                      [qitsField]="{ derived: ['startEpochNanos'] }"
                      data-start
                    >
                      {{ time(span.startEpochNanos) }} · {{ offset(span.startEpochNanos) }}
                    </dd>
                    <dt class="text-fg-muted">Status</dt>
                    <dd class="m-0 flex flex-wrap items-baseline gap-2">
                      <ui-chip
                        [label]="span.status || 'UNSET'"
                        [tone]="row.isError ? 'failed' : 'neutral'"
                        [fieldOf]="span"
                        [qitsField]="{ derived: ['status'] }"
                      />
                      <span
                        [class.hidden]="!span.statusMessage"
                        [fieldOf]="span"
                        qitsField="statusMessage"
                        data-status-message
                        >{{ span.statusMessage }}</span
                      >
                    </dd>
                    <dt class="text-fg-muted">Scope</dt>
                    <dd class="m-0 font-mono break-all" [fieldOf]="span" qitsField="scopeName">
                      {{ span.scopeName || '—' }}
                    </dd>
                    <dt class="text-fg-muted">Version</dt>
                    <dd
                      class="m-0 font-mono"
                      [fieldOf]="span"
                      [qitsField]="{ derived: ['resourceAttributes'] }"
                    >
                      {{ version(span.resourceAttributes) || '—' }}
                    </dd>
                  </dl>

                  <h3 class="mt-4 mb-1 text-sm font-semibold">Attributes</h3>
                  <dl
                    class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 font-mono text-xs"
                    [fieldOf]="span"
                    [qitsField]="{ derived: ['attributes'] }"
                    data-attributes
                  >
                    @for (pair of pairs(span.attributes); track pair[0]) {
                      <dt class="text-fg-muted">{{ pair[0] }}</dt>
                      <dd class="m-0 break-all text-fg">{{ pair[1] }}</dd>
                    } @empty {
                      <dd class="col-span-2 m-0 font-sans text-fg-muted">
                        This span carries none.
                      </dd>
                    }
                  </dl>

                  <h3 class="mt-4 mb-1 text-sm font-semibold">Resource attributes</h3>
                  <dl
                    class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 font-mono text-xs"
                    [fieldOf]="span"
                    [qitsField]="{ derived: ['resourceAttributes'] }"
                    data-resource-attributes
                  >
                    @for (pair of pairs(span.resourceAttributes); track pair[0]) {
                      <dt class="text-fg-muted">{{ pair[0] }}</dt>
                      <dd class="m-0 break-all text-fg">{{ pair[1] }}</dd>
                    } @empty {
                      <dd class="col-span-2 m-0 font-sans text-fg-muted">The process sent none.</dd>
                    }
                  </dl>

                  <h3 class="mt-4 mb-1 text-sm font-semibold">Events</h3>
                  <ul
                    class="m-0 flex list-none flex-col gap-2 p-0 text-sm"
                    [fieldOf]="span"
                    [qitsField]="{ derived: ['events'] }"
                    data-events
                  >
                    @for (event of span.events ?? []; track $index) {
                      <li
                        class="rounded-md border border-line px-3 py-2"
                        [qitsEntity]="event"
                        entityKey="epochNanos"
                        data-event
                      >
                        <p class="m-0 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                          <span class="font-semibold text-fg" [fieldOf]="event" qitsField="name">{{
                            event.name
                          }}</span>
                          <span
                            class="font-mono"
                            [fieldOf]="event"
                            [qitsField]="{ derived: ['epochNanos'] }"
                            >{{ time(event.epochNanos) }} · {{ offset(event.epochNanos) }}</span
                          >
                        </p>
                        @if (event.exception) {
                          <p
                            class="m-0 mt-1 font-semibold break-words text-fg"
                            [fieldOf]="event"
                            [qitsField]="{ derived: ['attributes'] }"
                            data-exception-line
                          >
                            {{ exceptionLine(event) }}
                          </p>
                          @if (attribute(event, 'exception.stacktrace')) {
                            <pre
                              class="m-0 mt-1 overflow-x-auto rounded-md border border-line bg-surface-muted px-2 py-1 font-mono text-xs whitespace-pre text-fg"
                              [fieldOf]="event"
                              [qitsField]="{ derived: ['attributes'] }"
                              >{{ attribute(event, 'exception.stacktrace') }}</pre>
                          } @else {
                            <p class="m-0 mt-1 text-xs text-fg-muted">
                              No stack trace was exported with this exception.
                            </p>
                          }
                        } @else {
                          <dl
                            class="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 font-mono text-xs"
                            [fieldOf]="event"
                            [qitsField]="{ derived: ['attributes'] }"
                          >
                            @for (pair of pairs(event.attributes); track pair[0]) {
                              <dt class="text-fg-muted">{{ pair[0] }}</dt>
                              <dd class="m-0 break-all text-fg">{{ pair[1] }}</dd>
                            }
                          </dl>
                        }
                      </li>
                    } @empty {
                      <li class="text-fg-muted">This span recorded no events.</li>
                    }
                  </ul>
                </section>
              }

              <section class="mt-6" aria-label="Correlated logs">
                <h2 class="mt-0 mb-2 flex flex-wrap items-baseline gap-x-3 text-base font-semibold">
                  Correlated logs
                  <a
                    class="text-sm font-normal text-accent no-underline hover:underline"
                    [qitsExit]="logging.logs"
                    [exitParams]="{ slug: slug() }"
                    [exitQueryParams]="{ traceId: traceId() }"
                    >Every service’s lines on the Logs page</a
                  >
                </h2>
                <p class="m-0 text-sm text-fg-muted" [class.hidden]="logs().length > 0">
                  No log line names this trace.
                </p>
                <ol
                  class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0 font-mono text-xs"
                  [class.hidden]="logs().length === 0"
                  [qitsEntityList]="trace"
                >
                  @for (log of logs(); track $index) {
                    <li
                      class="grid grid-cols-[auto_5rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-1.5 max-md:grid-cols-[auto_1fr]"
                      [qitsEntity]="log"
                      entityKey="epochNanos"
                      data-log
                    >
                      <ui-chip
                        class="justify-self-start"
                        [label]="log.severityText || '—'"
                        [tone]="tone(log.severityText)"
                        [fieldOf]="log"
                        [qitsField]="{ derived: ['severityText'] }"
                      />
                      <span
                        class="text-right whitespace-nowrap text-fg-muted tabular-nums max-md:text-left"
                        [fieldOf]="log"
                        [qitsField]="{ derived: ['epochNanos'] }"
                        >{{ offset(log.epochNanos) }}</span
                      >
                      <span class="min-w-0 max-md:col-span-2">
                        <span
                          class="break-words whitespace-pre-wrap text-fg"
                          [fieldOf]="log"
                          qitsField="body"
                          >{{ log.body }}</span
                        >
                        @if (log.spanId) {
                          <span
                            class="ml-2 font-sans text-fg-muted"
                            [class.italic]="!spanName(log)"
                            [fieldOf]="log"
                            [qitsField]="{ derived: ['spanId'] }"
                            data-log-span
                            >{{
                              spanName(log) ? 'in ' + spanName(log) : 'its span is not buffered'
                            }}</span
                          >
                        }
                      </span>
                    </li>
                  }
                </ol>
              </section>
            </div>
          </ui-spinner>
        </div>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityTracePage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selectedProject = inject(SelectedProject);

  protected readonly duration = traceDuration;
  protected readonly time = lineTime;
  protected readonly version = versionOf;
  protected readonly pairs = pairsOf;
  protected readonly attribute = eventAttribute;

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The trace id, from the path. */
  protected readonly traceId = computed(() => this.paramMap().get('traceId') ?? '');

  /** The source key (`?source=`); without one, nothing is read. */
  protected readonly source = computed(() => this.queryMap().get('source') || undefined);

  /** The chosen span (`?span=`), when any. */
  private readonly chosen = computed(() => this.queryMap().get('span') || undefined);

  protected readonly slug = computed(() => this.selectedProject.slug() ?? '');

  /** The trace, by its id and the source alone; nothing without a source, nothing on the server. */
  protected readonly trace = qitsResource(TELEMETRY_TRACE, () => {
    const traceId = this.traceId();
    const source = this.source();
    if (!this.browser || !traceId || !source) return undefined;
    return { path: { traceId }, query: { source } };
  });

  protected readonly traceValue = computed(() =>
    this.trace.hasValue() ? (this.trace.value() ?? {}) : {},
  );

  protected readonly traceState = computed((): LoadState => loadState(this.trace));

  /** Whether the trace answered, with no span of it buffered. */
  private readonly answeredEmpty = computed(
    () => this.traceState() === 'loaded' && (this.traceValue().trace?.spans ?? []).length === 0,
  );

  /** The buffer's own state, read only after an empty answer, for whether it ever evicted spans. */
  protected readonly store = qitsResource(TELEMETRY_STORE, () =>
    this.browser && this.answeredEmpty() ? {} : undefined,
  );

  protected readonly storeValue = computed(() =>
    this.store.hasValue() ? (this.store.value() ?? {}) : {},
  );

  /** Whether the buffer has evicted spans, so an empty answer may be an evicted trace. */
  protected readonly evicted = computed(() => (this.storeValue().evictedSpans ?? 0) > 0);

  /** The waterfall: nesting, percentages and markers, from one pure function over the answer. */
  protected readonly layout = computed(() => {
    const trace = this.traceValue().trace;
    return trace?.spans?.length ? layOutTrace(trace.spans, trace.logs ?? []) : EMPTY_WATERFALL;
  });

  protected readonly rows = computed(() => this.layout().rows);

  protected readonly summary = computed(() => traceSummary(this.layout()));

  /** The span the detail shows: the chosen one, else the first row. */
  protected readonly selected = computed((): WaterfallRow | undefined => {
    const rows = this.rows();
    const chosen = this.chosen();
    return rows.find((row) => row.span.spanId === chosen) ?? rows[0];
  });

  /** The correlated logs, oldest first. */
  protected readonly logs = computed((): readonly TelemetryTraceLog[] =>
    [...(this.traceValue().trace?.logs ?? [])].sort(
      (left, right) => (left.epochNanos ?? 0) - (right.epochNanos ?? 0),
    ),
  );

  /** The spans' names by id, for the log lines. */
  private readonly names = computed(
    () =>
      new Map(this.rows().map((row) => [row.span.spanId ?? '', row.span.name || '(unnamed span)'])),
  );

  /** Whether the trace read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.trace) || refused(this.store));

  /** Without a source: the Traces page, where a source is chosen (a declared exit, qits-2536). */
  protected readonly opening = outcomes('open-telemetry-traces', {
    traces: exit('projects/:slug/observability/traces'),
  });

  /**
   * The trace's log lines on the Logs page (qits-2535): every source merged, narrowed to this trace
   * id, so a trace that crossed services shows all its lines.
   */
  protected readonly logging = outcomes('open-telemetry-trace-logs', {
    logs: exit('projects/:slug/observability/logs'),
  });

  /** Refresh: reads the trace again (and the store, when it was read); the selection stays. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.trace.reload();
        if (this.answeredEmpty()) this.store.reload();
      },
    },
  ];

  /** A row's correlated log count: `1 log`, `2 logs`. */
  protected logCountText(row: WaterfallRow): string {
    return `${row.logCount} ${row.logCount === 1 ? 'log' : 'logs'}`;
  }

  protected isSelected(row: WaterfallRow): boolean {
    return this.selected()?.span.spanId === row.span.spanId;
  }

  /** Chooses `row`'s span: `?span=` in the URL, replacing the entry (no read follows). */
  protected select(row: WaterfallRow): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { span: row.span.spanId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** A row's indent in rem: 0.9 per level, at most 12 levels. */
  protected indent(depth: number): number {
    return indentLevels(depth) * 0.9;
  }

  protected offset(epochNanos: number | undefined): string {
    return traceOffset(epochNanos, this.layout().startEpochNanos);
  }

  /** The span a log line was written in, by name; empty when that span is not buffered. */
  protected spanName(log: TelemetryTraceLog): string {
    return this.names().get(log.spanId ?? '') ?? '';
  }

  /** An exception event's `type: message` (either alone when the other is missing). */
  protected exceptionLine(event: SpanEvent): string {
    const type = eventAttribute(event, 'exception.type');
    const message = eventAttribute(event, 'exception.message');
    return type && message ? `${type}: ${message}` : type || message || '(no type or message)';
  }

  protected tone(level: string | undefined): ChipTone {
    return levelTone(level);
  }
}
