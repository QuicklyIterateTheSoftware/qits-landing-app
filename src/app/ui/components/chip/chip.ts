import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A chip's tone: on its way, waiting, stuck, or neutral. */
export type ChipTone = 'ok' | 'waiting' | 'failed' | 'neutral';

/** A chip's colours per tone, written out in full so Tailwind finds them. */
const TONES: Readonly<Record<ChipTone, string>> = {
  ok: 'bg-mint-leaf-100 text-mint-leaf-800',
  waiting: 'bg-sunflower-gold-100 text-sunflower-gold-800',
  failed: 'bg-cinnabar-100 text-cinnabar-700',
  neutral: 'bg-charcoal-brown-100 text-charcoal-brown-700',
};

/** The colour classes of a chip in `tone`, for markup that draws a chip without the component. */
export function chipClass(tone: ChipTone): string {
  return TONES[tone];
}

/** A small rounded label coloured by its tone: a state, a gate, a priority. */
@Component({
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // No display class of its own, so a user can hide it with `hidden`.
  host: {
    class: 'shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap',
    '[class]': 'colours()',
  },
  template: `{{ label() }}`,
})
export class Chip {
  readonly label = input.required<string>();
  readonly tone = input<ChipTone>('neutral');

  protected readonly colours = computed(() => TONES[this.tone()]);
}
