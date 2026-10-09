import type {
  GetCiApiRunsByRunIdReportsByReportIdResponses,
  GetCiApiRunsByRunIdReportsResponses,
} from '../../api/ci';
import type { Consumed } from '@qits/angular';

/**
 * What `CiReportsStore` reads from qits-ci's run reports. The store passes these to `consume(...)`,
 * and its pact spec binds exactly them.
 */

/** A run's reports: each one's kind and highlights, and the baseline they compare with. */
export const LIST_RUN_REPORTS = [
  'runId',
  'baseline.version',
  'reports[].id',
  'reports[].kind',
  'reports[].kindVersion',
  'reports[].stepIndex',
  'reports[].highlights[].severity',
  'reports[].highlights[].text',
  'reports[].highlights[].metric',
  'reports[].highlights[].value',
  'reports[].highlights[].delta',
] as const;

/** One report with its payload, read for the kinds the page draws in full (tests, coverage). */
export const GET_RUN_REPORT = ['id', 'kind', 'kindVersion', 'payload'] as const;

/** The reports answer. */
export type RunReports = Consumed<
  GetCiApiRunsByRunIdReportsResponses[200],
  typeof LIST_RUN_REPORTS
>;

/** One report's summary. */
export type ReportSummary = NonNullable<RunReports['reports']>[number];

/** One highlight of a report. */
export type ReportHighlight = NonNullable<ReportSummary['highlights']>[number];

/** One report, with its payload. */
export type RunReport = Consumed<
  GetCiApiRunsByRunIdReportsByReportIdResponses[200],
  typeof GET_RUN_REPORT
>;
