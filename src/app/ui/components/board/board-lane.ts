import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { BOARD_CONTEXT, gridColumn, type BoardContext } from './board-context';

/**
 * A container band: a header strip (projected `[lane-header]`) above its children.
 *
 * On a board it spans columns `from`..`to` (absolute, 0-based) and lays its children out on the
 * same columns (a subgrid), so a child card or a nested lane sits in its own column. Off a board
 * (a list) it is a plain group, its children stacked and indented.
 *
 * `muted` draws it quieter: a group shown only to place its children, its own item living
 * elsewhere (for example an epic on the board whose task is still in the backlog).
 */
@Component({
  selector: 'ui-board-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardLane }],
  host: {
    class: 'mx-1 block self-start rounded-md ring-1 ring-black/10',
    '[class]':
      "onBoard ? 'grid grid-cols-subgrid gap-y-2 pb-2 bg-white/25' : 'flex flex-col gap-1 pb-1 bg-charcoal-brown-50'",
    '[style.grid-column]': 'column()',
  },
  template: `
    <div
      class="col-span-full flex items-center gap-2 rounded-t-md px-2 py-1 text-xs"
      [class]="
        muted()
          ? 'bg-charcoal-brown-100 text-charcoal-brown-600'
          : 'bg-charcoal-brown-800 font-semibold text-white'
      "
    >
      <ng-content select="[lane-header]" />
    </div>
    <ng-content />
  `,
})
export class BoardLane implements BoardContext {
  /** The first column the band covers (absolute, 0-based). Ignored off a board. */
  readonly from = input(0);
  /** The last column the band covers (absolute, 0-based). Ignored off a board. */
  readonly to = input(0);
  readonly muted = input(false, { transform: booleanAttribute });

  private readonly parent = inject(BOARD_CONTEXT, { optional: true, skipSelf: true });
  protected readonly onBoard = this.parent !== null;

  protected readonly column = computed(() =>
    this.parent ? gridColumn(this.parent, this.from(), this.to()) : null,
  );

  readonly offset = () => this.from();
  readonly columnCount = () => this.to() - this.from() + 1;
}
