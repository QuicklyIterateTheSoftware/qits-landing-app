import {
  coverageOf,
  elapsed,
  lineRanges,
  percentText,
  pointsDelta,
  reportTitle,
  testResultsOf,
} from './reports';

// Pure parsing, so hand-built payloads in the shape qits-ci stores (seen on a live run).

describe('report payloads', () => {
  it('reads a test results payload, the failing tests with their place and message', () => {
    const results = testResultsOf({
      totals: { tests: 456, passed: 455, failed: 0, errored: 1, skipped: 0, durationMs: 44448 },
      suites: [{ language: 'java', tool: 'surefire', module: 'domain', tests: 434, errored: 1 }],
      failures: [
        {
          coordinates: {
            className: 'eu.x.WorkspaceTest',
            testName: 'aStopEndsTheStart',
            file: 'domain/src/test/java/eu/x/WorkspaceTest.java',
            lineStart: 313,
          },
          shape: 'ERROR',
          failureType: 'java.util.ConcurrentModificationException',
          message: null,
          stackTrace: 'java.util.ConcurrentModificationException\n\tat java.base/...',
        },
      ],
      truncated: false,
    });
    expect(results.totals).toEqual({
      tests: 456,
      passed: 455,
      failed: 0,
      errored: 1,
      skipped: 0,
      durationMs: 44448,
    });
    expect(results.suites[0]).toMatchObject({ module: 'domain', failed: 0, errored: 1 });
    expect(results.failures[0]).toMatchObject({
      className: 'eu.x.WorkspaceTest',
      testName: 'aStopEndsTheStart',
      line: 313,
      shape: 'ERROR',
      message: 'java.util.ConcurrentModificationException',
    });
  });

  it('reads anything missing or of the wrong type as nothing, never as a crash', () => {
    expect(testResultsOf(null)).toEqual({
      totals: { tests: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: null },
      suites: [],
      failures: [],
      truncated: false,
    });
    expect(coverageOf('x')).toMatchObject({ percent: null, diff: null, baseline: null });
  });

  it('reads a coverage payload with its diff against the baseline', () => {
    const coverage = coverageOf({
      sources: [{ language: 'java', tool: 'jacoco' }],
      total: { linesCovered: 353, linesTotal: 1000, percent: 35.3 },
      baselineTotal: { version: '2026.1009.122548', percent: 41.3 },
      diff: {
        baselineVersion: '2026.1009.122548',
        linesChanged: 4,
        linesCovered: 0,
        percent: 0,
        uncovered: [
          {
            file: 'A.java',
            ranges: [
              [3, 3],
              [7, 9],
            ],
          },
        ],
      },
    });
    expect(coverage).toMatchObject({
      sources: ['java · jacoco'],
      percent: 35.3,
      baseline: { version: '2026.1009.122548', percent: 41.3 },
      diff: { linesChanged: 4, uncovered: [{ file: 'A.java', ranges: '3, 7–9' }] },
    });
  });

  it('formats percentages, deltas, ranges and durations', () => {
    expect([percentText(35.25), percentText(null)]).toEqual(['35.3%', '—']);
    expect([pointsDelta(-6), pointsDelta(1.24), pointsDelta(0.01)]).toEqual([
      '−6.0',
      '+1.2',
      '±0.0',
    ]);
    expect(lineRanges([[1], [2, 4]])).toBe('1, 2–4');
    expect([elapsed(44448), elapsed(125_000)]).toEqual(['44.4 s', '2 min 5 s']);
  });

  it('titles the known kinds, and any other from its own word', () => {
    expect(['test-results', 'coverage', 'entity-changes', undefined].map(reportTitle)).toEqual([
      'Tests',
      'Coverage',
      'Entity changes',
      'Report',
    ]);
  });
});
