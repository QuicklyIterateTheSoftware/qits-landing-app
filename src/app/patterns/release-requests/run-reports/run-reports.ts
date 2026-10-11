import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import type { ReportHighlight, ReportSummary } from '$core/ci/ci-reports.consumes';
import { CiReportsStore, reportKey } from '$core/ci/ci-reports.store';
import {
  COVERAGE_KIND,
  coverageOf,
  reportTitle,
  TEST_RESULTS_KIND,
  testResultsOf,
} from '$core/ci/reports';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { CoverageSummary } from '$ui/components/coverage-summary/coverage-summary';
import { Spinner } from '$ui/components/spinner/spinner';
import { TestResultsView } from '$ui/components/test-results/test-results';

/** Kinds the page reads in full, in the order it shows them; any other kind follows. */
const FULL_KINDS: readonly string[] = [TEST_RESULTS_KIND, COVERAGE_KIND];

const SEVERITY_CLASSES: Readonly<Record<string, string>> = {
  good: 'text-mint-leaf-800',
  bad: 'text-cinnabar-700',
  warn: 'text-sunflower-gold-800',
};

/**
 * One CI run's reports (ported from `@qits/ui-components`' `qits-run-reports`), read from qits-ci
 * (`CiReportsStore`): each report's title and highlights; the test results in full, failing tests
 * first (the section is `#failed-tests` when the tests failed); the coverage in full; any other
 * kind by its highlights, so a kind the backend adds shows without a change here.
 */
@Component({
  selector: 'app-run-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoverageSummary, Spinner, TestResultsView],
  host: { class: 'block' },
  template: `
    <section class="rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
      <header class="mb-1 flex flex-wrap items-baseline gap-2">
        <h2 class="m-0 text-base font-semibold">{{ title() }}</h2>
        @if (runHref(); as href) {
          <a class="text-sm text-ocean-deep-700 no-underline hover:underline" [href]="href"
            >the run in CI</a
          >
        }
      </header>
      <ui-spinner [state]="run()?.status ?? 'loading'" class="min-h-8">
        <p
          class="m-0 text-sm text-charcoal-brown-500"
          [class]="run()?.status === 'loaded' && !sections().length ? 'block' : 'hidden'"
        >
          Not reported.
        </p>
        @for (section of sections(); track section.report.id) {
          <section
            class="mt-2 scroll-mt-24 border-t border-charcoal-brown-100 pt-2 first:mt-0 first:border-t-0 first:pt-0"
            [attr.id]="section.anchor"
            [attr.data-kind]="section.report.kind"
          >
            <h3 class="m-0 mb-1 text-sm font-semibold">{{ section.title }}</h3>
            @if (section.highlights.length) {
              <ul class="m-0 mb-1 flex list-none flex-wrap gap-x-3 p-0 text-xs">
                @for (highlight of section.highlights; track $index) {
                  <li [class]="severity(highlight)">{{ highlight.text }}</li>
                }
              </ul>
            }
            @switch (section.report.kind) {
              @case ('test-results') {
                <ui-spinner [state]="section.full?.status ?? 'loading'" class="min-h-6">
                  @if (section.full?.value; as full) {
                    <ui-test-results [results]="tests(full.payload)" [runHref]="runHref()" />
                  }
                </ui-spinner>
              }
              @case ('coverage') {
                <ui-spinner [state]="section.full?.status ?? 'loading'" class="min-h-6">
                  @if (section.full?.value; as full) {
                    <ui-coverage-summary [coverage]="coverage(full.payload)" />
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
  private readonly store = inject(CiReportsStore);
  private readonly origins = inject(PlatformOrigins);

  readonly runId = input.required<string>();
  /** The section's title: "Test run reports", say. */
  readonly title = input('Reports');

  protected readonly tests = testResultsOf;
  protected readonly coverage = coverageOf;

  protected readonly run = computed(() => this.store.runs()[this.runId()]);

  protected readonly runHref = computed(() => {
    const origin = this.origins.page('ci');
    return origin ? `${origin}/runs/${encodeURIComponent(this.runId())}` : undefined;
  });

  /** The reports, the fully read kinds first, each with its payload when it is one of them. */
  protected readonly sections = computed(() => {
    const reports = this.run()?.value?.reports ?? [];
    const rank = (report: ReportSummary) => {
      const index = FULL_KINDS.indexOf(report.kind ?? '');
      return index < 0 ? FULL_KINDS.length : index;
    };
    return [...reports]
      .sort((left, right) => rank(left) - rank(right))
      .map((report) => {
        const full = FULL_KINDS.includes(report.kind ?? '')
          ? this.store.reports()[reportKey(this.runId(), report.id ?? '')]
          : undefined;
        const failing =
          report.kind === TEST_RESULTS_KIND &&
          (report.highlights ?? []).some((highlight) => highlight.severity === 'bad');
        return {
          report,
          full,
          title: reportTitle(report.kind),
          highlights: report.highlights ?? [],
          anchor: report.kind === TEST_RESULTS_KIND ? (failing ? 'failed-tests' : 'tests') : null,
        };
      });
  });

  protected severity(highlight: ReportHighlight): string {
    return SEVERITY_CLASSES[highlight.severity ?? ''] ?? 'text-charcoal-brown-600';
  }

  constructor() {
    effect(() => {
      const runId = this.runId();
      const reports = this.run()?.value?.reports ?? [];
      untracked(() => {
        this.store.loadRun(runId);
        for (const report of reports) {
          if (report.id && FULL_KINDS.includes(report.kind ?? '')) {
            this.store.loadReport(runId, report.id);
          }
        }
      });
    });
  }
}
