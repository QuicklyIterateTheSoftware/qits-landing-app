import { observabilityGoldenMasters } from '../../../testing/golden-masters';
import type { TelemetrySlowSpan, TelemetrySlowSpans } from './observability.consumes';
import {
  callLine,
  DEFAULT_THRESHOLD_MS,
  emptyReason,
  formatSpanDuration,
  hasException,
  sortOf,
  thresholdLabel,
  thresholdOf,
  THRESHOLDS_MS,
  truncationSentence,
} from './slow-spans';

/**
 * qits-observability's recorded slow spans: `GET /invoices` (SERVER, 750 ms, ERROR, an exception
 * event, `http.route=/invoices`) and `SELECT invoices` (CLIENT, 600 ms, UNSET, no attributes).
 */
const recorded = (): TelemetrySlowSpan[] =>
  observabilityGoldenMasters.body<TelemetrySlowSpans>(
    'telemetry from one platform service',
    'listSlowSpans',
  ).spans!;

const [invoices, select] = recorded();

describe('slow-spans', () => {
  it('reads ?threshold= as one of the offered floors, else the default', () => {
    expect(THRESHOLDS_MS).toEqual([500, 1000, 100, 10, 0]);
    expect(thresholdOf(null)).toBe(DEFAULT_THRESHOLD_MS);
    expect(thresholdOf('')).toBe(500);
    expect(thresholdOf('1000')).toBe(1000);
    expect(thresholdOf('0')).toBe(0);
    expect(thresholdOf('250')).toBe(500);
    expect(thresholdOf('-10')).toBe(500);
    expect(thresholdOf('fast')).toBe(500);
  });

  it('labels each floor, zero as any duration', () => {
    expect(THRESHOLDS_MS.map(thresholdLabel)).toEqual([
      '500 ms or slower',
      '1 s or slower',
      '100 ms or slower',
      '10 ms or slower',
      'Any duration',
    ]);
  });

  it('reads ?sort= as recent or, by default, duration', () => {
    expect(sortOf('recent')).toBe('recent');
    expect(sortOf('duration')).toBe('duration');
    expect(sortOf(null)).toBe('duration');
    expect(sortOf('RECENT')).toBe('duration');
  });

  it('draws a duration in ms under a second, else seconds with one decimal', () => {
    expect(formatSpanDuration(invoices.durationMs)).toBe('750 ms');
    expect(formatSpanDuration(0)).toBe('0 ms');
    expect(formatSpanDuration(12.345)).toBe('12.3 ms');
    expect(formatSpanDuration(999)).toBe('999 ms');
    expect(formatSpanDuration(1000)).toBe('1.0 s');
    expect(formatSpanDuration(1250)).toBe('1.3 s');
    expect(formatSpanDuration(61_000)).toBe('61.0 s');
    expect(formatSpanDuration(undefined)).toBe('');
  });

  it('names the call by url.full, else http.route, else nothing', () => {
    expect(callLine(invoices)).toBe('/invoices');
    expect(callLine(select)).toBe('');
    expect(
      callLine({
        attributes: { 'url.full': 'https://example.test/invoices?page=2', 'http.route': '/x' },
      }),
    ).toBe('https://example.test/invoices?page=2');
    expect(callLine({})).toBe('');
  });

  it('marks a span whose events hold an exception', () => {
    expect(hasException(invoices)).toBe(true);
    expect(hasException(select)).toBe(false);
    expect(hasException({ events: [{ exception: false }] })).toBe(false);
    expect(hasException({})).toBe(false);
  });

  it('says what a truncated answer kept, by the order it was read in', () => {
    expect(truncationSentence(200, 312, 'duration')).toBe(
      'Showing the slowest 200 of 312 matching spans',
    );
    expect(truncationSentence(200, 312, 'recent')).toBe(
      'Showing the newest 200 of 312 matching spans',
    );
  });

  it('puts an empty answer down to no spans, then the floor, then the time range', () => {
    expect(emptyReason({ sourceSpans: 0, thresholdMs: 500, sinceMinutes: 60 })).toBe('no-spans');
    expect(emptyReason({ sourceSpans: 3, thresholdMs: 500, sinceMinutes: 60 })).toBe('below-floor');
    expect(emptyReason({ sourceSpans: undefined, thresholdMs: 10, sinceMinutes: undefined })).toBe(
      'below-floor',
    );
    expect(emptyReason({ sourceSpans: 3, thresholdMs: 0, sinceMinutes: 60 })).toBe(
      'outside-window',
    );
    expect(emptyReason({ sourceSpans: 3, thresholdMs: 0, sinceMinutes: undefined })).toBe('none');
  });
});
