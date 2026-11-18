import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { QitsApiError, QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import type {
  TelemetryLogLine,
  TelemetrySourceRow,
} from '$core/observability/observability.consumes';
import { TELEMETRY_LOGS, TELEMETRY_SOURCES } from '$core/observability/observability.operations';
import { utcMinute } from '$core/projects/release-requests';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The levels the level filter offers, lowest first; none (All) reads every line. */
export const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

/** The time ranges the range filter offers, in minutes; none (Everything) is the default. */
export const SINCE_MINUTES = [15, 60, 360, 1440] as const;

/** A time range's label. */
function sinceLabel(minutes: number): string {
  if (minutes < 60) return `Last ${minutes} minutes`;
  return minutes === 60 ? 'Last hour' : `Last ${minutes / 60} hours`;
}

/** What a page reads of the URL's query (`?source=&level=&q=&since=`, the old frontend's names). */
interface LogsQuery {
  readonly source: string | undefined;
  readonly level: string | undefined;
  readonly q: string | undefined;
  readonly since: number | undefined;
}

/** `value` as one of the offered levels, or undefined (All). */
function levelOf(value: string | null): string | undefined {
  const upper = value?.toUpperCase();
  return LEVELS.find((level) => level === upper);
}

/** `value` as a positive whole number of minutes, or undefined (Everything). */
function minutesOf(value: string | null): number | undefined {
  const minutes = Number(value);
  return value && Number.isInteger(minutes) && minutes > 0 ? minutes : undefined;
}

/** A line's time, `YYYY-MM-DD HH:MM:SS.mmm` in UTC, from its `epochNanos`; empty when missing. */
export function lineTime(epochNanos: number | undefined): string {
  if (epochNanos === undefined) return '';
  const date = new Date(Math.round(epochNanos / 1e6));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

/** A line's level, as a chip's tone. */
function levelTone(level: string | undefined): ChipTone {
  switch (level?.toUpperCase()) {
    case 'ERROR':
    case 'FATAL':
      return 'failed';
    case 'WARN':
      return 'waiting';
    default:
      return 'neutral';
  }
}

/** Whether a failed read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * The Observability section's Logs page, at `/projects/<slug>/observability/logs` (qits-2313; the
 * section's own address redirects here): qits-observability's telemetry buffer, which holds only
 * the platform's recent records.
 *
 * On top, the source picker: every SERVICE source of the buffer (`TELEMETRY_SOURCES`,
 * `listTelemetrySources`), by label, with how many log lines, spans and metric series it holds and
 * how far back it reaches (`oldestReceivedAt`). Choosing one puts its key in the URL
 * (`?source=_service/qits-ci`), so the view is linkable and survives a reload. Below, the chosen
 * source's log lines (`TELEMETRY_LOGS`, `searchTelemetryLogs`), narrowed by the level filter
 * (`?level=` → `minSeverity`, absent: all), the body filter (`?q=` → `query`, applied on Enter or
 * when the field is left) and the time range (`?since=` minutes → `sinceMinutes`; absent:
 * everything buffered, the default). The query names are the retired qits-observability-frontend's,
 * so its `/logs` bookmarks can be forwarded as they are. The service answers at most 200 lines
 * (its default `limit`), oldest first; the page shows them newest first, each with its time, level,
 * body and the `service.version` of its resource, and says so when the answer was `truncated`.
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read
 * telemetry) is said as such; any other failure offers Retry; an empty buffer says nothing is
 * buffered. Marks (qits-2141): the picker is the sources read, each row a source by its key; the
 * log list is the logs read, each line by its `epochNanos`.
 *
 * Staleness (qits-1270): none, no domain event; Refresh re-reads.
 */
@Component({
  selector: 'app-observability-logs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsField,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Logs" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The platform’s services that sent telemetry. The buffer holds only their recent records;
          older ones are gone.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading telemetry needs qits:admin.
        </p>
        <ui-load-failure
          message="The telemetry buffer’s sources could not be read."
          [class.hidden]="sourcesState() !== 'error' || refusal()"
          (retry)="sources.reload()"
        />
        <ui-spinner
          [state]="sourcesState()"
          class="min-h-16"
          [class.hidden]="sourcesState() === 'error'"
        >
          <ul
            class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 p-0"
            aria-label="Services"
            [qitsEntityList]="sources"
          >
            @for (source of services(); track source.key) {
              <li [qitsEntity]="source" entityKey="key">
                <a
                  class="block rounded-md border px-3 py-2 no-underline hover:bg-surface-muted"
                  [class]="
                    source.key === query().source
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-line bg-surface text-fg-soft'
                  "
                  [attr.aria-current]="source.key === query().source ? 'true' : null"
                  [routerLink]="[]"
                  [queryParams]="{ source: source.key }"
                  queryParamsHandling="merge"
                >
                  <span
                    class="block truncate font-semibold text-fg"
                    [fieldOf]="source"
                    qitsField="label"
                    >{{ source.label }}</span
                  >
                  <span
                    class="block text-xs text-fg-muted"
                    [fieldOf]="source"
                    [qitsField]="{ derived: ['logs', 'spans', 'metricSeries'] }"
                    >{{ counts(source) }}</span
                  >
                  <span
                    class="block text-xs text-fg-muted"
                    [fieldOf]="source"
                    [qitsField]="{ derived: ['oldestReceivedAt'] }"
                    >{{ reach(source) }}</span
                  >
                </a>
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
            [class]="sourcesState() === 'loaded' && services().length === 0 ? 'block' : 'hidden'"
          >
            Nothing is buffered: no platform service has sent telemetry lately.
          </p>
        </ui-spinner>

        <section class="mt-6" aria-label="Log lines" [class.hidden]="!query().source || refusal()">
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Level
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                (change)="setQuery({ level: value($event) || null })"
              >
                <option value="" [selected]="!query().level">All</option>
                @for (level of levels; track level) {
                  <option [value]="level" [selected]="level === query().level">
                    {{ level }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Body contains
              <input
                class="h-8 w-64 max-w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                type="search"
                [value]="query().q ?? ''"
                (change)="setQuery({ q: value($event) || null })"
              />
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
            message="This source’s log lines could not be read."
            [class.hidden]="logsState() !== 'error' || refusal()"
            (retry)="logs.reload()"
          />
          <ui-spinner
            [state]="logsState()"
            class="min-h-32"
            [class.hidden]="logsState() === 'error'"
          >
            <p class="m-0 mb-2 text-xs text-fg-muted" [class.hidden]="!truncated()">
              More lines match than are shown: narrow the level, the text or the time range.
            </p>
            <ol
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 font-mono text-xs"
              [class.hidden]="lines().length === 0"
              [qitsEntityList]="logs"
            >
              @for (line of lines(); track $index) {
                <li
                  class="grid grid-cols-[auto_4rem_1fr] items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 max-md:grid-cols-[auto_1fr]"
                  [qitsEntity]="line"
                  entityKey="epochNanos"
                >
                  <span
                    class="whitespace-nowrap text-fg-muted"
                    [fieldOf]="line"
                    [qitsField]="{ derived: ['epochNanos'] }"
                    >{{ time(line.epochNanos) }}</span
                  >
                  <ui-chip
                    class="justify-self-start"
                    [label]="line.severityText ?? ''"
                    [tone]="tone(line.severityText)"
                    [fieldOf]="line"
                    [qitsField]="{ derived: ['severityText'] }"
                  />
                  <span
                    class="min-w-0 break-words whitespace-pre-wrap text-fg max-md:col-span-2"
                    [fieldOf]="line"
                    qitsField="body"
                    >{{ line.body }}</span
                  >
                  <span
                    class="text-fg-muted md:col-start-3"
                    [class.hidden]="!version(line)"
                    [fieldOf]="line"
                    [qitsField]="{ derived: ['resourceAttributes'] }"
                    >{{ version(line) }}</span
                  >
                </li>
              }
            </ol>
            <p
              class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
              [class]="logsState() === 'loaded' && lines().length === 0 ? 'block' : 'hidden'"
            >
              No log lines match.
            </p>
          </ui-spinner>
        </section>
      </app-page-layout>
    </div>
  `,
})
export class ObservabilityLogsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly levels = LEVELS;
  protected readonly sinceMinutes = SINCE_MINUTES;
  protected readonly sinceLabel = sinceLabel;
  protected readonly time = lineTime;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the source, the level, the body filter and the time range. */
  protected readonly query = computed((): LogsQuery => {
    const params = this.params();
    return {
      source: params?.get('source') || undefined,
      level: levelOf(params?.get('level') ?? null),
      q: params?.get('q') || undefined,
      since: minutesOf(params?.get('since') ?? null),
    };
  });

  /** The buffer's sources, in the browser only (the server has no session). */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /** The chosen source's log lines, as the filters narrow them; nothing until one is chosen. */
  protected readonly logs = qitsResource(TELEMETRY_LOGS, () => {
    const { source, level, q, since } = this.query();
    if (!this.browser || !source) return undefined;
    return {
      query: {
        source,
        ...(level ? { minSeverity: level } : {}),
        ...(q ? { query: q } : {}),
        ...(since ? { sinceMinutes: since } : {}),
      },
    };
  });

  /** The platform's services among the sources (workspaces and the unscoped rest left out). */
  protected readonly services = computed(() =>
    this.sources.hasValue()
      ? (this.sources.value()?.sources ?? []).filter((source) => source.kind === 'SERVICE')
      : [],
  );

  protected readonly logsValue = computed(() =>
    this.logs.hasValue() ? (this.logs.value() ?? {}) : {},
  );

  /** The lines newest first: the service answers them oldest first. */
  protected readonly lines = computed(() => [...(this.logsValue().logs ?? [])].reverse());

  protected readonly truncated = computed(() => this.logsValue().truncated === true);

  protected readonly sourcesState = computed((): LoadState => loadState(this.sources));
  protected readonly logsState = computed((): LoadState => loadState(this.logs));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.logs));

  /** Refresh: reads the sources and the shown logs again. */
  protected readonly actions: readonly Action[] = [
    {
      label: 'Refresh',
      variant: 'muted',
      callback: () => {
        this.sources.reload();
        this.logs.reload();
      },
    },
  ];

  protected counts(source: TelemetrySourceRow): string {
    const plural = (n: number | undefined, word: string) =>
      `${n ?? 0} ${word}${n === 1 ? '' : 's'}`;
    return [
      plural(source.logs, 'log line'),
      plural(source.spans, 'span'),
      `${source.metricSeries ?? 0} metric series`,
    ].join(' · ');
  }

  protected reach(source: TelemetrySourceRow): string {
    const since = utcMinute(source.oldestReceivedAt ?? undefined);
    return since ? `since ${since}` : '';
  }

  protected tone(level: string | undefined): ChipTone {
    return levelTone(level);
  }

  protected version(line: TelemetryLogLine): string {
    return line.resourceAttributes?.['service.version'] ?? '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value.trim();
  }

  /** Puts `change` into the URL's query, which is what reads the logs again. */
  protected setQuery(change: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
    });
  }
}
