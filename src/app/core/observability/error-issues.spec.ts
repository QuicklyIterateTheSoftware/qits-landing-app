import {
  CHART_HOURS,
  hourChart,
  hourLabel,
  issueStateOf,
  issueStateTone,
  issueTitle,
  isRegressed,
  serviceSource,
  simpleType,
} from './error-issues';

describe('error issues (qits-2538)', () => {
  it('reads the state lens, OPEN for anything it does not offer', () => {
    expect(issueStateOf(null)).toBe('OPEN');
    expect(issueStateOf('dismissed')).toBe('DISMISSED');
    expect(issueStateOf('ALL')).toBe('ALL');
    expect(issueStateOf('CLOSED')).toBe('OPEN');
  });

  it('titles an issue by its simple exception type and message, else either alone', () => {
    expect(simpleType('java.lang.IllegalStateException')).toBe('IllegalStateException');
    expect(simpleType('eu.example.Outer$Inner')).toBe('Inner');
    expect(
      issueTitle({ exceptionType: 'java.lang.IllegalStateException', message: 'store down' }),
    ).toBe('IllegalStateException: store down');
    expect(issueTitle({ exceptionType: null, message: 'export failed' })).toBe('export failed');
    expect(issueTitle({ exceptionType: 'java.io.IOException', message: null })).toBe('IOException');
    expect(issueTitle({})).toBe('');
  });

  it('shows an OPEN issue with regressions as regressed, and no other', () => {
    expect(isRegressed({ state: 'OPEN', regressions: 2 })).toBe(true);
    expect(isRegressed({ state: 'OPEN', regressions: 0 })).toBe(false);
    expect(isRegressed({ state: 'DISMISSED', regressions: 2 })).toBe(false);
    expect(issueStateTone('OPEN')).toBe('failed');
    expect(issueStateTone('DISMISSED')).toBe('neutral');
  });

  it('charts seven days of hours up to the newest one seen, summing a repeated hour', () => {
    const chart = hourChart(
      [
        { hour: '2026-01-08T10:00:00Z', count: 2 },
        { hour: '2026-01-08T10:00:00Z', count: 1 },
        { hour: '2026-01-05T03:00:00Z', count: 6 },
        { hour: '2025-12-01T00:00:00Z', count: 9 },
      ],
      '2026-01-08T10:42:00Z',
    );
    expect(chart.bars).toHaveLength(CHART_HOURS);
    expect(chart.to).toBe('2026-01-08T10:00:00.000Z');
    expect(chart.from).toBe('2026-01-01T11:00:00.000Z');
    expect(chart.max).toBe(6);
    expect(chart.total).toBe(9);
    expect(chart.bars.at(-1)).toEqual({ hour: chart.to, count: 3, height: '50%' });
    expect(chart.bars.find((bar) => bar.count === 6)?.height).toBe('100%');
    expect(chart.bars[0].height).toBe('0%');
  });

  it('ends the chart at lastSeen when it is newer than every counted hour', () => {
    const chart = hourChart([{ hour: '2026-01-01T00:00:00Z', count: 1 }], '2026-01-02T05:10:00Z');
    expect(chart.to).toBe('2026-01-02T05:00:00.000Z');
    expect(chart.total).toBe(1);
  });

  it('keeps one occurrence beside a busy hour visible', () => {
    const chart = hourChart(
      [
        { hour: '2026-01-01T00:00:00Z', count: 1000 },
        { hour: '2026-01-01T01:00:00Z', count: 1 },
      ],
      undefined,
    );
    expect(chart.bars.at(-1)?.height).toBe('4%');
  });

  it('charts nothing without an hour or a last seen instant', () => {
    expect(hourChart([], null)).toEqual({ bars: [], from: '', to: '', max: 0, total: 0 });
    expect(hourChart(undefined, 'not an instant').bars).toEqual([]);
  });

  it('labels an hour in UTC, and names a service’s buffer source', () => {
    expect(hourLabel('2026-01-08T10:00:00.000Z')).toBe('2026-01-08 10:00 UTC');
    expect(hourLabel('')).toBe('');
    expect(serviceSource('qits-example')).toBe('_service/qits-example');
    expect(serviceSource(undefined)).toBe('');
  });
});
