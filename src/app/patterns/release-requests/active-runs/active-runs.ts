import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { QitsExit } from '@qits/angular';
import type { ActiveRun } from '$core/ci/active-runs';
import { CiRunLinks } from '$core/ci/ci-run-links';
import { chipClass } from '$ui/components/chip/chip';

/**
 * A release request's active CI runs (`activeRunsOf`): per run a small chip, a dot and "CI
 * running", "Automation queued"…, linking to the run's page (`CiRunLinks`, qits-2321).
 * The dot pulses while the run holds a slot. Nothing when no run is active.
 */
@Component({
  selector: 'app-active-runs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit],
  host: { '[class]': "runs().length ? 'flex flex-wrap items-center gap-1' : 'hidden'" },
  template: `
    @for (run of runs(); track run.runId) {
      <a
        class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap no-underline hover:underline"
        [class]="chip"
        [qitsExit]="links.opening.run"
        [exitParams]="links.params(run.runId)"
        [title]="run.label + ': open the run'"
        data-active-run
        ><span
          aria-hidden="true"
          class="size-1.5 rounded-full bg-warning-fill"
          [class.animate-pulse]="run.status === 'RUNNING'"
        ></span
        >{{ run.label }}</a
      >
    }
  `,
})
export class ActiveRuns {
  protected readonly links = inject(CiRunLinks);

  readonly runs = input.required<readonly ActiveRun[]>();

  protected readonly chip = chipClass('waiting');
}
