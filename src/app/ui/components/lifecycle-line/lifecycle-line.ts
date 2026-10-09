import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StepState, SummaryPoint } from '$core/release-requests/release-lifecycle';
import {
  AutomationCog,
  type AutomationCogState,
} from '$ui/components/automation-cog/automation-cog';
import { chipClass, type ChipTone } from '$ui/components/chip/chip';
import { GateShield } from '$ui/components/gate-shield/gate-shield';

/** A lifecycle point's state as a chip tone. */
const TONES: Readonly<Record<StepState, ChipTone>> = {
  passed: 'ok',
  running: 'waiting',
  pending: 'neutral',
  failed: 'failed',
  cancelled: 'failed',
  skipped: 'neutral',
  unknown: 'waiting',
  'not-reported': 'neutral',
};

/**
 * A release request's lifecycle as one compact line (`lifecycleSummary`): the automations as a cog,
 * each phase as a chip, each group of gates as a shield. Every point names itself and its state in
 * its tooltip.
 */
@Component({
  selector: 'ui-lifecycle-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutomationCog, GateShield],
  host: { class: 'flex flex-wrap items-center gap-1', 'aria-label': 'Lifecycle' },
  template: `
    @for (point of points(); track point.key) {
      @switch (point.kind) {
        @case ('chip') {
          <span
            class="rounded px-1.5 text-[0.6875rem] leading-4"
            [class]="chip(point.state)"
            [title]="point.title"
            >{{ point.label }}</span
          >
        }
        @case ('cog') {
          <ui-automation-cog
            [state]="cog(point.state)"
            [count]="point.count ?? ''"
            [label]="point.title"
          />
        }
        @default {
          <ui-gate-shield [state]="point.shield" [label]="point.title" />
        }
      }
    }
  `,
})
export class LifecycleLine {
  readonly points = input.required<readonly SummaryPoint[]>();

  protected chip(state: StepState): string {
    return chipClass(TONES[state]);
  }

  protected cog(state: StepState): AutomationCogState {
    return state === 'passed' || state === 'failed' || state === 'running' ? state : 'pending';
  }
}
