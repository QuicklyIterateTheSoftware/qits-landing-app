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
import type { TelemetryTraceSummary } from '$core/observability/observability.consumes';
import { TELEMETRY_SOURCES, TELEMETRY_TRACES } from '$core/observability/observability.operations';
import { floorText, formatSpanDuration, thresholdLabel } from '$core/observability/slow-spans';
import {
  lineTime,
  minutesOf,
  refused,
  SINCE_MINUTES,
  sinceLabel,
} from '$core/observability/telemetry';
import { viewTraceGroups } from '$core/observability/trace-groups';
import {
  emptyReason,
  sortOf,
  thresholdOf,
  TRACE_THRESHOLDS_MS,
  tracesQuery,
  truncationSentence,
  viewOf,
  type EmptyReason,
  type TracesSort,
  type TracesView,
} from '$core/observability/traces';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { TelemetrySourcePicker } from '$patterns/observability/source-picker/source-picker';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page reads of the URL's query (`?source=&sort=&threshold=&service=&since=&view=`). */
interface TracesPageQuery {
  readonly source: string | undefined;
  readonly sort: TracesSort;
  /** The floor in ms; 0 (absent) is any duration. */
  readonly threshold: number;
  readonly service: string | undefined;
  readonly since: number | undefined;
  /** How the list is drawn; changes no request. */
  readonly view: TracesView;
}

/** The marks of what a group's row computes from its traces (`trace-groups.ts`). */
const MARKS = {
  group: { derived: ['traces'] },
} as const;

/** `1 trace`, `2 traces`. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The Observability section's Traces page, at `/projects/<slug>/observability/traces` (qits-2342,
 * the retired qits-observability-frontend's traces view): one source's buffered traces, each
 * summarised by its root span, newest first, folded into one entry per path.
 *
 * On top, the source picker (`app-telemetry-source-picker`, shared with the section's other
 * pages); the chosen source's key is `?source=`. Below, its traces (`TELEMETRY_TRACES`,
 * `listTelemetryTraces`), read only once a source is chosen. The lenses keep the old frontend's
 * query names, so its bookmarks forward, and each is sent only when it is not the door's default
 * (`traces.ts`), so the default read is the source alone: `?sort=duration` slowest first (absent:
 * newest first); `?threshold=` the floor in ms (0, the default and absent, 10, 100, 500 or 1000;
 * sent as `thresholdMs` above 0); `?service=` the traces any of whose spans is that service's (its
 * options are the chosen source row's services, the select hidden when it lists none); `?since=`
 * minutes → `sinceMinutes`. `?view=flat` draws one row per trace; absent, the rows are grouped by
 * path (`trace-groups.ts`) in the door's order, each group expanding (presentation only, not in the
 * URL) to its traces. `limit` is never sent: the service answers at most its default and says when
 * it left some out (`truncated`, `total`), keeping the newest (or slowest), which the page repeats.
 *
 * A group's row: its path, how many traces, the slowest, the newest start, the services, an
 * "N errored" chip and an exception marker. A trace's row: its duration, its root span's name
 * ("(root not buffered)" when the buffer lost it), an error count chip and an exception marker,
 * its root service, its span count and services, its start (UTC) and its trace id, a link to the
 * trace's page at the same source (`open-telemetry-trace`, qits-2343).
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403) is said as such; any other failure offers Retry. Empty states, in order (`traces.ts`): no
 * source chosen; the source holds no spans; the service is not one of the source's (All services
 * clears it); none reaches the floor (Any duration lowers it); none falls in the time range
 * (Everything buffered clears it). Marks (qits-2141): the picker is the sources read; the trace
 * lists are the traces read, each row a trace by its `traceId`, a group's figures derived from it.
 *
 * Staleness (qits-1270): none, no domain event; Refresh re-reads. No polling.
 */
@Component({
  selector: 'app-observability-traces-page',
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
      <app-page-layout title="Traces" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          What a source has been doing: its traces, each summed up by its root span, newest first
          and grouped by path. The buffer holds only recent records; older ones are gone.
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
        <p
          class="m-0 mt-6 px-3 py-8 text-center text-sm text-fg-muted"
          [class.hidden]="query().source || refusal() || !hasServices()"
          [qitsEntityList]="sources"
          [fieldOf]="sourcesValue()"
          [qitsField]="{ derived: ['sources'] }"
          data-no-source
        >
          Choose a source above to see its traces.
        </p>

        <section class="mt-6" aria-label="Traces" [class.hidden]="!query().source || refusal()">
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Order
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ sort: value($event) === 'duration' ? 'duration' : null })"
              >
                <option value="recent" [selected]="query().sort === 'recent'">Newest first</option>
                <option value="duration" [selected]="query().sort === 'duration'">
                  Slowest first
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Duration
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setThreshold(value($event))"
              >
                @for (ms of thresholds(); track ms) {
                  <option [value]="ms" [selected]="ms === query().threshold">
                    {{ thresholdLabel(ms) }}
                  </option>
                }
              </select>
            </label>
            <label
              class="flex flex-col gap-1 text-xs text-fg-muted"
              [class.hidden]="services().length === 0"
              [qitsEntityList]="sources"
              [fieldOf]="sourcesValue()"
              [qitsField]="{ derived: ['sources'] }"
              data-service
            >
              Service
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ service: value($event) || null })"
              >
                <option value="" [selected]="!query().service">All services</option>
                @for (name of serviceOptions(); track name) {
                  <option [value]="name" [selected]="name === query().service">{{ name }}</option>
                }
              </select>
            </label>
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
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              View
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ view: value($event) === 'flat' ? 'flat' : null })"
              >
                <option value="grouped" [selected]="query().view === 'grouped'">By path</option>
                <option value="flat" [selected]="query().view === 'flat'">One row per trace</option>
              </select>
            </label>
          </div>
          <ui-load-failure
            message="This source’s traces could not be read."
            [class.hidden]="tracesState() !== 'error' || refusal()"
            (retry)="traces.reload()"
          />
          <ui-spinner
            [state]="tracesState()"
            class="min-h-32"
            [class.hidden]="tracesState() === 'error'"
          >
            <p
              class="m-0 mb-2 text-xs text-fg-muted"
              [class.hidden]="!truncated()"
              [qitsEntityList]="traces"
              [fieldOf]="tracesValue()"
              [qitsField]="{ derived: ['traces', 'total', 'truncated'] }"
              data-truncated
            >
              {{ truncation() }}
            </p>
            <ol
              class="m-0 flex list-none flex-col gap-2 p-0"
              aria-label="Paths"
              [class.hidden]="query().view !== 'grouped' || rows().length === 0"
              [qitsEntityList]="traces"
            >
              @if (query().view === 'grouped') {
                @for (group of groups(); track group.key) {
                  <li
                    class="rounded-md border border-line bg-surface text-sm"
                    [attr.aria-label]="group.key"
                    data-group
                  >
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-start gap-2 border-0 bg-transparent px-3 pt-2 text-left text-fg"
                      [attr.aria-expanded]="isOpen(group.key)"
                      (click)="toggle(group.key)"
                      [fieldOf]="tracesValue()"
                      [qitsField]="marks.group"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        class="mt-0.5 size-4 shrink-0 text-fg-muted"
                        [class.-rotate-90]="!isOpen(group.key)"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                      <span
                        class="min-w-0 font-mono font-semibold break-all"
                        [class.italic]="!group.routed"
                        >{{ group.key }}</span
                      >
                    </button>
                    <p
                      class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-1 pb-2 pl-9 text-xs text-fg-muted"
                      [fieldOf]="tracesValue()"
                      [qitsField]="marks.group"
                      data-group-meta
                    >
                      <span class="font-semibold text-fg-soft">{{
                        plural(group.traces.length, 'trace')
                      }}</span>
                      <span aria-hidden="true">·</span>
                      <span>slowest {{ duration(group.maxDurationMs) }}</span>
                      @if (group.latestStartEpochNanos) {
                        <span aria-hidden="true">·</span>
                        <span class="font-mono">{{ time(group.latestStartEpochNanos) }}</span>
                      }
                      <span aria-hidden="true">·</span>
                      <span>{{ group.services.join(', ') || '—' }}</span>
                      @if (group.erroredTraces > 0) {
                        <ui-chip
                          [label]="group.erroredTraces + ' errored'"
                          tone="failed"
                          data-errored
                        />
                      }
                      @if (group.hasException) {
                        <ui-chip label="exception" tone="failed" data-exception />
                      }
                    </p>
                    @if (isOpen(group.key)) {
                      <ol
                        class="m-0 flex list-none flex-col divide-y divide-line border-t border-line p-0"
                        [qitsEntityList]="traces"
                        data-members
                      >
                        @for (trace of group.traces; track trace.traceId) {
                          <li
                            class="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-2"
                            [qitsEntity]="trace"
                            entityKey="traceId"
                            [attr.aria-label]="rootName(trace)"
                            data-trace
                          >
                            <span
                              class="text-right font-mono font-semibold whitespace-nowrap text-fg tabular-nums"
                              [fieldOf]="trace"
                              [qitsField]="{ derived: ['durationMs'] }"
                              data-duration
                              >{{ duration(trace.durationMs) }}</span
                            >
                            <div class="min-w-0">
                              <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span
                                  class="min-w-0 font-mono font-semibold break-all text-fg"
                                  [fieldOf]="trace"
                                  [qitsField]="{ derived: ['rootName'] }"
                                  >{{ trace.rootName || '(unnamed span)' }}</span
                                >
                                @if (trace.rootMissing) {
                                  <span
                                    class="text-xs text-fg-muted italic"
                                    [fieldOf]="trace"
                                    [qitsField]="{ derived: ['rootMissing'] }"
                                    data-root-missing
                                    >(root not buffered)</span
                                  >
                                }
                                @if ((trace.errorSpanCount ?? 0) > 0) {
                                  <ui-chip
                                    [label]="plural(trace.errorSpanCount ?? 0, 'error')"
                                    tone="failed"
                                    [fieldOf]="trace"
                                    [qitsField]="{ derived: ['errorSpanCount'] }"
                                    data-error
                                  />
                                }
                                @if (trace.hasException) {
                                  <ui-chip
                                    label="exception"
                                    tone="failed"
                                    [fieldOf]="trace"
                                    [qitsField]="{ derived: ['hasException'] }"
                                    data-exception
                                  />
                                }
                              </p>
                              <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-soft">
                                <span
                                  class="font-mono"
                                  [fieldOf]="trace"
                                  [qitsField]="{ derived: ['rootService'] }"
                                  >{{ trace.rootService || '—' }}</span
                                >
                                <span aria-hidden="true">·</span>
                                <span [fieldOf]="trace" [qitsField]="{ derived: ['spanCount'] }">{{
                                  plural(trace.spanCount ?? 0, 'span')
                                }}</span>
                                <span aria-hidden="true">·</span>
                                <span [fieldOf]="trace" [qitsField]="{ derived: ['services'] }">{{
                                  (trace.services ?? []).join(', ') || '—'
                                }}</span>
                              </p>
                              <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                                <span
                                  class="font-mono"
                                  [fieldOf]="trace"
                                  [qitsField]="{ derived: ['startEpochNanos'] }"
                                  >{{ time(trace.startEpochNanos) }}</span
                                >
                                <span aria-hidden="true">·</span>
                                @if (trace.traceId) {
                                  <a
                                    class="font-mono break-all text-accent no-underline hover:underline"
                                    [qitsExit]="opening.trace"
                                    [exitParams]="{ slug: slug(), traceId: trace.traceId }"
                                    [exitQueryParams]="{ source: query().source }"
                                    [fieldOf]="trace"
                                    qitsField="traceId"
                                    data-trace-link
                                    >trace {{ trace.traceId }}</a
                                  >
                                }
                              </p>
                            </div>
                          </li>
                        }
                      </ol>
                    }
                  </li>
                }
              }
            </ol>
            <ol
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0 text-sm"
              aria-label="Traces"
              [class.hidden]="query().view !== 'flat' || rows().length === 0"
              [qitsEntityList]="traces"
            >
              @if (query().view === 'flat') {
                @for (trace of rows(); track trace.traceId) {
                  <li
                    class="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-2"
                    [qitsEntity]="trace"
                    entityKey="traceId"
                    [attr.aria-label]="rootName(trace)"
                    data-trace
                  >
                    <span
                      class="text-right font-mono font-semibold whitespace-nowrap text-fg tabular-nums"
                      [fieldOf]="trace"
                      [qitsField]="{ derived: ['durationMs'] }"
                      data-duration
                      >{{ duration(trace.durationMs) }}</span
                    >
                    <div class="min-w-0">
                      <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          class="min-w-0 font-mono font-semibold break-all text-fg"
                          [fieldOf]="trace"
                          [qitsField]="{ derived: ['rootName'] }"
                          >{{ trace.rootName || '(unnamed span)' }}</span
                        >
                        @if (trace.rootMissing) {
                          <span
                            class="text-xs text-fg-muted italic"
                            [fieldOf]="trace"
                            [qitsField]="{ derived: ['rootMissing'] }"
                            data-root-missing
                            >(root not buffered)</span
                          >
                        }
                        @if ((trace.errorSpanCount ?? 0) > 0) {
                          <ui-chip
                            [label]="plural(trace.errorSpanCount ?? 0, 'error')"
                            tone="failed"
                            [fieldOf]="trace"
                            [qitsField]="{ derived: ['errorSpanCount'] }"
                            data-error
                          />
                        }
                        @if (trace.hasException) {
                          <ui-chip
                            label="exception"
                            tone="failed"
                            [fieldOf]="trace"
                            [qitsField]="{ derived: ['hasException'] }"
                            data-exception
                          />
                        }
                      </p>
                      <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-soft">
                        <span
                          class="font-mono"
                          [fieldOf]="trace"
                          [qitsField]="{ derived: ['rootService'] }"
                          >{{ trace.rootService || '—' }}</span
                        >
                        <span aria-hidden="true">·</span>
                        <span [fieldOf]="trace" [qitsField]="{ derived: ['spanCount'] }">{{
                          plural(trace.spanCount ?? 0, 'span')
                        }}</span>
                        <span aria-hidden="true">·</span>
                        <span [fieldOf]="trace" [qitsField]="{ derived: ['services'] }">{{
                          (trace.services ?? []).join(', ') || '—'
                        }}</span>
                      </p>
                      <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                        <span
                          class="font-mono"
                          [fieldOf]="trace"
                          [qitsField]="{ derived: ['startEpochNanos'] }"
                          >{{ time(trace.startEpochNanos) }}</span
                        >
                        <span aria-hidden="true">·</span>
                        @if (trace.traceId) {
                          <a
                            class="font-mono break-all text-accent no-underline hover:underline"
                            [qitsExit]="opening.trace"
                            [exitParams]="{ slug: slug(), traceId: trace.traceId }"
                            [exitQueryParams]="{ source: query().source }"
                            [fieldOf]="trace"
                            qitsField="traceId"
                            data-trace-link
                            >trace {{ trace.traceId }}</a
                          >
                        }
                      </p>
                    </div>
                  </li>
                }
              }
            </ol>
            <div
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="tracesState() === 'loaded' && rows().length === 0 ? 'block' : 'hidden'"
              [attr.data-empty]="empty()"
            >
              @switch (empty()) {
                @case ('no-spans') {
                  <p class="m-0">This source holds no spans: it has sent no traces lately.</p>
                }
                @case ('unknown-service') {
                  <p class="m-0">
                    No service called {{ query().service }} has reported into this source.
                  </p>
                  <button
                    type="button"
                    class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                    (click)="setQuery({ service: null })"
                  >
                    All services
                  </button>
                }
                @case ('below-floor') {
                  <p class="m-0">
                    No trace of this source{{ involving() }} took {{ floor() }} or longer{{
                      query().since ? ' in this time range' : ''
                    }}.
                  </p>
                  <button
                    type="button"
                    class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                    (click)="setQuery({ threshold: null })"
                  >
                    Any duration
                  </button>
                }
                @case ('outside-window') {
                  <p class="m-0">
                    No trace of this source{{ involving() }} falls in this time range.
                  </p>
                  <button
                    type="button"
                    class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                    (click)="setQuery({ since: null })"
                  >
                    Everything buffered
                  </button>
                }
                @default {
                  <p class="m-0">No trace of this source{{ involving() }} is buffered.</p>
                  @if (query().service) {
                    <button
                      type="button"
                      class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                      (click)="setQuery({ service: null })"
                    >
                      All services
                    </button>
                  }
                }
              }
            </div>
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityTracesPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selected = inject(SelectedProject);

  protected readonly thresholdLabel = thresholdLabel;
  protected readonly sinceMinutes = SINCE_MINUTES;
  protected readonly sinceLabel = sinceLabel;
  protected readonly duration = formatSpanDuration;
  protected readonly time = lineTime;
  protected readonly plural = plural;
  protected readonly marks = MARKS;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the source, the order, the floor, the service, the range, the view. */
  protected readonly query = computed(
    (): TracesPageQuery => ({
      source: this.params()?.get('source') || undefined,
      sort: sortOf(this.params()?.get('sort') ?? null),
      threshold: thresholdOf(this.params()?.get('threshold') ?? null),
      service: this.params()?.get('service') || undefined,
      since: minutesOf(this.params()?.get('since') ?? null),
      view: viewOf(this.params()?.get('view') ?? null),
    }),
    {
      equal: (a, b) =>
        a.source === b.source &&
        a.sort === b.sort &&
        a.threshold === b.threshold &&
        a.service === b.service &&
        a.since === b.since &&
        a.view === b.view,
    },
  );

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** A trace's id: the trace's page at the same source, a declared exit (qits-2343). */
  protected readonly opening = outcomes('open-telemetry-trace', {
    trace: exit('projects/:slug/observability/traces/:traceId'),
  });

  /** The buffer's sources, in the browser only (the server has no session). */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /**
   * The chosen source's traces, each lens sent only when it is not the door's default (the
   * default read is the source alone); nothing until a source is chosen. Never `limit`. The view
   * is not a lens of the read.
   */
  protected readonly traces = qitsResource(TELEMETRY_TRACES, () => {
    const { source, sort, threshold, service, since } = this.query();
    if (!this.browser || !source) return undefined;
    return {
      query: tracesQuery({
        source,
        sort,
        thresholdMs: threshold,
        service,
        sinceMinutes: since,
      }),
    };
  });

  protected readonly sourcesValue = computed(() =>
    this.sources.hasValue() ? (this.sources.value() ?? {}) : {},
  );

  protected readonly tracesValue = computed(() =>
    this.traces.hasValue() ? (this.traces.value() ?? {}) : {},
  );

  /** Whether the buffer holds any service to choose (else the picker says nothing is buffered). */
  protected readonly hasServices = computed(() =>
    (this.sourcesValue().sources ?? []).some((source) => source.kind === 'SERVICE'),
  );

  /** The chosen source's row, once the sources are read. */
  private readonly sourceRow = computed(() =>
    (this.sourcesValue().sources ?? []).find((source) => source.key === this.query().source),
  );

  /** The services that reported into the chosen source, from its row; none while it is unknown. */
  protected readonly services = computed((): readonly string[] =>
    (this.sourceRow()?.services ?? []).flatMap((service) => (service.name ? [service.name] : [])),
  );

  /** The service select's options: the row's services, and a chosen one it does not list. */
  protected readonly serviceOptions = computed((): readonly string[] => {
    const service = this.query().service;
    const services = this.services();
    return service && !services.includes(service) ? [...services, service] : services;
  });

  /** The floors offered, and a bookmarked one that is not among them. */
  protected readonly thresholds = computed((): readonly number[] => {
    const threshold = this.query().threshold;
    const offered: readonly number[] = TRACE_THRESHOLDS_MS;
    return offered.includes(threshold) ? offered : [...offered, threshold];
  });

  /** The traces, in the door's order. */
  protected readonly rows = computed(() => this.tracesValue().traces ?? []);

  /** The traces folded into one entry per path, in the door's order (`trace-groups.ts`). */
  protected readonly groups = computed(() => viewTraceGroups(this.rows()));

  /** Which groups are expanded, by key: presentation only, not in the URL. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  protected readonly truncated = computed(() => this.tracesValue().truncated === true);

  /** `Showing the newest N of T matching traces` (`slowest` when sorted by duration). */
  protected readonly truncation = computed(() =>
    truncationSentence(
      this.rows().length,
      this.tracesValue().total ?? this.rows().length,
      this.query().sort,
    ),
  );

  /** The floor as the empty state names it (`500 ms`, `1 s`). */
  protected readonly floor = computed(() => floorText(this.query().threshold));

  /** ` involving <service>` when the service lens is set, for the empty states. */
  protected readonly involving = computed(() => {
    const service = this.query().service;
    return service ? ` involving ${service}` : '';
  });

  /** Why there is no trace to show (`traces.ts`). */
  protected readonly empty = computed((): EmptyReason => {
    const { source, service, threshold, since } = this.query();
    const row = this.sourceRow();
    return emptyReason({
      source,
      sourceSpans: row?.spans,
      service,
      services: row ? this.services() : undefined,
      thresholdMs: threshold,
      sinceMinutes: since,
    });
  });

  protected readonly sourcesState = computed((): LoadState => loadState(this.sources));
  protected readonly tracesState = computed((): LoadState => loadState(this.traces));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.traces));

  /** Refresh: reads the sources and the shown traces again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sources.reload();
        this.traces.reload();
      },
    },
  ];

  protected rootName(trace: TelemetryTraceSummary): string {
    return trace.rootName || '(unnamed span)';
  }

  protected isOpen(key: string): boolean {
    return this.open().has(key);
  }

  protected toggle(key: string): void {
    const open = new Set(this.open());
    if (!open.delete(key)) open.add(key);
    this.open.set(open);
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value.trim();
  }

  /** The floor into the URL: any duration (0) leaves `?threshold=` out. */
  protected setThreshold(value: string): void {
    const ms = thresholdOf(value);
    this.setQuery({ threshold: ms > 0 ? String(ms) : null });
  }

  /** Puts `change` into the URL's query, which is what reads the traces again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}
