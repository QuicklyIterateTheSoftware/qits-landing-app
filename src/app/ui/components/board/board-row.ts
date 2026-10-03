import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
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
 *
 * `[row-gutter]` (a `ui-board-count`, say) sits at the bottom of the strip, level with the bar, as
 * if the bar went on into the gutter. The row is at least 6.75rem tall (7.75rem with a
 * `[row-gutter]`), and taller when `idLength` (the id's characters, 10px mono: 0.375rem each)
 * needs it, so the id fits up the strip with the chin to spare. The first line of cards takes the
 * extra height, so the bar stays at the bottom.
 */
@Component({
  selector: 'ui-board-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardRow }],
  host: {
    class:
      'relative grid min-h-[max(6.75rem,calc(var(--row-id-chars,0)*0.375rem+2rem))] grid-flow-row-dense grid-cols-subgrid grid-rows-[1fr] gap-y-2 bg-white/50 pt-2 ring-1 ring-black/5 has-[[row-gutter]]:min-h-[max(7.75rem,calc(var(--row-id-chars,0)*0.375rem+3.5rem))]',
    '[style.--row-id-chars]': 'idLength()',
    '[style.grid-column]': 'placement()',
    'data-highlight-target': '',
  },
  template: `
    <span
      class="absolute inset-y-0 left-full flex w-6 flex-col items-center gap-2 rounded-br-xl pt-2 text-[0.625rem] leading-none whitespace-nowrap text-charcoal-brown-950 *:shrink-0 [&>[row-gutter]]:mt-auto [&>[row-gutter]]:rounded-br-xl"
      [class]="fill()"
    >
      <!-- The id starts the chin (pt-2 + mt-2) below the top; the tile sits at the bottom, on the
           bar's line (both 1.5rem tall). -->
      <span class="mt-2 rotate-180 [writing-mode:vertical-rl]">
        <ng-content select="[row-id]" />
      </span>
      <ng-content select="[row-gutter]" />
    </span>
    <ng-content />
    <div
      class="col-span-full flex self-end items-baseline justify-start gap-2 py-1 pr-2 pl-2 text-xs wrap-anywhere [&>*]:min-w-0 text-charcoal-brown-950 [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:-right-6 [&>a]:after:rounded-br-xl [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md [&>[row-footer-end]]:ml-auto [&>[row-footer-end]]:shrink-0"
      [class]="fill()"
    >
      <ng-content select="[row-footer]" />
      <ng-content select="[row-footer-end]" />
    </div>
  `,
})
export class BoardRow implements BoardContext {
  /** The length of the `[row-id]` text, so the row is tall enough for it. */
  readonly idLength = input(0);
  /**
   * Draws bar and strip in a solid colour, the same over every column, instead of translucent
   * over each column's own.
   */
  readonly solid = input(false, { transform: booleanAttribute });

  protected readonly fill = computed(() =>
    this.solid() ? 'bg-charcoal-brown-300' : 'bg-charcoal-brown-600/40',
  );

  private readonly parent = inject(BOARD_CONTEXT, { skipSelf: true });

  readonly onBoard = true;
  readonly lead = () => this.parent.lead();
  readonly offset = () => this.parent.lead();
  readonly columnCount = () => this.parent.columnCount();

  protected readonly placement = computed(
    () => `${this.parent.lead() - this.parent.offset() + 1} / span ${this.parent.columnCount()}`,
  );
}
