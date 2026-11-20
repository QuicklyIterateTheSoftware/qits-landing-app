import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import {
  metricCards,
  newestEpochNanos,
  seriesCount,
  type MetricCard,
} from '$core/observability/metric-series';
import { TELEMETRY_METRICS, TELEMETRY_SOURCES } from '$core/observability/observability.operations';
import { lineTime, refused } from '$core/observability/telemetry';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { TelemetrySourcePicker } from '$patterns/observability/source-picker/source-picker';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** What the page reads of the URL's query (`?source=&name=`, the old frontend's names). */
interface MetricsQuery {
  readonly source: string | undefined;
  readonly name: string | undefined;
}

/**
 * The Observability section's Metrics page, at `/projects/<slug>/observability/metrics`
 * (qits-2340, the retired qits-observability-frontend's `metrics`): the latest value of each metric
 * series one source of qits-observability's telemetry buffer holds.
 *
 * On top, the source picker (`app-telemetry-source-picker`, shared with the Logs and Errors pages);
 * the chosen source's key is `?source=`. Below, its series (`TELEMETRY_METRICS`,
 * `listTelemetryMetrics`, by `source` alone), read only once a source is chosen. The buffer keeps
 * one point per series, the latest, and no history, so the page says so and charts nothing over
 * time; it gathers no points across reads either.
 *
 * One card per metric name, sorted by name (`metric-series.ts`, ported from the old
 * `metric-series.ts`): the name, its type (shown only: memory arrives as COUNTER, so nothing is
 * drawn by it), its unit with a gloss, its description and when its newest point was stamped. A
 * name with two or more series is a bar per series, sorted by the series key (`name|k=v|k=v`),
 * labelled by its attributes and its value, its length the value over the card's largest; the
 * series are never summed (`jvm.thread.count`'s attribute sets overlap). A name with one series is
 * its value as one large figure. Values are drawn for their unit (`By` in binary units, integers
 * as integers, six significant digits, exponential under 1e-4). `?name=` narrows the cards to the
 * names holding it, in any case, in the browser: the door's own `name` is an exact, case-sensitive
 * match and is never sent.
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read
 * telemetry) is said as such; any other failure offers Retry. Empty states, in order: no source
 * chosen, no series in this source, no name matching the filter. Marks (qits-2141): the picker is
 * the sources read; the card list is the metrics read, each card and each bar a series by its
 * `name`.
 *
 * Staleness (qits-1270): none, no domain event; Refresh re-reads.
 */
@Component({
  selector: 'app-observability-metrics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsField,
    Spinner,
    TelemetrySourcePicker,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Metrics" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The latest value of each metric series a source reported. The buffer keeps only the latest
          value per series, so there is no history to chart.
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
          Choose a source above to see its metrics.
        </p>

        <section class="mt-6" aria-label="Metrics" [class.hidden]="!query().source || refusal()">
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Name contains
              <input
                class="h-8 w-64 max-w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                type="search"
                [value]="query().name ?? ''"
                (change)="setQuery({ name: value($event) || null })"
              />
            </label>
          </div>
          <ui-load-failure
            message="This source’s metrics could not be read."
            [class.hidden]="metricsState() !== 'error' || refusal()"
            (retry)="metrics.reload()"
          />
          <ui-spinner
            [state]="metricsState()"
            class="min-h-32"
            [class.hidden]="metricsState() === 'error'"
          >
            <p
              class="m-0 mb-2 text-xs text-fg-muted"
              [class.hidden]="cards().length === 0"
              [qitsEntityList]="metrics"
              [fieldOf]="metricsValue()"
              [qitsField]="{ derived: ['metrics'] }"
              data-as-of
            >
              {{ summary() }}
            </p>
            <ol
              class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 p-0"
              [class.hidden]="cards().length === 0"
              [qitsEntityList]="metrics"
            >
              @for (card of cards(); track card.name) {
                <li
                  class="flex flex-col rounded-md border border-line bg-surface px-3 py-2 text-sm"
                  [qitsEntity]="card.series[0].point"
                  entityKey="name"
                  [attr.aria-label]="card.name"
                >
                  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3
                      class="m-0 min-w-0 font-mono text-sm font-semibold break-all text-fg"
                      [fieldOf]="card.series[0].point"
                      qitsField="name"
                    >
                      {{ card.name }}
                    </h3>
                    <ui-chip
                      [label]="card.type || 'UNSPECIFIED'"
                      tone="neutral"
                      [fieldOf]="card.series[0].point"
                      [qitsField]="{ derived: ['type'] }"
                    />
                  </div>
                  <p
                    class="m-0 mt-0.5 text-xs text-fg-muted"
                    [fieldOf]="card.series[0].point"
                    [qitsField]="{ derived: ['unit', 'epochNanos'] }"
                  >
                    {{ meta(card) }}
                  </p>
                  <p
                    class="m-0 mt-1 text-fg-soft"
                    [class.hidden]="!card.description"
                    [fieldOf]="card.series[0].point"
                    [qitsField]="{ derived: ['description'] }"
                  >
                    {{ card.description }}
                  </p>
                  @if (card.chart) {
                    <ul
                      class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0"
                      [attr.aria-label]="card.name + ' series'"
                      data-bars
                    >
                      @for (series of card.series; track series.key) {
                        <li
                          class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 text-xs"
                          [qitsEntity]="series.point"
                          entityKey="name"
                          data-bar
                        >
                          <span
                            class="min-w-0 truncate font-mono text-fg-soft"
                            [attr.title]="series.label"
                            [fieldOf]="series.point"
                            [qitsField]="marks.label"
                            >{{ series.label }}</span
                          >
                          <span
                            class="font-mono font-semibold whitespace-nowrap text-fg tabular-nums"
                            [fieldOf]="series.point"
                            [qitsField]="marks.value"
                            >{{ series.value }}</span
                          >
                          <span
                            class="col-span-2 block h-2.5 overflow-hidden rounded-sm border border-line bg-surface-muted"
                            aria-hidden="true"
                          >
                            <span
                              class="block h-full bg-accent"
                              [style.width]="series.width"
                              data-fill
                            ></span>
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p
                      class="m-0 mt-2 font-mono text-3xl font-semibold text-fg tabular-nums"
                      [fieldOf]="card.series[0].point"
                      [qitsField]="marks.value"
                      data-figure
                    >
                      {{ card.series[0].value }}
                    </p>
                    <p
                      class="m-0 mt-0.5 font-mono text-xs text-fg-muted"
                      [class.hidden]="card.series[0].attributes.length === 0"
                      [fieldOf]="card.series[0].point"
                      [qitsField]="marks.label"
                    >
                      {{ card.series[0].label }}
                    </p>
                  }
                </li>
              }
            </ol>
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="metricsState() === 'loaded' && points().length === 0 ? 'block' : 'hidden'"
              data-no-series
            >
              This source holds no metric series: it has exported no metrics lately.
            </p>
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="
                metricsState() === 'loaded' && points().length > 0 && cards().length === 0
                  ? 'block'
                  : 'hidden'
              "
              data-no-match
            >
              No metric name contains “{{ query().name }}”.
            </p>
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityMetricsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly marks = MARKS;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the source and the name filter. */
  protected readonly query = computed((): MetricsQuery => ({
    source: this.params()?.get('source') || undefined,
    name: this.params()?.get('name')?.trim() || undefined,
  }));

  /** The buffer's sources, in the browser only (the server has no session). */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /** The chosen source alone, so a change of the name filter reads nothing again. */
  private readonly source = computed(() => this.query().source);

  /** The chosen source's series, by source alone (never `name`); nothing until one is chosen. */
  protected readonly metrics = qitsResource(TELEMETRY_METRICS, () => {
    const source = this.source();
    if (!this.browser || !source) return undefined;
    return { query: { source } };
  });

  protected readonly sourcesValue = computed(() =>
    this.sources.hasValue() ? (this.sources.value() ?? {}) : {},
  );

  protected readonly metricsValue = computed(() =>
    this.metrics.hasValue() ? (this.metrics.value() ?? {}) : {},
  );

  /** Whether the buffer holds any service to choose (else the picker says nothing is buffered). */
  protected readonly hasServices = computed(() =>
    (this.sourcesValue().sources ?? []).some((source) => source.kind === 'SERVICE'),
  );

  /** Every series the source holds, unfiltered. */
  protected readonly points = computed(() => this.metricsValue().metrics ?? []);

  /** The cards, narrowed by `?name=`. */
  protected readonly cards = computed(() => metricCards(this.points(), this.query().name ?? ''));

  /** `2 series of 2 metrics · latest values as of 2026-01-01 00:00:01.000 UTC`. */
  protected readonly summary = computed(() => {
    const cards = this.cards();
    const series = seriesCount(cards);
    const newest = newestEpochNanos(cards.flatMap((card) => card.series.map((s) => s.point)));
    const counts = `${series} series of ${cards.length} metric${cards.length === 1 ? '' : 's'}`;
    return newest ? `${counts} · latest values as of ${lineTime(newest)} UTC` : counts;
  });

  protected readonly sourcesState = computed((): LoadState => loadState(this.sources));
  protected readonly metricsState = computed((): LoadState => loadState(this.metrics));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.metrics));

  /** Refresh: reads the sources and the shown metrics again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sources.reload();
        this.metrics.reload();
      },
    },
  ];

  /** A card's second line: its unit with its gloss, and when its newest point was stamped. */
  protected meta(card: MetricCard): string {
    const unit = card.unit ? `unit ${card.unit}${card.gloss ? ` (${card.gloss})` : ''}` : 'no unit';
    const at = lineTime(card.latestEpochNanos || undefined);
    return at ? `${unit} · as of ${at} UTC` : unit;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value.trim();
  }

  /** Puts `change` into the URL's query, which is what reads (or narrows) the metrics again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}

/** The marks of what a row computes from its series (`metric-series.ts`). */
const MARKS = {
  label: { derived: ['attributes'] },
  value: { derived: ['value', 'unit'] },
} as const;
