import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/**
 * A row inside a board lane, exactly across the status columns (not the gutters, no inset): its
 * children (cards) sit in their own columns, `[row-id]` is written up its left edge, vertically
 * centred, and `[row-footer]` (a title, say) runs centred along its bottom. A link in the footer
 * may stretch over the row: the row is the positioning box, and cards sit above it.
 */
@Component({
  selector: 'ui-board-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardRow }],
  host: {
    class:
      'relative grid grid-cols-subgrid grid-flow-row-dense gap-y-2 bg-white/30 pt-2 ring-1 ring-black/5 [&>ui-board-card]:ml-4',
    '[style.grid-column]': 'placement()',
  },
  template: `
    <span
      class="absolute top-1/2 left-0.5 -translate-y-1/2 text-[0.625rem] leading-none text-charcoal-brown-700 [writing-mode:vertical-rl] rotate-180"
    >
      <ng-content select="[row-id]" />
    </span>
    <ng-content />
    <div
      class="col-span-full flex items-baseline justify-center gap-2 px-2 pb-1 text-xs text-charcoal-brown-800"
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
