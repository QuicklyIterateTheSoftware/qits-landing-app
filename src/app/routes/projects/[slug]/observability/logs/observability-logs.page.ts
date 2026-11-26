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
  TelemetryLogLine,
  TelemetrySourceRow,
} from '$core/observability/observability.consumes';
import { TELEMETRY_LOGS, TELEMETRY_SOURCES } from '$core/observability/observability.operations';
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
import type { Action } from '$ui/components/action-button/action';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The levels the level filter offers, lowest first; none (All) reads every line. */
export const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

/** What a page reads of the URL's query (`?service=&level=&q=&since=&traceId=&fingerprint=&source=`). */
interface LogsQuery {
  /** One source by its key: the old links' only lens, still honoured (absent: every source). */
  readonly source: string | undefined;
  readonly service: string | undefined;
  readonly level: string | undefined;
  readonly q: string | undefined;
  readonly since: number | undefined;
  readonly trace: string | undefined;
  /** An error issue's fingerprint (qits-2538): its lines, set by the issue page's Show log lines. */
  readonly fingerprint: string | undefined;
}

/** A line's error issue fingerprint (`qits.error.fingerprint`, qits-2537), or empty. */
export function fingerprintOf(line: Pick<TelemetryLogLine, 'attributes'>): string {
  return line.attributes?.['qits.error.fingerprint'] ?? '';
}

/** `value` as one of the offered levels, or undefined (All). */
function levelOf(value: string | null): string | undefined {
  const upper = value?.toUpperCase();
  return LEVELS.find((level) => level === upper);
}

/** The names of every service that reported into any source, sorted, each once. */
export function serviceNames(sources: readonly TelemetrySourceRow[]): readonly string[] {
  const names = new Set<string>();
  for (const source of sources) {
    for (const service of source.services ?? []) if (service.name) names.add(service.name);
  }
  return [...names].sort();
}

/** A trace id cut to its first 8 characters, as a link's text. */
export function shortTrace(traceId: string | undefined): string {
  return traceId ? traceId.slice(0, 8) : '';
}

/**
 * The Observability section's Logs page, at `/projects/<slug>/observability/logs` (qits-2313; the
 * section's own address redirects here): qits-observability's telemetry buffer, which holds only
 * the platform's recent records.
 *
 * It opens on every source's lines merged into one tail (qits-2534: `TELEMETRY_LOGS`,
 * `searchTelemetryLogs` with no source), and the filters narrow it, each in the URL so a link keeps
 * the view: the service (`?service=` → `service`; its options are the services of every source in
 * `TELEMETRY_SOURCES`, `listTelemetrySources`), the level (`?level=` → `minSeverity`, absent: all),
 * the body filter (`?q=` → `query`, applied on Enter or when the field is left), the time range
 * (`?since=` minutes → `sinceMinutes`; absent: everything buffered, the default) and the trace
 * (`?traceId=`, qits-2535: set by the trace page's Logs links, cleared here) and the error issue
 * (`?fingerprint=` → `fingerprint`, qits-2538: set by the issue page's Show log lines, cleared
 * here). An old
 * link's `?source=<key>` still reads that one source; it shows as a filter to clear, and choosing a
 * service clears it. The query names are the retired qits-observability-frontend's, so its `/logs`
 * bookmarks can be forwarded as they are. The service answers at most 200 lines (its default
 * `limit`), oldest first; the page shows them newest first, each with its time, level, the service
 * that wrote it, body, the `service.version` of its resource and, when it belongs to a trace, a
 * link to the trace's page at the line's own source (`open-telemetry-trace`, qits-2535), when it
 * carries `attributes['qits.error.fingerprint']` an issue link to that error issue's page
 * (`open-log-error-issue`, qits-2537), and says
 * so when the answer was `truncated`.
 *
 * Both reads run in the browser only (the server has no session), through `qitsResource`. A refusal
 * (403: only `qits:admin`, `qits:admin-agent`, `qits:desk-admin` and `qits:agent` may read
 * telemetry) is said as such; any other failure offers Retry; an empty answer says no line
 * matches. Marks (qits-2141): the service options are the sources read; the log list is the logs
 * read, each line by its `epochNanos`.
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
    QitsExit,
    QitsField,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Logs" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          The log lines of every platform service that sent telemetry, newest first. The buffer
          holds only their recent records; older ones are gone.
        </p>
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading telemetry needs qits:admin.
        </p>

        <section aria-label="Log lines" [class.hidden]="refusal()">
          <div class="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label class="flex flex-col gap-1 text-xs text-fg-muted">
              Service
              <select
                class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                [qitsEntityList]="sources"
                [fieldOf]="sourcesValue()"
                [qitsField]="{ derived: ['sources'] }"
                (change)="setQuery({ service: value($event) || null, source: null })"
              >
                <option value="" [selected]="!query().service">All services</option>
                @for (name of services(); track name) {
                  <option [value]="name" [selected]="name === query().service">{{ name }}</option>
                }
              </select>
            </label>
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
          <p
            class="m-0 mb-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted"
            [class.hidden]="!query().source && !query().trace && !query().fingerprint"
          >
            <span
              class="items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5"
              [class]="query().source ? 'inline-flex' : 'hidden'"
              data-source-filter
            >
              Source <span class="font-mono text-fg">{{ query().source }}</span>
              <button
                type="button"
                class="ml-1 cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline"
                (click)="setQuery({ source: null })"
              >
                Clear
              </button>
            </span>
            <span
              class="items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5"
              [class]="query().trace ? 'inline-flex' : 'hidden'"
              data-trace-filter
            >
              Trace <span class="font-mono text-fg">{{ query().trace }}</span>
              <button
                type="button"
                class="ml-1 cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline"
                (click)="setQuery({ traceId: null })"
              >
                Clear
              </button>
            </span>
            <span
              class="items-center gap-1 rounded-md border border-line bg-surface-muted px-2 py-0.5"
              [class]="query().fingerprint ? 'inline-flex' : 'hidden'"
              data-fingerprint-filter
            >
              Error issue <span class="font-mono text-fg">{{ query().fingerprint }}</span>
              <button
                type="button"
                class="ml-1 cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline"
                (click)="setQuery({ fingerprint: null })"
              >
                Clear
              </button>
            </span>
          </p>
          <ui-load-failure
            message="The log lines could not be read."
            [class.hidden]="logsState() !== 'error' || refusal()"
            (retry)="logs.reload()"
          />
          <ui-spinner
            [state]="logsState()"
            class="min-h-32"
            [class.hidden]="logsState() === 'error'"
          >
            <p class="m-0 mb-2 text-xs text-fg-muted" [class.hidden]="!truncated()">
              More lines match than are shown: narrow the service, the level, the text or the time
              range.
            </p>
            <ol
              class="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line bg-surface p-0 font-mono text-xs"
              [class.hidden]="lines().length === 0"
              [qitsEntityList]="logs"
            >
              @for (line of lines(); track $index) {
                <li
                  class="grid grid-cols-[auto_4rem_9rem_1fr] items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 max-md:grid-cols-[auto_4rem_1fr]"
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
                    class="min-w-0 truncate font-semibold text-fg-soft"
                    [title]="line.serviceName ?? ''"
                    [fieldOf]="line"
                    qitsField="serviceName"
                    data-service
                    >{{ line.serviceName || '—' }}</span
                  >
                  <span
                    class="min-w-0 break-words whitespace-pre-wrap text-fg max-md:col-span-3"
                    [fieldOf]="line"
                    qitsField="body"
                    >{{ line.body }}</span
                  >
                  <span
                    class="flex flex-wrap gap-x-3 text-fg-muted md:col-start-4 max-md:col-span-3"
                    [class.hidden]="!version(line) && !line.traceId && !issueOf(line)"
                    [fieldOf]="line"
                    [qitsField]="{
                      derived: ['resourceAttributes', 'traceId', 'source', 'attributes'],
                    }"
                  >
                    <span [class.hidden]="!version(line)">{{ version(line) }}</span>
                    @if (line.traceId) {
                      <a
                        class="text-accent no-underline hover:underline"
                        [qitsExit]="tracing.trace"
                        [exitParams]="{ slug: slug(), traceId: line.traceId }"
                        [exitQueryParams]="{ source: line.source }"
                        [title]="line.traceId"
                        data-trace
                        >trace {{ short(line.traceId) }}</a
                      >
                    }
                    @if (issueOf(line); as fingerprint) {
                      <a
                        class="text-accent no-underline hover:underline"
                        [qitsExit]="issuing.issue"
                        [exitParams]="{ slug: slug(), fingerprint }"
                        [title]="fingerprint"
                        data-issue
                        >issue {{ short(fingerprint) }}</a
                      >
                    }
                  </span>
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
  private readonly selected = inject(SelectedProject);

  protected readonly levels = LEVELS;
  protected readonly sinceMinutes = SINCE_MINUTES;
  protected readonly sinceLabel = sinceLabel;
  protected readonly time = lineTime;
  protected readonly short = shortTrace;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** What the URL asks for: the filters, and an old link's source. */
  protected readonly query = computed((): LogsQuery => {
    const params = this.params();
    return {
      source: params?.get('source') || undefined,
      service: params?.get('service') || undefined,
      level: levelOf(params?.get('level') ?? null),
      q: params?.get('q') || undefined,
      since: minutesOf(params?.get('since') ?? null),
      trace: params?.get('traceId') || undefined,
      fingerprint: params?.get('fingerprint') || undefined,
    };
  });

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The buffer's sources, for the service filter's options; in the browser only. */
  protected readonly sources = qitsResource(TELEMETRY_SOURCES, () =>
    this.browser ? {} : undefined,
  );

  /** The log lines, every source merged unless an old link names one, as the filters narrow them. */
  protected readonly logs = qitsResource(TELEMETRY_LOGS, () => {
    const { source, service, level, q, since, trace, fingerprint } = this.query();
    if (!this.browser) return undefined;
    return {
      query: {
        ...(source ? { source } : {}),
        ...(service ? { service } : {}),
        ...(level ? { minSeverity: level } : {}),
        ...(q ? { query: q } : {}),
        ...(since ? { sinceMinutes: since } : {}),
        ...(trace ? { traceId: trace } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      },
    };
  });

  protected readonly logsValue = computed(() =>
    this.logs.hasValue() ? (this.logs.value() ?? {}) : {},
  );

  protected readonly sourcesValue = computed(() =>
    this.sources.hasValue() ? (this.sources.value() ?? {}) : {},
  );

  /** The service filter's options, the chosen one kept even when no source lists it any more. */
  protected readonly services = computed(() => {
    const names = serviceNames(this.sourcesValue().sources ?? []);
    const chosen = this.query().service;
    return chosen && !names.includes(chosen) ? [...names, chosen].sort() : names;
  });

  /** The lines newest first: the service answers them oldest first. */
  protected readonly lines = computed(() => [...(this.logsValue().logs ?? [])].reverse());

  protected readonly truncated = computed(() => this.logsValue().truncated === true);

  protected readonly logsState = computed((): LoadState => loadState(this.logs));

  /** Whether either read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.sources) || refused(this.logs));

  /** A line's trace id: the trace's page at the line's own source (qits-2535). */
  protected readonly tracing = outcomes('open-telemetry-trace', {
    trace: exit('projects/:slug/observability/traces/:traceId'),
  });

  /** A line's issue link: its error issue's page (qits-2537, qits-2538). */
  protected readonly issuing = outcomes('open-log-error-issue', {
    issue: exit('projects/:slug/observability/errors/:fingerprint'),
  });

  protected readonly issueOf = fingerprintOf;

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

  protected tone(level: string | undefined): ChipTone {
    return levelTone(level);
  }

  protected version(line: TelemetryLogLine): string {
    return versionOf(line.resourceAttributes);
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
