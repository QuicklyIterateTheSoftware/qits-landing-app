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
      'relative mx-1 flex overflow-hidden transition-shadow duration-150 has-[a:hover]:shadow-md rounded-l-sm bg-white text-sm',
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
      <!-- Projected tags first, so the kind chip stays in the corner. -->
      <ng-content />
      @for (chip of chips(); track $index) {
        <!-- The last chip (the kind) sits flush in the row's top-right corner. -->
        <span
          class="shrink-0 bg-charcoal-brown-100 text-[0.6875rem] text-charcoal-brown-700"
          [class]="
            $last
              ? '-mt-2 -mr-3 self-start rounded-bl-md px-[0.65rem] py-[0.1625rem]'
              : 'rounded-sm px-1.5'
          "
          >{{ chip }}</span
        >
      }
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
