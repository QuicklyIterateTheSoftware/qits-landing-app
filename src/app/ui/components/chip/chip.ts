import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A chip's tone: on its way, waiting, stuck, or neutral. */
export type ChipTone = 'ok' | 'waiting' | 'failed' | 'neutral';

/** A chip's colours per tone, written out in full so Tailwind finds them. */
const TONES: Readonly<Record<ChipTone, string>> = {
  ok: 'bg-success-soft text-success-strong',
  waiting: 'bg-warning-soft text-warning-strong',
  failed: 'bg-danger-soft text-danger-strong',
  neutral: 'bg-surface-muted text-fg-soft',
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
