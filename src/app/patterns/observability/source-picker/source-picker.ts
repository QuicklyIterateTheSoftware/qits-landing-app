import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QitsEntity, QitsEntityList, QitsField, type QitsResourceRef } from '@qits/angular';
import type {
  TelemetrySourceRow,
  TelemetrySources,
} from '$core/observability/observability.consumes';
import { utcMinute } from '$core/projects/release-requests';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The buffer's sources read (`TELEMETRY_SOURCES`), as a page hands it over. */
export type TelemetrySourcesRead = QitsResourceRef<TelemetrySources>;

/**
 * The Observability section's source picker (qits-2313; shared since qits-2339): every SERVICE
 * source of the telemetry buffer (`sources`, the page's `TELEMETRY_SOURCES` read), by label, with
 * how many log lines, spans and metric series it holds and how far back it reaches
 * (`oldestReceivedAt`). Choosing one puts its key in the URL (`?source=_service/qits-ci`, the rest
 * of the query kept), which is what the page reads by, so the view is linkable and survives a
 * reload; `selected` is that key, marked current, and `state` the read's `loadState`. A failed
 * read offers Retry, unless it was `refused` (the page says so once, for every read); an empty
 * buffer says nothing is buffered.
 * Marks (qits-2141): the list is the sources read, each row a source by its key.
 */
@Component({
  selector: 'app-telemetry-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, QitsEntity, QitsEntityList, QitsField, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <ui-load-failure
      message="The telemetry buffer’s sources could not be read."
      [class.hidden]="state() !== 'error' || refused()"
      (retry)="sources().reload()"
    />
    <ui-spinner [state]="state()" class="min-h-16" [class.hidden]="state() === 'error'">
      <ul
        class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 p-0"
        aria-label="Services"
        [qitsEntityList]="sources()"
      >
        @for (source of services(); track source.key) {
          <li [qitsEntity]="source" entityKey="key">
            <a
              class="block rounded-md border px-3 py-2 no-underline hover:bg-surface-muted"
              [class]="
                source.key === selected()
                  ? 'border-accent bg-accent-soft text-fg'
                  : 'border-line bg-surface text-fg-soft'
              "
              [attr.aria-current]="source.key === selected() ? 'true' : null"
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
        [class]="state() === 'loaded' && services().length === 0 ? 'block' : 'hidden'"
      >
        Nothing is buffered: no platform service has sent telemetry lately.
      </p>
    </ui-spinner>
  `,
})
export class TelemetrySourcePicker {
  /** The buffer's sources read. */
  readonly sources = input.required<TelemetrySourcesRead>();

  /** What the read has come to (`loadState` of `sources`, which the page computes). */
  readonly state = input.required<LoadState>();

  /** The chosen source's key, from the URL; undefined while none is chosen. */
  readonly selected = input<string | undefined>(undefined);

  /** Whether a read of the page was refused: the page says so, so no Retry is offered here. */
  readonly refused = input(false);

  /** The platform's services among the sources (workspaces and the unscoped rest left out). */
  protected readonly services = computed(() =>
    this.sources().hasValue()
      ? (this.sources().value()?.sources ?? []).filter((source) => source.kind === 'SERVICE')
      : [],
  );

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
}
