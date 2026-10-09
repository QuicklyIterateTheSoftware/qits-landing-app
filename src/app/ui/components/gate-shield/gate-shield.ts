import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * How a group of gates stands, as its shield shows it: `passed`, `failed` (somebody must look),
 * `waiting` (waits for a person, an approval), `pending` (not reached, or running on its own).
 */
export type GateShieldState = 'passed' | 'failed' | 'waiting' | 'pending';

const SHIELD = 'M12 2.5 4.5 5.5v5.5c0 4.7 3.2 8.8 7.5 10.5 4.3-1.7 7.5-5.8 7.5-10.5V5.5z';

/** Colours per state: the shield's fill and outline, and what is drawn on it. */
const LOOKS: Readonly<Record<GateShieldState, { fill: string; stroke: string; mark: string }>> = {
  passed: { fill: 'fill-mint-leaf-600', stroke: 'stroke-mint-leaf-700', mark: 'stroke-white' },
  failed: { fill: 'fill-cinnabar-600', stroke: 'stroke-cinnabar-700', mark: 'stroke-white' },
  waiting: {
    fill: 'fill-sunflower-gold-400',
    stroke: 'stroke-sunflower-gold-600',
    mark: 'stroke-charcoal-brown-950',
  },
  pending: { fill: 'fill-white', stroke: 'stroke-charcoal-brown-400', mark: 'stroke-none' },
};

/**
 * A group of gates as a shield: green with a check when all passed, red and cracked when one
 * failed, amber with "!" while a person must answer, a grey outline while nothing needs anyone.
 * The two that need a person (`failed`, `waiting`) carry a ring, so they catch the eye. `label`
 * names it for assistive technology and, with its lines, in the tooltip.
 */
@Component({
  selector: 'ui-gate-shield',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 rounded-full',
    '[class]': "attention() ? 'ring-2 ring-offset-1 ' + ring() : ''",
    '[attr.title]': 'label()',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[attr.data-shield]': 'state()',
  },
  template: `
    <svg viewBox="0 0 24 24" [class]="size()" aria-hidden="true">
      <path
        [attr.d]="shield"
        [class]="look().fill + ' ' + look().stroke"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      @switch (state()) {
        @case ('passed') {
          <path
            d="m8.5 12 2.5 2.5 4.5-5"
            fill="none"
            [class]="look().mark"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        }
        @case ('failed') {
          <path
            d="M12.5 3 10.5 9.5 13.5 12 11 16.5 12 21"
            fill="none"
            [class]="look().mark"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        }
        @case ('waiting') {
          <path
            d="M12 7.5v5.5M12 16.25v.25"
            fill="none"
            [class]="look().mark"
            stroke-width="2.25"
            stroke-linecap="round"
          />
        }
      }
    </svg>
  `,
})
export class GateShield {
  readonly state = input.required<GateShieldState>();
  /** Its name and, line by line, each gate with its state. */
  readonly label = input('');
  /** Tailwind size classes for the icon. */
  readonly size = input('size-4');

  protected readonly shield = SHIELD;
  protected readonly look = computed(() => LOOKS[this.state()]);
  protected readonly attention = computed(
    () => this.state() === 'failed' || this.state() === 'waiting',
  );
  protected readonly ring = computed(() =>
    this.state() === 'failed' ? 'ring-cinnabar-400' : 'ring-sunflower-gold-400',
  );
}
