import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IdStrip } from '../id-strip/id-strip';
import { BOARD_CONTEXT, gridColumn } from './board-context';

/**
 * One item on a board: a small white card in its column, its code down the left edge
 * (`ui-id-strip`), then its title and a kind chip. `border` is the card's border colour (a full Tailwind class, e.g. `border-ocean-deep-400`).
 * With `link`, the title is a link stretched over the whole card; hovering it shadows the card
 * itself (the card clips its content, so a shadow inside it would not show). Projected content (tags, say)
 * goes under the title.
 */
@Component({
  selector: 'ui-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IdStrip],
  host: {
    class:
      'relative z-10 mx-2 flex self-start overflow-hidden transition-shadow duration-150 has-[a:hover]:shadow-md rounded-md border bg-white text-sm',
    '[class]': 'border()',
    '[style.grid-column]': 'placement()',
  },
  template: `
    <ui-id-strip [id]="code()" />
    <div class="min-w-0 flex-1 p-2">
      <div class="flex items-start justify-between gap-2">
        <p class="m-0 text-charcoal-brown-900">
          @if (link(); as link) {
            <a
              class="text-inherit no-underline after:absolute after:inset-0 hover:underline"
              [routerLink]="link"
              >{{ title() }}</a
            >
          } @else {
            {{ title() }}
          }
        </p>
        <span
          class="shrink-0 rounded-sm bg-ocean-deep-50 px-1.5 text-[0.6875rem] text-ocean-deep-800"
          >{{ kind() }}</span
        >
      </div>
      <ng-content />
    </div>
  `,
})
export class BoardCard {
  /** The column the card sits in (absolute, 0-based). */
  readonly column = input(0);
  readonly code = input('');
  readonly title = input('');
  readonly kind = input('');
  readonly border = input('border-charcoal-brown-200');
  /** Where the card leads, as a router link; none makes it plain. */
  readonly link = input<string | undefined>(undefined);

  private readonly context = inject(BOARD_CONTEXT, { optional: true });

  protected readonly placement = computed(() =>
    this.context?.onBoard ? gridColumn(this.context, this.column(), this.column()) : null,
  );
}
