import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One item in a plain list: a short code, a title, and chips (each a short word, e.g. a kind or a
 * state). Stacks inside `ui-board-lane` when that lane is off a board.
 */
@Component({
  selector: 'ui-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-1 flex items-baseline gap-3 rounded-sm bg-white px-3 py-2 text-sm' },
  template: `
    <span class="shrink-0 font-mono text-xs text-charcoal-brown-600">{{ code() }}</span>
    <span class="min-w-0 flex-1 truncate text-charcoal-brown-900">{{ title() }}</span>
    @for (chip of chips(); track $index) {
      <span
        class="shrink-0 rounded-sm bg-charcoal-brown-100 px-1.5 text-[0.6875rem] text-charcoal-brown-700"
        >{{ chip }}</span
      >
    }
  `,
})
export class ListItem {
  readonly code = input('');
  readonly title = input('');
  readonly chips = input<readonly string[]>([]);
}
