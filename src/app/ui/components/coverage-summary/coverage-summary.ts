import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { percentText, pointsDelta, type Coverage } from '$core/ci/reports';

/**
 * A coverage report (ported from `@qits/ui-components`' `qits-coverage-report`): the total line
 * coverage and its change against the baseline release, the tools it came from, and the diff
 * coverage of the changed lines with the ones no test ran.
 */
@Component({
  selector: 'ui-coverage-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block text-sm' },
  template: `
    @let c = coverage();
    <p class="m-0">
      <strong>Total line coverage {{ percent(c.percent) }}</strong>
      <span class="text-charcoal-brown-500"> ({{ c.linesCovered }}/{{ c.linesTotal }} lines)</span>
      @if (delta(); as d) {
        <span
          class="ml-2 font-semibold"
          [class]="
            d.value < 0
              ? 'text-cinnabar-700'
              : d.value > 0
                ? 'text-mint-leaf-700'
                : 'text-charcoal-brown-700'
          "
          >{{ d.text }} vs {{ d.version }}</span
        >
      }
    </p>
    @if (c.sources.length) {
      <p class="m-0 text-xs text-charcoal-brown-500">From {{ c.sources.join(', ') }}</p>
    }
    @if (c.diff; as diff) {
      <p class="m-0 mt-1">
        <strong>Diff coverage {{ percent(diff.percent) }}</strong>
        <span class="text-charcoal-brown-500">
          ({{ diff.linesCovered }}/{{ diff.linesChanged }} changed lines covered, vs
          {{ diff.baselineVersion }})</span
        >
      </p>
      @if (diff.uncovered.length) {
        <p class="m-0 text-xs text-charcoal-brown-500">Changed lines no test ran:</p>
        <ul class="m-0 list-none p-0 pl-3 font-mono text-xs">
          @for (entry of diff.uncovered; track entry.file) {
            <li class="break-all">{{ entry.file }}: {{ entry.ranges }}</li>
          }
        </ul>
      } @else if (diff.linesChanged > 0) {
        <p class="m-0 text-xs text-charcoal-brown-500">Every changed line was covered.</p>
      } @else {
        <p class="m-0 text-xs text-charcoal-brown-500">No coverable line changed.</p>
      }
    } @else {
      <p class="m-0 text-xs text-charcoal-brown-500">
        No baseline: diff coverage needs a released version to compare with.
      </p>
    }
  `,
})
export class CoverageSummary {
  readonly coverage = input.required<Coverage>();

  protected readonly percent = percentText;
  protected readonly delta = computed(() => {
    const { percent, baseline } = this.coverage();
    if (percent === null || !baseline) return null;
    const value = percent - baseline.percent;
    return { value, text: pointsDelta(value), version: baseline.version };
  });
}
