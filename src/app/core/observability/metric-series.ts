import { formatBytes } from '$core/artifacts/artifact-listings';
import type { TelemetryMetricPoint } from './observability.consumes';

/**
 * The Metrics page's shaping, as pure functions over the answer (qits-2340, ported from the retired
 * qits-observability-frontend's `metric-series.ts`). The interesting cases are the ones a careless
 * rendering gets plausibly wrong, each asserted directly in the spec:
 *
 * - **One point per series, and nothing behind it.** The buffer keeps the latest point of each
 *   series and replaces it in place, so the answer is a snapshot of latest values: there is no
 *   history to chart, and none is gathered across reads.
 * - **A series is its name and its attributes.** The service keys it as the name plus the attribute
 *   set sorted by key, `name|k=v|k=v` ({@link seriesKey}), the reporting service not in it. That key
 *   is unique within an answer, so it is the row's `track` and its sort key.
 * - **Series are never summed.** `jvm.thread.count` reports overlapping attribute sets (by state,
 *   and by daemon flag), so a total of its series would count each thread twice. A metric with two
 *   or more series is drawn as one bar per series against the largest of them ({@link barFraction});
 *   one series is its value alone.
 * - **A value is drawn for its unit** ({@link formatMetricValue}): bytes in binary units, an integer
 *   as an integer, a small ratio not flattened to zero.
 * - **The order is this module's**, not the answer's (the order a process first exported each
 *   series): cards by name, series by key, so a Refresh does not reshuffle them.
 */

/** The unit OTel uses for bytes: UCUM `By`, never `B` or `bytes`. */
export const BYTE_UNIT = 'By';

/** What is drawn for a value that is not a number. */
export const NO_VALUE = '—';

/** One attribute of a series. */
export interface AttributePair {
  readonly key: string;
  readonly value: string;
}

/** One series of a metric at its latest point: a row of its card, a bar where the card charts. */
export interface MetricSeriesView {
  /** The point itself, for the marks. */
  readonly point: TelemetryMetricPoint;
  /** The service's own series identity, `name|k=v|k=v`. */
  readonly key: string;
  /** The attribute set, sorted by key. Empty on a metric with a single unlabelled series. */
  readonly attributes: readonly AttributePair[];
  /** The attributes as one label, `k=v, k=v`; `no attributes` on an unlabelled series. */
  readonly label: string;
  /** The value, drawn for its unit. */
  readonly value: string;
  /** The bar's length: the value over the card's largest, clamped to 0..1. */
  readonly fraction: number;
  /** {@link fraction} as a CSS width, `62.5%`. */
  readonly width: string;
}

/** One metric name, with every series reported under it. */
export interface MetricCard {
  readonly name: string;
  /** The first non-empty description among its series, or empty. */
  readonly description: string;
  /** The first non-empty unit among its series, or empty. */
  readonly unit: string;
  /** What the unit means, where its UCUM spelling does not say ({@link unitGloss}). */
  readonly gloss: string;
  /** The type the series declare (GAUGE, COUNTER), or MIXED where they disagree. Shown only. */
  readonly type: string;
  /** Its series, sorted by key. */
  readonly series: readonly MetricSeriesView[];
  /** Whether it is drawn as bars: two or more series. One series is a single figure. */
  readonly chart: boolean;
  /** The newest `epochNanos` among its series. */
  readonly latestEpochNanos: number;
}

/** Codepoint order, as the service sorts a series' attributes (and stable across locales). */
function byCodepoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * A value, drawn for the unit its exporter declared: `By` in binary units (`143 MiB`), an integer
 * as an integer with thousands separators (`41,233`, never `41,233.00`), anything else to six
 * significant digits (`0.0021456`), and a non-zero magnitude under 1e-4 in exponential form
 * (`1.234e-5`) rather than as a row of zeroes. A value that is not a finite number is `—`, never 0.
 */
export function formatMetricValue(value: number | undefined, unit: string | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_VALUE;
  if (unit === BYTE_UNIT) return formatBytes(value);
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  if (Math.abs(value) < 1e-4) return value.toExponential(3);
  return value.toLocaleString('en-US', { maximumSignificantDigits: 6 });
}

/**
 * What a unit means, where the UCUM spelling is not readable as English, and empty where it is.
 * The raw unit stays on screen beside it: it is what the exporter declared.
 */
export function unitGloss(unit: string | undefined): string {
  const trimmed = (unit ?? '').trim();
  if (!trimmed) return '';
  if (trimmed === '1') return 'dimensionless — a ratio or a plain count';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return `a count of ${trimmed.slice(1, -1)}`;
  switch (trimmed) {
    case BYTE_UNIT:
      return 'bytes';
    case 's':
      return 'seconds';
    case 'ms':
      return 'milliseconds';
    case 'ns':
      return 'nanoseconds';
    case 'Hz':
      return 'hertz — events per second';
    case '%':
      return 'per cent';
    default:
      return '';
  }
}

/** A series' attributes, sorted by key as the service sorts them into its identity. */
export function attributePairs(
  attributes: Readonly<Record<string, string>> | undefined,
): AttributePair[] {
  return Object.entries(attributes ?? {})
    .map(([key, value]) => ({ key, value: String(value) }))
    .sort((left, right) => byCodepoint(left.key, right.key));
}

/** The service's series identity: the name, then each attribute sorted by key, `name|k=v|k=v`. */
export function seriesKey(name: string, attributes: readonly AttributePair[]): string {
  return attributes.reduce((key, pair) => `${key}|${pair.key}=${pair.value}`, name);
}

/** A bar's label: the attributes as `k=v, k=v`, or `no attributes`. */
export function attributeLabel(attributes: readonly AttributePair[]): string {
  return attributes.length
    ? attributes.map((pair) => `${pair.key}=${pair.value}`).join(', ')
    : 'no attributes';
}

/**
 * A bar's length: `value` over the card's largest `max`, clamped to 0..1. Zero, a negative or a
 * missing value draws an empty bar, and so does every bar of a card whose largest is not positive
 * (there is nothing to measure against).
 */
export function barFraction(value: number | undefined, max: number): number {
  if (value === undefined || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** A fraction as a CSS width, trimmed of float noise: `62.5%`, `0%`, `100%`. */
export function barWidth(fraction: number): string {
  return `${Number((fraction * 100).toFixed(2))}%`;
}

/** Whether `name` holds `filter` (trimmed, any case); every name for an empty filter. */
export function nameMatches(name: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return !needle || name.toLowerCase().includes(needle);
}

/**
 * The answer as cards, one per metric name, sorted by name, narrowed to the names holding
 * `filter` (a case-insensitive substring, applied here: the door's own `name` is an exact,
 * case-sensitive match, which a search box must not mean).
 */
export function metricCards(
  metrics: readonly TelemetryMetricPoint[],
  filter = '',
): readonly MetricCard[] {
  const byName = new Map<string, TelemetryMetricPoint[]>();
  for (const metric of metrics) {
    const name = metric.name ?? '';
    if (!nameMatches(name, filter)) continue;
    const bucket = byName.get(name);
    if (bucket) bucket.push(metric);
    else byName.set(name, [metric]);
  }
  return [...byName.entries()]
    .sort(([left], [right]) => byCodepoint(left, right))
    .map(([name, points]) => cardOf(name, points));
}

/** How many series `cards` hold. */
export function seriesCount(cards: readonly MetricCard[]): number {
  return cards.reduce((total, card) => total + card.series.length, 0);
}

/** The newest `epochNanos` among `metrics`, or undefined when none carries one. */
export function newestEpochNanos(metrics: readonly TelemetryMetricPoint[]): number | undefined {
  const stamps = metrics.map((metric) => metric.epochNanos ?? 0).filter((stamp) => stamp > 0);
  return stamps.length ? Math.max(...stamps) : undefined;
}

function cardOf(name: string, points: readonly TelemetryMetricPoint[]): MetricCard {
  const unit = points.find((point) => point.unit)?.unit ?? '';
  const max = Math.max(...points.map((point) => point.value ?? Number.NEGATIVE_INFINITY));
  const series = points
    .map((point): MetricSeriesView => {
      const attributes = attributePairs(point.attributes);
      const fraction = barFraction(point.value, max);
      return {
        point,
        key: seriesKey(name, attributes),
        attributes,
        label: attributeLabel(attributes),
        value: formatMetricValue(point.value, unit),
        fraction,
        width: barWidth(fraction),
      };
    })
    .sort((left, right) => byCodepoint(left.key, right.key));
  const types = new Set(points.map((point) => point.type ?? ''));
  return {
    name,
    description: points.find((point) => point.description)?.description ?? '',
    unit,
    gloss: unitGloss(unit),
    type: types.size === 1 ? [...types][0] : 'MIXED',
    series,
    chart: series.length >= 2,
    latestEpochNanos: newestEpochNanos(points) ?? 0,
  };
}
