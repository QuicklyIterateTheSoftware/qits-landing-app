import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { tagColour } from './tag-colour';

/**
 * A small label, its background coloured from its text (`tagColour`): every tag of the same name
 * has the same colour. `vertical` writes it bottom to top.
 */
@Component({
  selector: 'ui-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-block text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-charcoal-brown-950',
    '[class]': "vertical() ? '[writing-mode:vertical-rl] rotate-180 py-2.5' : 'px-2.5'",
    '[style.background-color]': 'colour()',
  },
  template: `{{ label() }}`,
})
export class Tag {
  readonly label = input.required<string>();
  readonly vertical = input(false, { transform: booleanAttribute });

  protected readonly colour = computed(() => tagColour(this.label()));
}
