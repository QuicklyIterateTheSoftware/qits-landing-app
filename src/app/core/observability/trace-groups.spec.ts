import { observabilityGoldenMasters } from '../../../testing/golden-masters';
import type { TelemetryTraceSummary, TelemetryTraces } from './observability.consumes';
import { groupKey, viewTraceGroups } from './trace-groups';

/**
 * qits-observability's recorded traces, newest first: `GET /health` (route `/health`, 5 ms, 1 span)
 * and `GET /invoices` (route `/invoices`, 750 ms, 2 spans, 1 error span, an exception).
 */
const recorded = (): TelemetryTraceSummary[] =>
  observabilityGoldenMasters.body<TelemetryTraces>(
    'telemetry from one platform service',
    'listTelemetryTraces',
  ).traces!;

/**
 * The fold the grouped list is drawn from (qits-2342, ported from the retired frontend's
 * `trace-group.spec.ts`), asserted directly rather than through the DOM.
 */
describe('trace groups', () => {
  /** The recorded `GET /invoices` trace, changed by `over`. */
  const trace = (over: Partial<TelemetryTraceSummary> = {}): TelemetryTraceSummary => ({
    ...recorded()[1],
    ...over,
  });

  it('keys on the route, and only falls back to the span name where there is none', () => {
    expect(groupKey(trace())).toBe('/invoices');
    expect(groupKey(trace({ rootRoute: undefined, rootName: 'consume orders' }))).toBe(
      'consume orders',
    );
    expect(groupKey(trace({ rootRoute: '', rootName: 'consume orders' }))).toBe('consume orders');
    expect(groupKey(trace({ rootRoute: undefined, rootName: '' }))).toBe('(unnamed span)');
    expect(groupKey({})).toBe('(unnamed span)');
  });

  it('keeps the recorded answer as one group per path, newest first', () => {
    const groups = viewTraceGroups(recorded());
    expect(groups.map((group) => group.key)).toEqual(['/health', '/invoices']);
    expect(groups[1].erroredTraces).toBe(1);
    expect(groups[1].hasException).toBe(true);
    expect(groups[1].maxDurationMs).toBe(750);
    expect(groups[0].erroredTraces).toBe(0);
    expect(groups[0].hasException).toBe(false);
  });

  it('folds GET and POST of one path into one entry: the path is the key, not the name', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'a', rootName: 'GET /invoices' }),
      trace({ traceId: 'b', rootName: 'POST /invoices' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe('/invoices');
    expect(groups[0].routed).toBe(true);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['a', 'b']);
  });

  it('keeps the server’s order: groups by first appearance, members untouched inside', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'newest', rootRoute: '/b' }),
      trace({ traceId: 'older', rootRoute: '/a' }),
      trace({ traceId: 'oldest', rootRoute: '/b' }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['/b', '/a']);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['newest', 'oldest']);
  });

  it('summarises the figures a collapsed row draws', () => {
    const groups = viewTraceGroups([
      trace({
        traceId: 'a',
        durationMs: 20,
        startEpochNanos: 1_000_000_000,
        errorSpanCount: 2,
        hasException: true,
        services: ['svc'],
      }),
      trace({
        traceId: 'b',
        durationMs: 800,
        startEpochNanos: 5_000_000_000,
        errorSpanCount: 0,
        hasException: false,
        services: ['svc', 'other'],
      }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].erroredTraces).toBe(1);
    expect(groups[0].hasException).toBe(true);
    expect(groups[0].maxDurationMs).toBe(800);
    expect(groups[0].latestStartEpochNanos).toBe(5_000_000_000);
    expect(groups[0].services).toEqual(['svc', 'other']);
  });

  it('reads a field the answer leaves out as nothing', () => {
    const groups = viewTraceGroups([{ traceId: 'bare' }]);
    expect(groups).toEqual([
      {
        key: '(unnamed span)',
        routed: false,
        traces: [{ traceId: 'bare' }],
        erroredTraces: 0,
        hasException: false,
        maxDurationMs: 0,
        latestStartEpochNanos: 0,
        services: [],
      },
    ]);
  });

  it('groups a rootless trace by its stand-in span’s route, matching what its row says', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'whole' }),
      trace({ traceId: 'rootless', rootMissing: true }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].traces.map((member) => member.traceId)).toEqual(['whole', 'rootless']);
  });

  it('is routed once any member carries a route, whichever member arrived first', () => {
    const groups = viewTraceGroups([
      trace({ traceId: 'a', rootRoute: undefined, rootName: '/invoices' }),
      trace({ traceId: 'b', rootRoute: '/invoices', rootName: 'GET /invoices' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].routed).toBe(true);
  });
});
