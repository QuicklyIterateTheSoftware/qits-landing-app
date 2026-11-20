import { observabilityGoldenMasters } from '../../../testing/golden-masters';
import {
  evidenceCounts,
  exceptionText,
  firstException,
  headlineOf,
  latestOf,
  viewErrorGroup,
  viewErrorGroups,
} from './error-groups';
import type { TelemetryErrorGroup, TelemetryErrors } from './observability.consumes';

/** qits-observability's recorded group: one SERVER span with an exception event, one ERROR log. */
const recorded = (): TelemetryErrorGroup =>
  observabilityGoldenMasters.body<TelemetryErrors>(
    'telemetry from one platform service',
    'listTelemetryErrors',
  ).groups![0];

/** The recorded group's log alone, under an empty trace id: the uncorrelated group's shape. */
const uncorrelated = (): TelemetryErrorGroup => ({
  traceId: '',
  serviceName: recorded().serviceName,
  errorSpans: [],
  errorLogs: recorded().errorLogs,
});

describe('error groups', () => {
  it('heads a group with its exception as type: message', () => {
    expect(headlineOf(recorded())).toEqual({
      text: 'java.lang.IllegalStateException: invoice store unreachable',
      kind: 'exception',
    });
    expect(exceptionText(firstException(recorded().errorSpans ?? []))).toBe(
      'java.lang.IllegalStateException: invoice store unreachable',
    );
  });

  it('takes only an event the service marked as an exception', () => {
    const span = recorded().errorSpans![0];
    const event = span.events![0];
    const group = {
      ...recorded(),
      errorSpans: [{ ...span, events: [{ ...event, exception: false }] }],
    };
    expect(firstException(group.errorSpans)).toBeUndefined();
    expect(headlineOf(group)).toEqual({ text: 'invoice store unreachable', kind: 'status' });
  });

  it('falls back to the status message, then a log body, then says there is none', () => {
    const span = { ...recorded().errorSpans![0], events: [], statusMessage: 'store timed out' };
    expect(headlineOf({ ...recorded(), errorSpans: [span] })).toEqual({
      text: 'store timed out',
      kind: 'status',
    });
    const blank = { ...span, statusMessage: '  ' };
    expect(headlineOf({ ...recorded(), errorSpans: [blank] })).toEqual({
      text: 'invoice store unreachable',
      kind: 'log',
    });
    expect(headlineOf(uncorrelated()).kind).toBe('log');
    expect(
      headlineOf({ ...uncorrelated(), errorLogs: [{ ...recorded().errorLogs![0], body: '' }] }),
    ).toEqual({ text: '', kind: 'none' });
    expect(headlineOf({ traceId: '' })).toEqual({ text: '', kind: 'none' });
  });

  it('dates a group by the newest end of its evidence: a span’s start plus its duration', () => {
    // The span starts at 00:00:00.000 and lasts 750 ms; the log is stamped 00:00:00.700.
    expect(new Date(latestOf(recorded())).toISOString()).toBe('2026-01-01T00:00:00.750Z');
    expect(new Date(latestOf(uncorrelated())).toISOString()).toBe('2026-01-01T00:00:00.700Z');
    expect(latestOf({})).toBe(0);
  });

  it('counts the spans and logs, and reads the version off the evidence', () => {
    const view = viewErrorGroup(recorded());
    expect(view).toMatchObject({
      traceId: '6a1f0c2b9d8e47f3a5b4c3d2e1f00a01',
      uncorrelated: false,
      serviceName: 'qits-example',
      spanCount: 1,
      logCount: 1,
      version: '2026.1231.120000',
    });
    expect(evidenceCounts(view)).toBe('1 error span · 1 error log');
    expect(evidenceCounts(viewErrorGroup(uncorrelated()))).toBe('0 error spans · 1 error log');
    expect(viewErrorGroup({ traceId: 'x' }).version).toBe('');
  });

  it('keeps the service’s order and moves the uncorrelated group last', () => {
    const second = { ...recorded(), traceId: 'b' };
    const views = viewErrorGroups([uncorrelated(), recorded(), second]);
    expect(views.map((view) => view.traceId)).toEqual([recorded().traceId, 'b', '']);
    expect(views[2].uncorrelated).toBe(true);
    expect(viewErrorGroups([])).toEqual([]);
  });
});
