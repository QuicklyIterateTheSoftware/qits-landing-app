/**
 * The report kinds the release request page draws in full, read from a report's payload (JSON the
 * OpenAPI document leaves untyped, so every field is read defensively). Ported from
 * `@qits/ui-components`' `test-results-report` and `coverage-report`. Any other kind is drawn from
 * its highlights alone.
 */

/** The kind of a test results report. */
export const TEST_RESULTS_KIND = 'test-results';

/** The kind of a coverage report. */
export const COVERAGE_KIND = 'coverage';

/** Test counts. */
export interface TestTotals {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
  readonly durationMs: number | null;
}

/** One suite (a tool's run over a module). */
export interface TestSuite {
  readonly language: string;
  readonly tool: string;
  readonly module: string | null;
  readonly tests: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
}

/** One failing test. */
export interface TestFailure {
  readonly className: string;
  readonly testName: string;
  readonly file: string | null;
  readonly line: number | null;
  /** ASSERTION, ERROR, TIMEOUT or SETUP. */
  readonly shape: string;
  readonly failureType: string | null;
  /** The message, or the first line of the stack trace. */
  readonly message: string;
  readonly stackTrace: string | null;
}

/** A test results report. */
export interface TestResults {
  readonly totals: TestTotals;
  readonly suites: readonly TestSuite[];
  readonly failures: readonly TestFailure[];
  readonly truncated: boolean;
}

/** A coverage report. */
export interface Coverage {
  readonly sources: readonly string[];
  readonly percent: number | null;
  readonly linesCovered: number;
  readonly linesTotal: number;
  readonly baseline: { readonly version: string; readonly percent: number } | null;
  readonly diff: {
    readonly baselineVersion: string;
    readonly percent: number | null;
    readonly linesChanged: number;
    readonly linesCovered: number;
    readonly uncovered: readonly { readonly file: string; readonly ranges: string }[];
  } | null;
}

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const arr = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

/** A test results payload. */
export function testResultsOf(payload: unknown): TestResults {
  const body = obj(payload);
  const totals = obj(body['totals']);
  return {
    totals: {
      tests: num(totals['tests']),
      passed: num(totals['passed']),
      failed: num(totals['failed']),
      errored: num(totals['errored']),
      skipped: num(totals['skipped']),
      durationMs: numOrNull(totals['durationMs']),
    },
    suites: arr(body['suites']).map((entry) => {
      const suite = obj(entry);
      return {
        language: str(suite['language']),
        tool: str(suite['tool']),
        module: strOrNull(suite['module']),
        tests: num(suite['tests']),
        failed: num(suite['failed']),
        errored: num(suite['errored']),
        skipped: num(suite['skipped']),
      };
    }),
    failures: arr(body['failures']).map((entry) => {
      const failure = obj(entry);
      const at = obj(failure['coordinates']);
      const stackTrace = strOrNull(failure['stackTrace']);
      return {
        className: str(at['className']),
        testName: str(at['testName']),
        file: strOrNull(at['file']),
        line: numOrNull(at['lineStart']),
        shape: str(failure['shape']) || 'ERROR',
        failureType: strOrNull(failure['failureType']),
        message:
          strOrNull(failure['message'])?.split(/\r?\n/, 1)[0] ??
          stackTrace?.split(/\r?\n/, 1)[0] ??
          '',
        stackTrace,
      };
    }),
    truncated: body['truncated'] === true,
  };
}

/** Line ranges as text: `3, 7–9`. */
export function lineRanges(ranges: unknown): string {
  return arr(ranges)
    .map((range) => arr(range))
    .filter((range) => typeof range[0] === 'number')
    .map(([start, end]) => (end === undefined || end === start ? `${start}` : `${start}–${end}`))
    .join(', ');
}

/** A coverage payload. */
export function coverageOf(payload: unknown): Coverage {
  const body = obj(payload);
  const total = obj(body['total']);
  const baseline = obj(body['baselineTotal']);
  const diff = body['diff'] ? obj(body['diff']) : null;
  return {
    sources: arr(body['sources']).map((entry) => {
      const source = obj(entry);
      return `${str(source['language'])} · ${str(source['tool'])}`;
    }),
    percent: numOrNull(total['percent']),
    linesCovered: num(total['linesCovered']),
    linesTotal: num(total['linesTotal']),
    baseline:
      typeof baseline['percent'] === 'number'
        ? { version: str(baseline['version']), percent: baseline['percent'] }
        : null,
    diff: diff
      ? {
          baselineVersion: str(diff['baselineVersion']),
          percent: numOrNull(diff['percent']),
          linesChanged: num(diff['linesChanged']),
          linesCovered: num(diff['linesCovered']),
          uncovered: arr(diff['uncovered']).map((entry) => {
            const file = obj(entry);
            return { file: str(file['file']), ranges: lineRanges(file['ranges']) };
          }),
        }
      : null,
  };
}

/** A percentage to one decimal, or — for none. */
export function percentText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

/** A change in points: `+1.2`, `−0.4`, `±0.0`. */
export function pointsDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '±0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

/** A duration for reading: `44.4 s`, `2 min 5 s`. */
export function elapsed(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** A report kind's title: the known ones by name, any other from its own word. */
export function reportTitle(kind: string | undefined): string {
  switch (kind) {
    case TEST_RESULTS_KIND:
      return 'Tests';
    case COVERAGE_KIND:
      return 'Coverage';
    default: {
      const words = (kind ?? 'report').replace(/[-_]+/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}
