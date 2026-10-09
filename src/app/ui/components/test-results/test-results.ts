import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { elapsed, type TestFailure, type TestResults } from '$core/ci/reports';

/**
 * A test results report (ported from `@qits/ui-components`' `qits-test-results-report`): the
 * totals, then the failing tests first (class, test, shape, message, file and line, a link to the
 * run), then each suite. A cut-off list says so.
 */
@Component({
  selector: 'ui-test-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block text-sm' },
  template: `
    @let t = results().totals;
    <p class="m-0">
      <strong>{{ t.tests }} tests</strong> · {{ t.passed }} passed ·
      <span [class.text-cinnabar-700]="t.failed > 0" [class.font-semibold]="t.failed > 0"
        >{{ t.failed }} failed</span
      >
      ·
      <span [class.text-cinnabar-700]="t.errored > 0" [class.font-semibold]="t.errored > 0"
        >{{ t.errored }} errored</span
      >
      · {{ t.skipped }} skipped
      @if (t.durationMs !== null) {
        · {{ duration(t.durationMs) }}
      }
    </p>
    @if (results().failures.length) {
      <ul class="m-0 mt-2 flex list-none flex-col gap-1.5 p-0" aria-label="Failing tests">
        @for (failure of results().failures; track $index) {
          <li class="rounded border border-cinnabar-200 bg-cinnabar-50 px-2 py-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span
                class="rounded bg-cinnabar-600 px-1 text-[0.6875rem] leading-4 font-semibold text-white"
                >{{ failure.shape.toLowerCase() }}</span
              >
              <span class="font-mono font-semibold break-all">{{ failure.testName }}</span>
              <span class="font-mono text-xs break-all text-charcoal-brown-600">{{
                failure.className
              }}</span>
              @if (runHref(); as href) {
                <a
                  class="ml-auto text-xs text-ocean-deep-700 no-underline hover:underline"
                  [href]="href"
                  >the run in CI</a
                >
              }
            </div>
            <p class="m-0 mt-0.5 font-mono text-xs break-words text-cinnabar-900">
              {{ heading(failure) }}
            </p>
            @if (failure.file) {
              <p class="m-0 font-mono text-xs break-all text-charcoal-brown-500">
                {{ failure.file }}{{ failure.line !== null ? ':' + failure.line : '' }}
              </p>
            }
          </li>
        }
      </ul>
      @if (results().truncated) {
        <p class="m-0 mt-1 text-xs text-charcoal-brown-500">More failed than the report kept.</p>
      }
    }
    @if (results().suites.length) {
      <ul class="m-0 mt-2 list-none p-0 text-xs text-charcoal-brown-600">
        @for (suite of results().suites; track $index) {
          <li>
            {{ suite.language }} · {{ suite.tool
            }}{{ suite.module ? ' (' + suite.module + ')' : '' }} — {{ suite.tests }} tests,
            {{ suite.failed }} failed, {{ suite.errored }} errored, {{ suite.skipped }} skipped
          </li>
        }
      </ul>
    }
  `,
})
export class TestResultsView {
  readonly results = input.required<TestResults>();
  /** The run's page, for each failing test's link. */
  readonly runHref = input<string | undefined>(undefined);

  protected readonly duration = elapsed;

  /** The failure's type and message, without saying the type twice. */
  protected heading(failure: TestFailure): string {
    const { failureType: type, message } = failure;
    if (!type || message.startsWith(type)) return message || (type ?? '');
    return message ? `${type}: ${message}` : type;
  }
  protected readonly failing = computed(() => this.results().failures.length);
}
