import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A card's header as a strip down its left edge: the id written bottom to top, in the project
 * card's heading colours. It runs the card's full height and is just wide enough for the id.
 */
@Component({
  selector: 'ui-id-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex shrink-0 items-center justify-center bg-charcoal-brown-100 px-0.5 py-1.5 font-mono text-[0.625rem] leading-none text-charcoal-brown-900',
  },
  template: `<span class="rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{{
    id()
  }}</span>`,
})
export class IdStrip {
  readonly id = input.required<string>();
}
