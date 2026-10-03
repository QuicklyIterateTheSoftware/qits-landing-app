import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IdStrip } from '$ui/components/id-strip/id-strip';
import { BOARD_CONTEXT, gridColumn, ROOT_ITEM_SPACING } from './board-context';

/**
 * One item on a board: a small white card in its column, its code down the left edge
 * (`ui-id-strip`), then its title and a kind chip. `border` is the card's border colour (a full Tailwind class, e.g. `border-ocean-deep-400`).
 * With `link`, the title is a link stretched over the whole card; hovering it shadows the card
 * itself (the card clips its content, so a shadow inside it would not show). Projected content (tags, say)
 * goes under the title; a word too long for the card breaks anywhere (`wrap-anywhere`), so it never overflows.
 * `[card-corner]` (a `ui-tag-link` of variant `corner`) goes last, in the bottom-right corner,
 * mirroring the kind chip; the card's right corners are square, so it needs no clipping, and a
 * clipping card would cut its finish button and its popovers. While the pointer or the focus is in
 * the card, it is raised above its neighbours, so a popover in it is not drawn under the next card.
 */
@Component({
  selector: 'ui-board-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IdStrip],
  host: {
    class:
      'relative z-10 mx-2 flex self-start transition-shadow duration-150 focus-within:z-20 hover:z-20 has-[a:hover]:shadow-md rounded-l-md border bg-white text-sm',
    '[class]': "border() + (atRoot ? ' ' + spacing : '')",
    '[style.grid-column]': 'placement()',
    'data-highlight-target': '',
  },
  template: `
    <ui-id-strip class="rounded-l-[5px]" [id]="code()" />
    <div class="min-w-0 flex-1 p-2">
      <!-- The kind floats flush into the top-right corner; the title flows around it. -->
      <p class="m-0 text-charcoal-brown-900 wrap-anywhere">
        <span
          class="float-right -mt-2 -mr-2 mb-1 ml-2 rounded-bl-md bg-ocean-deep-50 px-[0.65rem] py-[0.1625rem] text-[0.6875rem] text-ocean-deep-800"
          >{{ kind() }}</span
        >
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
      <ng-content select="[card-corner]" />
    </div>
    <!-- An action button on the card's bottom-right corner (ui-finish-button). -->
    <ng-content select="[card-action]" />
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
  protected readonly atRoot = this.context?.root === true;
  protected readonly spacing = ROOT_ITEM_SPACING;

  protected readonly placement = computed(() =>
    this.context?.onBoard ? gridColumn(this.context, this.column(), this.column()) : null,
  );
}
