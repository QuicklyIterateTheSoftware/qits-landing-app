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
  TELEMETRY_SLOW_SPANS,
  TELEMETRY_SOURCES,
} from '$core/observability/observability.operations';
import {
  callLine,
  DEFAULT_THRESHOLD_MS,
  emptyReason,
  floorText,
  formatSpanDuration,
  hasException,
  sortOf,
  thresholdLabel,
  thresholdOf,
  THRESHOLDS_MS,
  truncationSentence,
  type EmptyReason,
  type SlowSpansSort,
} from '$core/observability/slow-spans';
import {
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
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page reads of the URL's query (`?source=&threshold=&sort=&since=`). */
interface SlowSpansQuery {
  readonly source: string | undefined;
  /** The floor in ms, always sent: `?threshold=` absent is the default, 500. */
  readonly threshold: number;
  readonly sort: SlowSpansSort;
  readonly since: number | undefined;
}

/**
 * The Observability section's Slow spans page, at `/projects/<slug>/observability/slow-spans`
 * (qits-2341, the retired qits-observability-frontend's slow spans view): the spans of one source of
 * qits-observability's telemetry buffer that took at least a floor's time, slowest first.
 *
 * On top, the source picker (`app-telemetry-source-picker`, shared with the Logs, Errors and
 * Metrics pages); the chosen source's key is `?source=`. Below, its spans at or above the floor
 * (`TELEMETRY_SLOW_SPANS`, `listSlowSpans`), read only once a source is chosen. Three lenses, each in
 * the URL: `?threshold=` the floor in ms (500, the default and absent, 1000, 100, 10 or 0, any
 * duration), always sent as `thresholdMs`, so the default read is the source and `thresholdMs=500`
 * alone; `?sort=recent` newest first (sent as `sort=recent`; absent, slowest first, sends no
 * `sort`); `?since=` minutes → `sinceMinutes` (absent: everything buffered). No `limit`, `service`
 * or `name` is ever sent: the service answers at most its default limit and says when it left some
 * out (`truncated`, `total`), keeping the slowest (or newest), which the page repeats.
 *
 * One row per span, in the door's order (`slow-spans.ts`): its duration (ms under a second, else
 * seconds with one decimal), its name and kind, which call it was (`url.full`, else `http.route`),
 * an ERROR chip for an ERROR status and an exception marker when any of its events is one, its
 * start (UTC, like a log line's time), its `service.version` and its trace id, a link to the
 * trace's page at the same source (`open-telemetry-trace`, qits-2343).
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read
 * telemetry) is said as such; any other failure offers Retry. Empty states, in order: no source
 * chosen; the source holds no spans (its source row counts none); none reaches the floor (when there
 * is one: "Any duration" lowers it); none falls in the time range (when one is set: Everything
 * buffered clears it). Marks (qits-2141): the picker is the sources read; the span list is the slow
 * spans read, each row a span by its `spanId`.
 *
 * Staleness (qits-1270): none, no domain event; Refresh re-reads. No polling.
 */
@Component({
  selector: 'app-observability-slow-spans-page',
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
      <app-page-layout title="Slow spans" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          Where a source spends its time: its spans that took at least a chosen duration, slowest
          first. The buffer holds only recent records; older ones are gone.
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
          Choose a source above to see its slow spans.
        </p>

        <section class="mt-6" aria-label="Slow spans" [class.hidden]="!query().source || refusal()">
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Duration
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setThreshold(value($event))"
              >
                @for (ms of thresholds; track ms) {
                  <option [value]="ms" [selected]="ms === query().threshold">
                    {{ thresholdLabel(ms) }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Order
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ sort: value($event) === 'recent' ? 'recent' : null })"
              >
                <option value="duration" [selected]="query().sort === 'duration'">
                  Slowest first
                </option>
                <option value="recent" [selected]="query().sort === 'recent'">Newest first</option>
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
          </div>
          <ui-load-failure
            message="This source’s slow spans could not be read."
            [class.hidden]="spansState() !== 'error' || refusal()"
            (retry)="slowSpans.reload()"
          />
          <ui-spinner
            [state]="spansState()"
            class="min-h-32"
            [class.hidden]="spansState() === 'error'"
          >
            <p
              class="m-0 mb-2 text-xs text-fg-muted"
              [class.hidden]="!truncated()"
              [qitsEntityList]="slowSpans"
              [fieldOf]="spansValue()"
              [qitsField]="{ derived: ['spans', 'total', 'truncated'] }"
              data-truncated
            >
              {{ truncation() }}
            </p>
            <ol
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0"
              [class.hidden]="spans().length === 0"
              [qitsEntityList]="slowSpans"
            >
              @for (span of spans(); track span.spanId) {
                <li
                  class="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-2 text-sm"
                  [qitsEntity]="span"
                  entityKey="spanId"
                  [attr.aria-label]="span.name"
                  data-span
                >
                  <span
                    class="text-right font-mono font-semibold whitespace-nowrap text-fg tabular-nums"
                    [fieldOf]="span"
                    [qitsField]="{ derived: ['durationMs'] }"
                    data-duration
                    >{{ duration(span.durationMs) }}</span
                  >
                  <div class="min-w-0">
                    <p class="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        class="min-w-0 font-mono font-semibold break-all text-fg"
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
                      @if (span.status === 'ERROR') {
                        <ui-chip
                          label="ERROR"
                          tone="failed"
                          [fieldOf]="span"
                          [qitsField]="{ derived: ['status'] }"
                          data-error
                        />
                      }
                      @if (exception(span)) {
                        <ui-chip
                          label="exception"
                          tone="failed"
                          [fieldOf]="span"
                          [qitsField]="{ derived: ['events'] }"
                          data-exception
                        />
                      }
                    </p>
                    <p
                      class="m-0 mt-0.5 font-mono text-xs break-all text-fg-soft"
                      [class.hidden]="!call(span)"
                      [fieldOf]="span"
                      [qitsField]="{ derived: ['attributes'] }"
                      data-call
                    >
                      {{ call(span) }}
                    </p>
                    <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                      <span
                        class="font-mono"
                        [fieldOf]="span"
                        [qitsField]="{ derived: ['startEpochNanos'] }"
                        >{{ time(span.startEpochNanos) }}</span
                      >
                      @if (version(span.resourceAttributes)) {
                        <span aria-hidden="true">·</span>
                        <span
                          class="font-mono"
                          [fieldOf]="span"
                          [qitsField]="{ derived: ['resourceAttributes'] }"
                          >{{ version(span.resourceAttributes) }}</span
                        >
                      }
                      <span aria-hidden="true">·</span>
                      @if (span.traceId) {
                        <a
                          class="font-mono break-all text-accent no-underline hover:underline"
                          [qitsExit]="opening.trace"
                          [exitParams]="{ slug: slug(), traceId: span.traceId }"
                          [exitQueryParams]="{ source: query().source }"
                          [fieldOf]="span"
                          qitsField="traceId"
                          data-trace
                          >trace {{ span.traceId }}</a
                        >
                      } @else {
                        <span class="font-mono">no trace</span>
                      }
                    </p>
                  </div>
                </li>
              }
            </ol>
            <div
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="spansState() === 'loaded' && spans().length === 0 ? 'block' : 'hidden'"
              [attr.data-empty]="empty()"
            >
              @switch (empty()) {
                @case ('no-spans') {
                  <p class="m-0">This source holds no spans: it has sent no traces lately.</p>
                }
                @case ('below-floor') {
                  <p class="m-0">
                    No span of this source took {{ floor() }} or longer{{
                      query().since ? ' in this time range' : ''
                    }}.
                  </p>
                  <button
                    type="button"
                    class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                    (click)="setQuery({ threshold: '0' })"
                  >
                    Any duration
                  </button>
                }
                @case ('outside-window') {
                  <p class="m-0">No span of this source falls in this time range.</p>
                  <button
                    type="button"
                    class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent hover:underline"
                    (click)="setQuery({ since: null })"
                  >
                    Everything buffered
                  </button>
                }
                @default {
                  <p class="m-0">No span of this source is buffered.</p>
                }
              }
            </div>
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilitySlowSpansPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly selected = inject(SelectedProject);

  protected readonly thresholds = THRESHOLDS_MS;
  protected readonly thresholdLabel = thresholdLabel;
  protected readonly sinceMinutes = SINCE_MINUTES;
  protected readonly sinceLabel = sinceLabel;
  protected readonly duration = formatSpanDuration;
  protected readonly time = lineTime;
  protected readonly version = versionOf;
  protected readonly call = callLine;
  protected readonly exception = hasException;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the source, the floor, the order and the time range. */
  protected readonly query = computed(
    (): SlowSpansQuery => ({
      source: this.params()?.get('source') || undefined,
      threshold: thresholdOf(this.params()?.get('threshold') ?? null),
      sort: sortOf(this.params()?.get('sort') ?? null),
      since: minutesOf(this.params()?.get('since') ?? null),
    }),
    {
      equal: (a, b) =>
        a.source === b.source &&
        a.threshold === b.threshold &&
        a.sort === b.sort &&
        a.since === b.since,
    },
  );

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** A span's trace id: the trace's page at the same source, a declared exit (qits-2343). */
  protected readonly opening = outcomes('open-telemetry-trace', {
    trace: exit('projects/:slug/observability/traces/:traceId'),
  });

  /** The buffer's sources, in the browser only (the server has no session). */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /**
   * The chosen source's spans at or above the floor (always sent), newest first only when asked,
   * over the time range; nothing until a source is chosen. Never `limit`, `service` or `name`.
   */
  protected readonly slowSpans = qitsResource(TELEMETRY_SLOW_SPANS, () => {
    const { source, threshold, sort, since } = this.query();
    if (!this.browser || !source) return undefined;
    return {
      query: {
        source,
        thresholdMs: threshold,
        ...(sort === 'recent' ? { sort } : {}),
        ...(since ? { sinceMinutes: since } : {}),
      },
    };
  });

  protected readonly sourcesValue = computed(() =>
    this.sources.hasValue() ? (this.sources.value() ?? {}) : {},
  );

  protected readonly spansValue = computed(() =>
    this.slowSpans.hasValue() ? (this.slowSpans.value() ?? {}) : {},
  );

  /** Whether the buffer holds any service to choose (else the picker says nothing is buffered). */
  protected readonly hasServices = computed(() =>
    (this.sourcesValue().sources ?? []).some((source) => source.kind === 'SERVICE'),
  );

  /** The rows, in the door's order. */
  protected readonly spans = computed(() => this.spansValue().spans ?? []);

  protected readonly truncated = computed(() => this.spansValue().truncated === true);

  /** `Showing the slowest N of T matching spans` (`newest` when sorted by recency). */
  protected readonly truncation = computed(() =>
    truncationSentence(
      this.spans().length,
      this.spansValue().total ?? this.spans().length,
      this.query().sort,
    ),
  );

  /** The floor as the empty state names it (`500 ms`, `1 s`). */
  protected readonly floor = computed(() => floorText(this.query().threshold));

  /** Why an empty answer is empty: the source row's span count, then the floor, then the range. */
  protected readonly empty = computed((): EmptyReason => {
    const { source, threshold, since } = this.query();
    const row = (this.sourcesValue().sources ?? []).find((s) => s.key === source);
    return emptyReason({ sourceSpans: row?.spans, thresholdMs: threshold, sinceMinutes: since });
  });

  protected readonly sourcesState = computed((): LoadState => loadState(this.sources));
  protected readonly spansState = computed((): LoadState => loadState(this.slowSpans));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.slowSpans));

  /** Refresh: reads the sources and the shown spans again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sources.reload();
        this.slowSpans.reload();
      },
    },
  ];

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value.trim();
  }

  /** The floor into the URL: the default leaves `?threshold=` out. */
  protected setThreshold(value: string): void {
    const ms = thresholdOf(value);
    this.setQuery({ threshold: ms === DEFAULT_THRESHOLD_MS ? null : String(ms) });
  }

  /** Puts `change` into the URL's query, which is what reads the slow spans again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}
