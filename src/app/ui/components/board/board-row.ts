import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/**
 * A row inside a board lane, a lighter shade of the lane (a white layer over it), exactly across
 * the status columns: its children (cards) sit in their own columns. `[row-footer]` (a title,
 * say) sits left-aligned in a bar along its bottom, and `[row-id]` is written up a strip in the
 * right gutter beside the row, at its top, the lane's chin (`--lane-chin`) below the row's top
 * edge. Bar and strip form one ┘ in the epic bar's hue
 * one step lighter: the bar ends at the row's right edge, where the strip begins, so they never
 * overlap; only the outer bottom-right corner is rounded. `[row-footer-end]` (a `ui-tag-link`,
 * say) sits at the bar's right end, on the title's line. A link in the footer stretches over the
 * row and its strip, so the id opens the feature too: the row is the positioning box, and cards sit above it, so hovering a card shadows the
 * card, not the row.
 */
@Component({
  selector: 'ui-board-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardRow }],
  host: {
    class:
      'relative grid grid-cols-subgrid grid-flow-row-dense gap-y-2 bg-white/50 pt-2 ring-1 ring-black/5',
    '[style.grid-column]': 'placement()',
    'data-highlight-target': '',
  },
  template: `
    <span
      class="absolute inset-y-0 left-full flex w-6 items-start justify-center rounded-br-xl pt-(--lane-chin) bg-charcoal-brown-600/40 text-[0.625rem] leading-none whitespace-nowrap text-charcoal-brown-950 [&>*]:rotate-180 [&>*]:[writing-mode:vertical-rl]"
    >
      <ng-content select="[row-id]" />
    </span>
    <ng-content />
    <div
      class="col-span-full flex items-baseline justify-start gap-2 bg-charcoal-brown-600/40 py-1 pr-2 pl-2 text-xs wrap-anywhere [&>*]:min-w-0 text-charcoal-brown-950 [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:-right-6 [&>a]:after:rounded-br-xl [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md [&>[row-footer-end]]:ml-auto [&>[row-footer-end]]:shrink-0"
    >
      <ng-content select="[row-footer]" />
      <ng-content select="[row-footer-end]" />
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
