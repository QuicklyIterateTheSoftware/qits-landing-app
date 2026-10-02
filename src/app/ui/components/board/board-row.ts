import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/**
 * A row inside a board lane, a lighter shade of the lane (a white layer over it), exactly across the status columns (not the gutters, no inset): its
 * children (cards) sit in their own columns, `[row-id]` is written up a strip down its left edge,
 * vertically centred, and `[row-footer]` (a title, say) sits left-aligned in a bar along its bottom. Strip and bar form one
 * └ in the epic bar's hue one step lighter: the strip runs the full left side, the bar starts
 * beside it, so they never overlap; only the bottom-right corner is rounded, like the row's. A link in the footer
 * stretches over the row and casts a shadow while hovered: the row is the positioning box, and cards
 * sit above it, so hovering a card shadows the card, not the row.
 */
@Component({
  selector: 'ui-board-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardRow }],
  host: {
    class:
      'relative grid grid-cols-subgrid grid-flow-row-dense gap-y-2 rounded-br-xl bg-white/50 pt-2 ring-1 ring-black/5 [&_ui-board-card]:ml-5',
    '[style.grid-column]': 'placement()',
  },
  template: `
    <span
      class="absolute inset-y-0 left-0 flex w-4 items-center justify-center bg-charcoal-brown-600/40 text-[0.625rem] leading-none whitespace-nowrap text-charcoal-brown-950 [&>*]:rotate-180 [&>*]:[writing-mode:vertical-rl]"
    >
      <ng-content select="[row-id]" />
    </span>
    <ng-content />
    <div
      class="col-span-full flex items-baseline justify-start gap-2 ml-4 rounded-br-xl bg-charcoal-brown-600/40 py-1 pr-2 pl-1 text-xs text-charcoal-brown-950 [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:rounded-br-xl [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md"
    >
      <ng-content select="[row-footer]" />
    </div>
  `,
})
export class BoardRow implements BoardContext {
  private readonly parent = inject(BOARD_CONTEXT, { skipSelf: true });

  readonly onBoard = true;
  readonly lead = () => this.parent.lead();
  readonly offset = () => this.parent.lead();
  readonly columnCount = () => this.parent.columnCount();

  protected readonly placement = computed(
    () => `${this.parent.lead() - this.parent.offset() + 1} / span ${this.parent.columnCount()}`,
  );
}
