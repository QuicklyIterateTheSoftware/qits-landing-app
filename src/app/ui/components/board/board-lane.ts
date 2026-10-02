import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/**
 * A container band.
 *
 * **On a board** it runs the board's full width (gutter and all columns): a title bar across the
 * top (projected `[lane-header]`, centred, on a 40% background, square corners) with `[lane-tags]` at its top
 * right, the gutter cell below it holding `[lane-gutter]` written vertically at its bottom left,
 * and its children (`ui-board-row`s, cards) in the columns beside it. `rows` is how many rows the
 * children take, so the gutter cell runs alongside all of them.
 *
 * **Off a board** (a list) it is a plain group: a header strip (`[lane-header]`, `[lane-tags]`)
 * above its children, stacked. `muted` draws that header quieter: a group shown only to place its
 * children, its own item living elsewhere.
 */
@Component({
  selector: 'ui-board-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardLane }],
  host: {
    // Exactly one display class, chosen by where the lane is (a static one would fight it).
    class: 'ring-1 ring-black/10',
    '[class]':
      "onBoard ? 'relative mx-1 grid grid-cols-subgrid grid-flow-row-dense gap-y-2 self-start overflow-hidden pb-2 bg-white/25' : 'mx-1 flex flex-col gap-1 rounded-md pb-1 bg-charcoal-brown-50'",
    '[style.grid-column]': "onBoard ? '1 / -1' : null",
  },
  template: `
    <div
      class="relative col-span-full flex items-center gap-2 px-2 py-1 text-xs"
      [class]="
        onBoard
          ? 'justify-center bg-charcoal-brown-800/40 text-white'
          : muted()
            ? 'bg-charcoal-brown-100 text-charcoal-brown-600'
            : 'bg-charcoal-brown-800 font-semibold text-white'
      "
    >
      <ng-content select="[lane-header]" />
      <span class="flex gap-1" [class]="onBoard ? 'absolute top-1 right-1' : 'ml-auto'">
        <ng-content select="[lane-tags]" />
      </span>
    </div>
    @if (onBoard) {
      <div
        class="col-start-1 flex items-end justify-start pb-1"
        [style.grid-row]="'2 / span ' + rows()"
      >
        <span
          class="text-[0.6875rem] text-charcoal-brown-700 [writing-mode:vertical-rl] rotate-180"
        >
          <ng-content select="[lane-gutter]" />
        </span>
      </div>
    }
    <ng-content />
  `,
})
export class BoardLane implements BoardContext {
  /** How many rows its children take on a board (at least 1). */
  readonly rows = input(1);
  readonly muted = input(false, { transform: booleanAttribute });

  private readonly parent = inject(BOARD_CONTEXT, { optional: true, skipSelf: true });
  readonly onBoard = this.parent?.onBoard ?? false;

  readonly lead = () => this.parent?.lead() ?? 0;
  readonly offset = () => 0;
  readonly columnCount = () => this.parent?.columnCount() ?? 0;
}
