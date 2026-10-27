import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { ActiveRun } from '$core/ci/active-runs';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { chipClass } from '$ui/components/chip/chip';

/**
 * A release request's active CI runs (`activeRunsOf`): per run a small chip, a dot and "CI
 * running", "Automation queued"…, linking to the run's page in qits-ci (`<ci origin>/runs/<id>`).
 * The dot pulses while the run holds a slot. Nothing when no run is active.
 */
@Component({
  selector: 'app-active-runs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "runs().length ? 'flex flex-wrap items-center gap-1' : 'hidden'" },
  template: `
    @for (run of runs(); track run.runId) {
      <a
        class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap no-underline hover:underline"
        [class]="chip"
        [attr.href]="href(run.runId)"
        [title]="run.label + ': open the run in CI'"
        data-active-run
        ><span
          aria-hidden="true"
          class="size-1.5 rounded-full bg-sunflower-gold-600"
          [class.animate-pulse]="run.status === 'RUNNING'"
        ></span
        >{{ run.label }}</a
      >
    }
  `,
})
export class ActiveRuns {
  private readonly origins = inject(PlatformOrigins);

  readonly runs = input.required<readonly ActiveRun[]>();

  protected readonly chip = chipClass('waiting');

  protected href(runId: string): string | null {
    const origin = this.origins.page('ci');
    return origin ? `${origin}/runs/${encodeURIComponent(runId)}` : null;
  }
}
