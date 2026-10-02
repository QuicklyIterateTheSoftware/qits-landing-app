import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * One item in a plain list: a short code, a title, and chips (each a short word, e.g. a kind or a
 * state). Stacks inside `ui-board-lane` when that lane is off a board. With `link`, the title is
 * a link stretched over the whole row.
 */
@Component({
  selector: 'ui-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'relative mx-1 flex items-baseline gap-3 rounded-sm bg-white px-3 py-2 text-sm' },
  template: `
    <span class="shrink-0 font-mono text-xs text-charcoal-brown-600">{{ code() }}</span>
    <span class="min-w-0 flex-1 truncate text-charcoal-brown-900">
      @if (link(); as link) {
        <a
          class="text-inherit no-underline after:absolute after:inset-0 after:rounded-sm after:transition-shadow after:duration-150 hover:after:shadow-md hover:underline"
          [routerLink]="link"
          >{{ title() }}</a
        >
      } @else {
        {{ title() }}
      }
    </span>
    @for (chip of chips(); track $index) {
      <span
        class="shrink-0 rounded-sm bg-charcoal-brown-100 px-1.5 text-[0.6875rem] text-charcoal-brown-700"
        >{{ chip }}</span
      >
    }
    <ng-content />
  `,
})
export class ListItem {
  readonly code = input('');
  readonly title = input('');
  readonly chips = input<readonly string[]>([]);
  /** Where the row leads, as a router link; none makes it plain. */
  readonly link = input<string | undefined>(undefined);
}
