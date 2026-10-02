import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOARD_CONTEXT, gridColumn } from './board-context';

/**
 * One item on a board: a small white card in its column, with a short code, a kind chip and a
 * title. `border` is the card's border colour (a full Tailwind class, e.g. `border-ocean-deep-400`).
 * With `link`, the title is a link stretched over the whole card. Projected content (tags, say)
 * goes under the title.
 */
@Component({
  selector: 'ui-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: {
    class: 'relative z-10 mx-2 block self-start rounded-md border bg-white p-2 text-sm',
    '[class]': 'border()',
    '[style.grid-column]': 'placement()',
  },
  template: `
    <div class="flex items-center justify-between gap-2">
      <span class="font-mono text-xs text-charcoal-brown-600">{{ code() }}</span>
      <span class="rounded-sm bg-ocean-deep-50 px-1.5 text-[0.6875rem] text-ocean-deep-800">{{
        kind()
      }}</span>
    </div>
    <p class="mt-1 mb-0 text-charcoal-brown-900">
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
    <ng-content />
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
