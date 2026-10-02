import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IdStrip } from '../id-strip/id-strip';

/**
 * One item in a plain list: its code down the left edge (`ui-id-strip`), a title, and chips (each a short word, e.g. a kind or a
 * state). Stacks inside `ui-board-lane` when that lane is off a board. With `link`, the title is
 * a link stretched over the whole row; hovering it shadows the row itself.
 */
@Component({
  selector: 'ui-list-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IdStrip],
  host: {
    class:
      'relative mx-1 flex overflow-hidden transition-shadow duration-150 has-[a:hover]:shadow-md rounded-sm bg-white text-sm',
  },
  template: `
    <ui-id-strip [id]="code()" />
    <div class="flex min-w-0 flex-1 items-baseline gap-3 px-3 py-2">
      <span class="min-w-0 flex-1 truncate text-charcoal-brown-900">
        @if (link(); as link) {
          <a
            class="text-inherit no-underline after:absolute after:inset-0 hover:underline"
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
    </div>
  `,
})
export class ListItem {
  readonly code = input('');
  readonly title = input('');
  readonly chips = input<readonly string[]>([]);
  /** Where the row leads, as a router link; none makes it plain. */
  readonly link = input<string | undefined>(undefined);
}
