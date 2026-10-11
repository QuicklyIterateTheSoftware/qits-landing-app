import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * How a request's automations stand, as their cog shows it: `passed` (all fresh or waived),
 * `failed` (one failed: somebody must rerun or waive it), `running`, `pending` (none started).
 */
export type AutomationCogState = 'passed' | 'failed' | 'running' | 'pending';

const COG =
  'M10.3 2.5h3.4l.5 2.4 1.7.7 2-1.4 2.4 2.4-1.4 2 .7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.4 2-2.4 2.4-2-1.4-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2 1.4-2.4-2.4 1.4-2-.7-1.7-2.4-.5v-3.4l2.4-.5.7-1.7-1.4-2 2.4-2.4 2 1.4 1.7-.7z';

const LOOKS: Readonly<Record<AutomationCogState, string>> = {
  passed: 'fill-mint-leaf-600 stroke-mint-leaf-700',
  failed: 'fill-cinnabar-600 stroke-cinnabar-700',
  running: 'fill-ocean-deep-500 stroke-ocean-deep-700',
  pending: 'fill-white stroke-charcoal-brown-400',
};

/**
 * A request's automations as a cog: green when all are fresh or waived, blue and slowly turning
 * while some run (with how many are done, `count`), red with "!" when one failed and needs a
 * person (rerun or waive; ringed, to catch the eye), a grey outline while none has started.
 * `label` names it, and lists each automation, in its tooltip.
 */
@Component({
  selector: 'ui-automation-cog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center gap-0.5',
    '[attr.title]': 'label()',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[attr.data-cog]': 'state()',
  },
  template: `
    <span
      class="inline-flex rounded-full"
      [class]="state() === 'failed' ? 'ring-2 ring-cinnabar-400 ring-offset-1' : ''"
    >
      <svg
        viewBox="0 0 24 24"
        [class]="size() + (state() === 'running' ? ' animate-[spin_4s_linear_infinite]' : '')"
        aria-hidden="true"
      >
        <path [attr.d]="cog" [class]="look()" stroke-width="1.25" stroke-linejoin="round" />
        @if (state() === 'failed') {
          <path
            d="M12 8.5v4M12 15.25v.25"
            fill="none"
            class="stroke-white"
            stroke-width="2.25"
            stroke-linecap="round"
          />
        } @else {
          <circle
            cx="12"
            cy="12"
            r="3"
            [class]="
              state() === 'pending'
                ? 'fill-white stroke-charcoal-brown-400'
                : 'fill-white stroke-none'
            "
            stroke-width="1.25"
          />
        }
      </svg>
    </span>
    @if (count()) {
      <span class="text-[0.6875rem] leading-4 text-charcoal-brown-600">{{ count() }}</span>
    }
  `,
})
export class AutomationCog {
  readonly state = input.required<AutomationCogState>();
  /** Its name and, line by line, each automation with its state. */
  readonly label = input('');
  /** "2/3" while some run. */
  readonly count = input('');
  /** Tailwind size classes for the icon. */
  readonly size = input('size-4');

  protected readonly cog = COG;
  protected readonly look = computed(() => LOOKS[this.state()]);
}
