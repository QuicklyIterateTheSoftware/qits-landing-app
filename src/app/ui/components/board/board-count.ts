import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BOARD_CONTEXT, gridColumn } from './board-context';

/**
 * A count on a board: a small square tile, as translucent as a board row, its number centred,
 * sitting in its column. In the gutter, which has no colour of its own, the tile takes the
 * feature id strip's hue instead, as translucent. `column` is a status column (0-based) or `'gutter'`, the right gutter
 * (the board needs `gutter` for that). `label` is what a screen reader reads after the number
 * ("refined"); the tile itself shows the number only.
 *
 * Made for a lane's `[lane-summary]`, which lays its children on the board's columns.
 */
@Component({
  selector: 'ui-board-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex size-6 items-center justify-center justify-self-center rounded-sm text-xs font-semibold text-charcoal-brown-950 tabular-nums ring-1 ring-black/5',
    '[class]': "column() === 'gutter' ? 'bg-charcoal-brown-600/20' : 'bg-white/50'",
    '[style.grid-column]': 'placement()',
  },
  template: `<span aria-hidden="true">{{ count() }}</span
    ><span class="sr-only">{{ count() }} {{ label() }}</span>`,
})
export class BoardCount {
  readonly count = input.required<number>();
  readonly column = input<number | 'gutter'>(0);
  readonly label = input('');

  private readonly context = inject(BOARD_CONTEXT, { optional: true });

  protected readonly placement = computed(() => {
    const context = this.context;
    if (!context?.onBoard) return null;
    const column = this.column();
    const index = column === 'gutter' ? context.columnCount() : column;
    return gridColumn(context, index, index);
  });
}
