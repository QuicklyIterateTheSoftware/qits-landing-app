import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  untracked,
} from '@angular/core';
import { QitsEntity, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { buildOfRun, BUILD_EVENTS } from '$core/ci/build-events';
import type { ReportHighlight, ReportSummary } from '$core/ci/ci-reports.consumes';
import { RUN_REPORT, RUN_REPORTS } from '$core/ci/ci.operations';
import { loadState } from '$core/resources/load-state';
import { ResourceFamily } from '$core/resources/resource-family';
import {
  COVERAGE_KIND,
  coverageOf,
  reportTitle,
  TEST_RESULTS_KIND,
  testResultsOf,
} from '$core/ci/reports';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { CoverageSummary } from '$ui/components/coverage-summary/coverage-summary';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { TestResultsView } from '$ui/components/test-results/test-results';

/** Kinds the page reads in full, in the order it shows them; any other kind follows. */
const FULL_KINDS: readonly string[] = [TEST_RESULTS_KIND, COVERAGE_KIND];

const SEVERITY_CLASSES: Readonly<Record<string, string>> = {
  good: 'text-success',
  bad: 'text-danger',
  warn: 'text-warning',
};

/**
 * One CI run's reports (ported from `@qits/ui-components`' `qits-run-reports`), read from qits-ci
 * through the component's own `qitsResource` over `RUN_REPORTS` (qits-2146), and each report of a
 * kind it draws in full through one `RUN_REPORT` read per report (a `ResourceFamily`, read once: a
 * submitted report does not change): each report's title and highlights; the test results in full, failing tests
 * first (the section is `#failed-tests` when the tests failed); the coverage in full; any other
 * kind by its highlights, so a kind the backend adds shows without a change here.
 *
 * Marks (qits-2141): the section lists the run's reports (`qitsEntityList`), each report is an
 * entity by its id, its title derived from its kind, each highlight its text.
 *
 * Staleness (qits-1270): `BUILD_EVENTS` naming this run (`buildOfRun`, the resource's `refreshOn`)
 * → its list of reports, and any newly listed report of a full kind is then read. qits-ci sends no
 * event when a report is submitted, so a report lands with the run's next status change.
 */
@Component({
  selector: 'app-run-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoverageSummary, QitsEntity, QitsEntityList, QitsField, Spinner, TestResultsView],
  host: { class: 'block' },
  template: `
    <section class="rounded-md border border-line bg-surface px-3 py-2">
      <header class="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 class="m-0 text-base font-semibold">{{ title() }}</h2>
        @if (runHref(); as href) {
          <a class="text-sm text-accent no-underline hover:underline" [href]="href"
            >the run in CI</a
          >
        }
      </header>
      <ui-spinner [state]="state()" class="min-h-8" [qitsEntityList]="reports">
        <p
          class="m-0 text-sm text-fg-muted"
          [class]="state() === 'loaded' && !sections().length ? 'block' : 'hidden'"
        >
          Not reported.
        </p>
        @for (section of sections(); track section.report.id) {
          @let report = section.report;
          <section
            class="mt-2 scroll-mt-24 border-t border-line-subtle pt-2 first:mt-0 first:border-t-0 first:pt-0"
            [attr.id]="section.anchor"
            [attr.data-kind]="report.kind"
            [qitsEntity]="report"
            entityKey="id"
          >
            <h3
              class="m-0 mb-1 text-sm font-semibold"
              [fieldOf]="report"
              [qitsField]="{ derived: ['kind'] }"
            >
              {{ titleOf(report.kind) }}
            </h3>
            @if (report.highlights?.length) {
              <ul class="m-0 mb-1 flex list-none flex-wrap gap-x-3 p-0 text-xs">
                @for (highlight of report.highlights ?? []; track $index) {
                  <li [class]="severity(highlight)" [fieldOf]="highlight" qitsField="text">
                    {{ highlight.text }}
                  </li>
                }
              </ul>
            }
            @switch (report.kind) {
              @case ('test-results') {
                <ui-spinner
                  [state]="fullState(report)"
                  class="min-h-6"
                  [fieldOf]="report"
                  [qitsField]="{ derived: ['id', 'kind'] }"
                >
                  @if (fullOf(report); as full) {
                    <ui-test-results
                      [results]="tests(full.payload)"
                      [runHref]="runHref()"
                      [fieldOf]="report"
                      [qitsField]="{ derived: [] }"
                    />
                  }
                </ui-spinner>
              }
              @case ('coverage') {
                <ui-spinner
                  [state]="fullState(report)"
                  class="min-h-6"
                  [fieldOf]="report"
                  [qitsField]="{ derived: ['id', 'kind'] }"
                >
                  @if (fullOf(report); as full) {
                    <ui-coverage-summary
                      [coverage]="coverage(full.payload)"
                      [fieldOf]="report"
                      [qitsField]="{ derived: [] }"
                    />
                  }
                </ui-spinner>
              }
            }
          </section>
        }
      </ui-spinner>
    </section>
  `,
})
export class RunReports {
  private readonly origins = inject(PlatformOrigins);
  private readonly injector = inject(Injector);

  readonly runId = input.required<string>();
  /** The section's title: "Test run reports", say. */
  readonly title = input('Reports');

  protected readonly tests = testResultsOf;
  protected readonly coverage = coverageOf;
  protected readonly titleOf = reportTitle;

  /** The run's reports; read again after a build event naming the run. */
  protected readonly reports = qitsResource(
    RUN_REPORTS,
    () => {
      const runId = this.runId();
      return runId ? { path: { runId } } : undefined;
    },
    { refreshOn: { names: BUILD_EVENTS, when: (event) => buildOfRun(event, this.runId()) } },
  );

  /** Each report of a kind drawn in full, with its payload, by `<run id>/<report id>`; read once. */
  private readonly full = new ResourceFamily(RUN_REPORT, this.injector);

  protected readonly state = computed(() => loadState(this.reports));

  protected readonly runHref = computed(() => {
    const origin = this.origins.page('ci');
    return origin ? `${origin}/runs/${encodeURIComponent(this.runId())}` : undefined;
  });

  /** The listed reports, once read. */
  private readonly listed = computed(
    (): readonly ReportSummary[] =>
      (this.reports.hasValue() ? this.reports.value()?.reports : undefined) ?? [],
  );

  /** The reports, the fully read kinds first, each with its payload when it is one of them. */
  protected readonly sections = computed(() => {
    const rank = (report: ReportSummary) => {
      const index = FULL_KINDS.indexOf(report.kind ?? '');
      return index < 0 ? FULL_KINDS.length : index;
    };
    return [...this.listed()]
      .sort((left, right) => rank(left) - rank(right))
      .map((report) => {
        const failing =
          report.kind === TEST_RESULTS_KIND &&
          (report.highlights ?? []).some((highlight) => highlight.severity === 'bad');
        return {
          report,
          anchor: report.kind === TEST_RESULTS_KIND ? (failing ? 'failed-tests' : 'tests') : null,
        };
      });
  });

  /** The full read of `report`, once one of a kind drawn in full is asked for. */
  private fullRead(report: ReportSummary) {
    return FULL_KINDS.includes(report.kind ?? '')
      ? this.full.get(`${this.runId()}/${report.id ?? ''}`)
      : undefined;
  }

  /** How `report`'s full read stands, as its spinner shows it. */
  protected fullState(report: ReportSummary): LoadState {
    const read = this.fullRead(report);
    return read ? loadState(read) : 'loading';
  }

  /** `report` with its payload, once read. */
  protected fullOf(report: ReportSummary) {
    const read = this.fullRead(report);
    return read?.hasValue() ? read.value() : undefined;
  }

  protected severity(highlight: ReportHighlight): string {
    return SEVERITY_CLASSES[highlight.severity ?? ''] ?? 'text-fg-soft';
  }

  constructor() {
    // Each listed report of a full kind is read once, made outside a reactive context.
    effect(() => {
      const runId = this.runId();
      const reports = this.listed();
      untracked(() => {
        for (const report of reports) {
          if (report.id && FULL_KINDS.includes(report.kind ?? '')) {
            this.full.read(`${runId}/${report.id}`, { path: { runId, reportId: report.id } });
          }
        }
      });
    });
  }
}
