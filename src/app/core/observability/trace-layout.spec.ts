import { observabilityGoldenMasters } from '../../../testing/golden-masters';
import type {
  TelemetryTrace,
  TelemetryTraceLog,
  TelemetryTraceSpan,
} from './observability.consumes';
import {
  EMPTY_WATERFALL,
  indentLevels,
  layOutTrace,
  MAX_INDENT_DEPTH,
  traceDuration,
  traceOffset,
  traceSummary,
} from './trace-layout';

/**
 * The waterfall's rules (qits-2343, ported from the retired frontend's `trace-layout.spec.ts`),
 * asserted on the function rather than through the DOM: a client span whose server parent sits in
 * another source, a span reported as `0` ms, a trace whose root was evicted, a parent cycle. Each
 * fails silently on screen, so a pure function is what lets a spec put the shape in and read the
 * decision out. The recorded trace (qits-observability's "telemetry from one platform service")
 * is the first case.
 */
describe('layOutTrace', () => {
  const NANOS = 1_000_000;
  const START = 1_785_592_193_983_999_744;

  const span = (over: Partial<TelemetryTraceSpan> = {}): TelemetryTraceSpan => ({
    spanId: '1111111111111111',
    parentSpanId: '',
    serviceName: 'qits-fixture',
    scopeName: 'cj-fixture',
    name: 'POST /fixture/uploads',
    kind: 'SERVER',
    startEpochNanos: START,
    durationMs: 812,
    status: 'UNSET',
    statusMessage: '',
    attributes: {},
    resourceAttributes: { 'service.version': '2026.802.164102' },
    events: [],
    ...over,
  });

  const log = (over: Partial<TelemetryTraceLog> = {}): TelemetryTraceLog => ({
    epochNanos: START,
    severityText: 'INFO',
    body: 'writing blob 41ab to the store',
    spanId: '2222222222222222',
    ...over,
  });

  /** A root, two children, and an orphan whose parent is in no buffer here. */
  function measuredTrace(): readonly TelemetryTraceSpan[] {
    return [
      span(),
      span({
        spanId: '3333333333333333',
        parentSpanId: '1111111111111111',
        name: 'cache lookup',
        kind: 'INTERNAL',
        startEpochNanos: START + 1 * NANOS,
        durationMs: 0,
      }),
      span({
        spanId: '2222222222222222',
        parentSpanId: '1111111111111111',
        name: 'BlobStore.put',
        kind: 'INTERNAL',
        startEpochNanos: START + 4 * NANOS,
        durationMs: 796,
        status: 'ERROR',
        statusMessage: 'the blob store said no',
        events: [
          {
            name: 'exception',
            epochNanos: START + 799 * NANOS,
            exception: true,
            attributes: { 'exception.type': 'java.lang.IllegalStateException' },
          },
        ],
      }),
      span({
        spanId: '4444444444444444',
        parentSpanId: '9999999999999999',
        name: 'GET /fixture/blob',
        kind: 'CLIENT',
        startEpochNanos: START + 10 * NANOS,
        durationMs: 30,
      }),
    ];
  }

  it('lays out the recorded trace: the SERVER root, its CLIENT child below it', () => {
    const { trace } = observabilityGoldenMasters.body<TelemetryTrace>(
      'telemetry from one platform service',
      'getTelemetryTrace',
    );
    const layout = layOutTrace(trace!.spans!, trace!.logs!);
    expect(layout.rows.map((row) => [row.span.name, row.depth, row.parentMissing])).toEqual([
      ['GET /invoices', 0, false],
      ['SELECT invoices', 1, false],
    ]);
    expect(layout.windowMs).toBeCloseTo(750, 3);
    expect(layout.rows[1].leftPercent).toBeCloseTo((50 / 750) * 100, 3);
    expect(layout.rows[1].widthPercent).toBeCloseTo((600 / 750) * 100, 3);
    expect(layout.rows[0].isError).toBe(true);
    expect(layout.rows[0].hasException).toBe(true);
    expect(layout.rows[0].logCount).toBe(2);
    expect(layout.rows[1].logCount).toBe(0);
    expect(layout.rootMissing).toBe(false);
    expect(layout.services).toEqual(['qits-example']);
    expect(layout.errorCount).toBe(1);
  });

  it('nests by parentSpanId and orders siblings by when they started', () => {
    const names = layOutTrace(measuredTrace()).rows.map(
      (row) => `${'  '.repeat(row.depth)}${row.span.name}`,
    );
    expect(names).toEqual([
      'POST /fixture/uploads',
      '  cache lookup',
      '  BlobStore.put',
      'GET /fixture/blob',
    ]);
  });

  it('orders siblings that started together by spanId', () => {
    const layout = layOutTrace([
      span(),
      span({ spanId: 'bbbb', parentSpanId: '1111111111111111', name: 'B' }),
      span({ spanId: 'aaaa', parentSpanId: '1111111111111111', name: 'A' }),
    ]);
    expect(layout.rows.map((row) => row.span.name)).toEqual(['POST /fixture/uploads', 'A', 'B']);
  });

  it('draws a span whose parent is not buffered at the top level, and never re-parents it', () => {
    const layout = layOutTrace(measuredTrace());
    const orphan = layout.rows.find((row) => row.span.spanId === '4444444444444444');
    expect(orphan?.depth).toBe(0);
    expect(orphan?.parentMissing).toBe(true);
    expect(orphan?.span.parentSpanId).toBe('9999999999999999');

    const child = layout.rows.find((row) => row.span.spanId === '2222222222222222');
    expect(child?.parentMissing).toBe(false);
    expect(child?.depth).toBe(1);
  });

  it('keeps a sub-millisecond span in the list with an honest zero width', () => {
    const tiny = layOutTrace(measuredTrace()).rows.find((row) => row.span.name === 'cache lookup');
    expect(tiny?.span.durationMs).toBe(0);
    expect(tiny?.widthPercent).toBe(0);
  });

  it('places bars as percentages of the trace’s own window', () => {
    const layout = layOutTrace(measuredTrace());
    expect(layout.windowMs).toBeCloseTo(812, 3);
    expect(layout.startEpochNanos).toBe(START);
    expect(layout.rows[0].leftPercent).toBe(0);
    expect(layout.rows[0].widthPercent).toBeCloseTo(100, 6);
    const child = layout.rows.find((row) => row.span.spanId === '2222222222222222')!;
    expect(child.leftPercent).toBeCloseTo((4 / 812) * 100, 6);
    expect(child.widthPercent).toBeCloseTo((796 / 812) * 100, 6);
  });

  it('never lets a bar run past the right edge of its track', () => {
    const layout = layOutTrace([
      span({ durationMs: 10 }),
      span({
        spanId: '2222222222222222',
        parentSpanId: '1111111111111111',
        startEpochNanos: START + 9 * NANOS,
        durationMs: 1,
      }),
    ]);
    for (const row of layout.rows) {
      expect(row.leftPercent).toBeGreaterThanOrEqual(0);
      expect(row.leftPercent + row.widthPercent).toBeLessThanOrEqual(100.000001);
    }
  });

  it('flags a trace with no root span, rather than presenting the earliest as one', () => {
    const layout = layOutTrace(measuredTrace().filter((one) => one.parentSpanId !== ''));
    expect(layout.rootMissing).toBe(true);
    expect(layout.rows).toHaveLength(3);
    expect(layout.rows.every((row) => row.parentMissing)).toBe(true);
  });

  it('does not flag rootMissing when a root is buffered, even beside an orphan', () => {
    const layout = layOutTrace(measuredTrace());
    expect(layout.rootMissing).toBe(false);
    expect(layout.rows.some((row) => row.parentMissing)).toBe(true);
  });

  it('lays out a single zero-length span without dividing by zero', () => {
    const layout = layOutTrace([span({ durationMs: 0 })]);
    expect(layout.rows).toHaveLength(1);
    expect(layout.windowMs).toBe(0);
    expect(layout.rows[0].leftPercent).toBe(0);
    expect(layout.rows[0].widthPercent).toBe(0);
  });

  it('gives a single span with a real duration a full-width bar, despite nanosecond precision', () => {
    expect(Number.isSafeInteger(START)).toBe(false);
    const layout = layOutTrace([span({ durationMs: 42 })]);
    expect(Math.abs(layout.windowMs - 42)).toBeLessThan(0.001);
    expect(layout.rows[0].widthPercent).toBeCloseTo(100, 2);
  });

  it('draws every buffered span once, without hanging, when the parents form a cycle', () => {
    const layout = layOutTrace([
      span({ spanId: 'aaaa', parentSpanId: 'bbbb', name: 'A' }),
      span({ spanId: 'bbbb', parentSpanId: 'aaaa', name: 'B' }),
      span({ spanId: 'cccc', parentSpanId: 'bbbb', name: 'C' }),
    ]);
    expect(layout.rows.map((row) => row.span.name).sort()).toEqual(['A', 'B', 'C']);
    expect(new Set(layout.rows.map((row) => row.span.spanId)).size).toBe(3);
    expect(layout.rows.filter((row) => row.depth === 0).every((row) => row.parentMissing)).toBe(
      true,
    );
  });

  it('treats a span that names itself as its own parent as top level', () => {
    const layout = layOutTrace([span({ spanId: 'aaaa', parentSpanId: 'aaaa' })]);
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].depth).toBe(0);
    expect(layout.rows[0].parentMissing).toBe(true);
  });

  it('walks a deep chain without recursion', () => {
    const chain = Array.from({ length: 5000 }, (_, index) =>
      span({
        spanId: `s${index}`,
        parentSpanId: index === 0 ? '' : `s${index - 1}`,
        startEpochNanos: START + index * NANOS,
        durationMs: 1,
      }),
    );
    const layout = layOutTrace(chain);
    expect(layout.rows).toHaveLength(5000);
    expect(layout.rows[4999].depth).toBe(4999);
    expect(indentLevels(layout.rows[4999].depth)).toBe(MAX_INDENT_DEPTH);
  });

  it('reads the exception flag from the service rather than from the event name', () => {
    const layout = layOutTrace(measuredTrace());
    const failing = layout.rows.find((row) => row.span.spanId === '2222222222222222');
    expect(failing?.hasException).toBe(true);
    expect(failing?.isError).toBe(true);
    expect(layout.errorCount).toBe(1);
  });

  it('counts the logs that name each span, and ignores the ones that name none', () => {
    const layout = layOutTrace(measuredTrace(), [
      log(),
      log({ severityText: 'ERROR' }),
      log({ spanId: '' }),
    ]);
    const failing = layout.rows.find((row) => row.span.spanId === '2222222222222222');
    expect(failing?.logCount).toBe(2);
    expect(layout.rows.find((row) => row.span.name === 'cache lookup')?.logCount).toBe(0);
  });

  it('lists the services in the order they first appear', () => {
    const layout = layOutTrace([
      span({ serviceName: 'qits-gateway' }),
      span({ spanId: '2222', parentSpanId: '1111111111111111', serviceName: 'qits-artifacts' }),
      span({ spanId: '3333', parentSpanId: '1111111111111111', serviceName: 'qits-gateway' }),
    ]);
    expect(layout.services).toEqual(['qits-gateway', 'qits-artifacts']);
  });

  it('answers the empty layout for a trace with no spans', () => {
    expect(layOutTrace([])).toBe(EMPTY_WATERFALL);
  });
});

describe('trace formatting', () => {
  it('says <1 ms for a zero, ms under a second, seconds above', () => {
    expect(traceDuration(0)).toBe('<1 ms');
    expect(traceDuration(1)).toBe('1 ms');
    expect(traceDuration(812)).toBe('812 ms');
    expect(traceDuration(1500)).toBe('1.50 s');
    expect(traceDuration(65_000)).toBe('65.0 s');
    expect(traceDuration(undefined)).toBe('');
  });

  it('says an instant’s offset into the trace in whole milliseconds', () => {
    expect(traceOffset(1_000_050_000_000, 1_000_000_000_000)).toBe('+50 ms');
    expect(traceOffset(1_001_250_000_000, 1_000_000_000_000)).toBe('+1,250 ms');
    expect(traceOffset(999_000_000, 1_000_000_000)).toBe('+0 ms');
    expect(traceOffset(undefined, 0)).toBe('');
  });

  it('caps the indent at twelve levels', () => {
    expect(indentLevels(0)).toBe(0);
    expect(indentLevels(12)).toBe(12);
    expect(indentLevels(40)).toBe(12);
  });
});

describe('traceSummary', () => {
  it('counts spans, services and error spans beside the total duration', () => {
    const { trace } = observabilityGoldenMasters.body<TelemetryTrace>(
      'telemetry from one platform service',
      'getTelemetryTrace',
    );
    expect(traceSummary(layOutTrace(trace!.spans!))).toBe(
      '2 spans · 1 service · 750 ms · 1 error span',
    );
  });

  it('leaves the error count out when nothing failed', () => {
    const { trace } = observabilityGoldenMasters.body<TelemetryTrace>(
      'telemetry from one platform service',
      'getTelemetryTrace',
    );
    const [, select] = trace!.spans!;
    expect(traceSummary(layOutTrace([{ ...select, parentSpanId: '' }]))).toBe(
      '1 span · 1 service · 600 ms',
    );
  });
});
