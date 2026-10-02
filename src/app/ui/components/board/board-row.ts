import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/**
 * A row inside a board lane, across the status columns only (not the gutter): its children (cards)
 * sit in their own columns, and its `[row-footer]` (an id and a title, say) runs centred along the
 * row's bottom. A link in the footer may stretch over the row: the row is the positioning box, and
 * cards sit above it.
 */
@Component({
  selector: 'ui-board-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardRow }],
  host: {
    class:
      'relative mx-1 grid grid-cols-subgrid grid-flow-row-dense gap-y-2 rounded-sm bg-white/30 pt-2 ring-1 ring-black/5',
    '[style.grid-column]': 'placement()',
  },
  template: `
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
