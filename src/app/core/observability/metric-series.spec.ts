import { observabilityGoldenMasters } from '../../../testing/golden-masters';
import {
  attributeLabel,
  attributePairs,
  barFraction,
  barWidth,
  formatMetricValue,
  metricCards,
  nameMatches,
  newestEpochNanos,
  seriesCount,
  seriesKey,
  unitGloss,
} from './metric-series';
import type { TelemetryMetricPoint, TelemetryMetrics } from './observability.consumes';

/**
 * qits-observability's recorded series: `http.server.requests` (COUNTER 3, no attributes) and
 * `jvm.memory.used{pool=heap}` (1.5E8 By), each the only series of its name.
 */
const recorded = (): TelemetryMetricPoint[] =>
  observabilityGoldenMasters.body<TelemetryMetrics>(
    'telemetry from one platform service',
    'listTelemetryMetrics',
  ).metrics!;

/** The recorded `jvm.memory.used` series. */
const memory = (): TelemetryMetricPoint => recorded().find((m) => m.name === 'jvm.memory.used')!;

/**
 * `jvm.memory.used` as a live source reports it, derived from the recorded series: several pools,
 * each its own series, in the order a process first exported them (not the key order).
 */
const pools = (): TelemetryMetricPoint[] => [
  { ...memory(), value: 5e7, attributes: { pool: 'survivor' } },
  { ...memory(), value: 2e8, attributes: { pool: 'old' } },
  { ...memory(), value: 0, attributes: { pool: 'eden' } },
  memory(),
];

describe('metric series', () => {
  describe('formatMetricValue', () => {
    it('draws a byte figure in binary units, because nine digits are read wrong at a glance', () => {
      expect(formatMetricValue(memory().value, 'By')).toBe('143 MiB');
      expect(formatMetricValue(168296448, 'By')).toBe('161 MiB');
      expect(formatMetricValue(12582912, 'By')).toBe('12.0 MiB');
      expect(formatMetricValue(512, 'By')).toBe('512 B');
    });

    it('keeps an integer an integer, with thousands separators', () => {
      expect(formatMetricValue(3, '')).toBe('3');
      expect(formatMetricValue(41233, '1')).toBe('41,233');
      expect(formatMetricValue(0, '{class}')).toBe('0');
    });

    it('keeps a small ratio to six significant digits rather than flattening it to zero', () => {
      expect(formatMetricValue(0.0021456, '1')).toBe('0.0021456');
      expect(formatMetricValue(12345.678912, 's')).toBe('12,345.7');
    });

    it('falls back to exponential below a ten-thousandth', () => {
      expect(formatMetricValue(0.000012345, '1')).toBe('1.234e-5');
    });

    it('draws a value it cannot read as nothing, never as 0', () => {
      expect(formatMetricValue(Number.NaN, '1')).toBe('—');
      expect(formatMetricValue(undefined, 'By')).toBe('—');
    });
  });

  describe('unitGloss', () => {
    it('explains the UCUM spellings that read as noise', () => {
      expect(unitGloss('1')).toBe('dimensionless — a ratio or a plain count');
      expect(unitGloss('{thread}')).toBe('a count of thread');
      expect(unitGloss('By')).toBe('bytes');
      expect(unitGloss('ms')).toBe('milliseconds');
    });

    it('says nothing where the unit is absent or already a word', () => {
      expect(unitGloss('')).toBe('');
      expect(unitGloss(undefined)).toBe('');
      expect(unitGloss('kg')).toBe('');
    });
  });

  it('keys a series by its name and its attributes sorted by key', () => {
    const pairs = attributePairs({ 'jvm.memory.type': 'heap', 'jvm.memory.pool.name': 'G1 Eden' });
    expect(pairs.map((pair) => pair.key)).toEqual(['jvm.memory.pool.name', 'jvm.memory.type']);
    expect(seriesKey('jvm.memory.used', pairs)).toBe(
      'jvm.memory.used|jvm.memory.pool.name=G1 Eden|jvm.memory.type=heap',
    );
    expect(attributeLabel(pairs)).toBe('jvm.memory.pool.name=G1 Eden, jvm.memory.type=heap');
    expect(attributeLabel([])).toBe('no attributes');
  });

  describe('barFraction', () => {
    it('measures a value against the largest, clamped to 0..1', () => {
      expect(barFraction(50, 200)).toBe(0.25);
      expect(barFraction(200, 200)).toBe(1);
      expect(barFraction(-5, 200)).toBe(0);
    });

    it('draws an empty bar for zero, a missing value, or a largest that is not positive', () => {
      expect(barFraction(0, 200)).toBe(0);
      expect(barFraction(undefined, 200)).toBe(0);
      expect(barFraction(0, 0)).toBe(0);
      expect(barFraction(-1, -1)).toBe(0);
    });

    it('writes a fraction as a CSS width', () => {
      expect(barWidth(0.625)).toBe('62.5%');
      expect(barWidth(1 / 3)).toBe('33.33%');
      expect(barWidth(0)).toBe('0%');
    });
  });

  it('cards the recorded answer: one per name, sorted, each a single figure', () => {
    const cards = metricCards(recorded());
    expect(cards.map((card) => card.name)).toEqual(['http.server.requests', 'jvm.memory.used']);
    expect(cards.map((card) => card.chart)).toEqual([false, false]);
    const [requests, used] = cards;
    expect(requests.type).toBe('COUNTER');
    expect(requests.series[0].value).toBe('3');
    expect(requests.series[0].label).toBe('no attributes');
    expect(used.unit).toBe('By');
    expect(used.gloss).toBe('bytes');
    expect(used.series[0].value).toBe('143 MiB');
    expect(used.series[0].key).toBe('jvm.memory.used|pool=heap');
    expect(seriesCount(cards)).toBe(2);
  });

  it('charts two or more series as one bar each against the largest, sorted by key, never summed', () => {
    const [card] = metricCards(pools());
    expect(card.chart).toBe(true);
    expect(card.series.map((series) => series.label)).toEqual([
      'pool=eden',
      'pool=heap',
      'pool=old',
      'pool=survivor',
    ]);
    expect(card.series.map((series) => series.width)).toEqual(['0%', '75%', '100%', '25%']);
    expect(card.series.map((series) => series.value)).toEqual([
      '0 B',
      '143 MiB',
      '191 MiB',
      '47.7 MiB',
    ]);
    // No figure on the card adds the series up.
    expect(JSON.stringify(card)).not.toContain('400000000');
  });

  it('draws every bar empty when every series is zero', () => {
    const zeroes = pools().map((point) => ({ ...point, value: 0 }));
    expect(metricCards(zeroes)[0].series.every((series) => series.fraction === 0)).toBe(true);
  });

  it('says MIXED where the series of one name disagree about their type', () => {
    const [card] = metricCards([pools()[0], { ...pools()[1], type: 'COUNTER' }]);
    expect(card.type).toBe('MIXED');
  });

  it('narrows to the names holding the filter, in any case, in the browser', () => {
    expect(metricCards(recorded(), 'MEMORY').map((card) => card.name)).toEqual(['jvm.memory.used']);
    expect(metricCards(recorded(), '  ')).toHaveLength(2);
    expect(metricCards(recorded(), 'nothing')).toEqual([]);
    expect(nameMatches('jvm.thread.count', 'Thread')).toBe(true);
  });

  it('dates the answer by its newest point', () => {
    const later = { ...memory(), epochNanos: (memory().epochNanos ?? 0) + 1e9 };
    expect(newestEpochNanos([...recorded(), later])).toBe(later.epochNanos);
    expect(newestEpochNanos([])).toBeUndefined();
  });
});
