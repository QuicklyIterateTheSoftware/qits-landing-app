import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

/** One board column: its heading, an optional count, and its colours (Tailwind classes, in full). */
export interface BoardColumnSpec {
  readonly label: string;
  readonly count?: number;
  /** The column body's background, e.g. `bg-ocean-deep-300`. */
  readonly body: string;
  /** The heading's background and text, e.g. `bg-ocean-deep-400 text-ocean-deep-950`. */
  readonly header: string;
}

/**
 * A board: flush columns side by side, each in its own colour, with no gaps, and with `gutter` two
 * equal narrow columns around them (the left one for lane labels), with no background of their
 * own, so the status columns sit centred. The colours are a background layer; the
 * projected content (`ui-board-lane`, `ui-board-row`, `ui-board-card`) is laid out on a grid of
 * the same columns above it, each child placing itself. The grid fills forward only (no dense
 * packing): an item never moves up into a gap above an earlier one, so the items keep the order
 * they are given, and removing one does not lift a later one past another.
 *
 * The headings stay pinned to the top of the window while the board is in view, and leave with
 * its end. They pin below the shell's top bar (`--app-header-h`) and the page's pinned actions
 * (`--page-actions-h`); both are 0 where they are unset. Sticky works only with no scrolling box
 * between the board and the document, so nothing around a board may set `overflow`.
 *
 * ```html
 * <ui-board [columns]="columns" gutter>
 *   <ui-board-card [column]="0" code="qits-1" title="…" kind="ticket" />
 * </ui-board>
 * ```
 */
@Component({
  selector: 'ui-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  providers: [{ provide: BOARD_CONTEXT, useExisting: Board }],
  template: `
    <div
      class="sticky top-[calc(var(--app-header-h,0px)_+_var(--page-actions-h,0px))] z-30 grid bg-white"
      [style.grid-template-columns]="template()"
      data-board-headings
    >
      @if (gutter()) {
        <div></div>
      }
      @for (column of columns(); track column.label) {
        <div
          class="flex items-baseline justify-between px-3 py-2 text-sm font-semibold"
          [class]="column.header"
        >
          {{ column.label }}
          <span class="text-xs font-normal opacity-80">{{ column.count ?? '' }}</span>
        </div>
      }
      @if (gutter()) {
        <div></div>
      }
    </div>
    <div class="relative">
      <div
        aria-hidden="true"
        class="absolute inset-0 grid"
        [style.grid-template-columns]="template()"
      >
        @if (gutter()) {
          <div></div>
        }
        @for (column of columns(); track column.label) {
          <div [class]="column.body"></div>
        }
        @if (gutter()) {
          <div></div>
        }
      </div>
      <div
        class="relative -mb-6 grid min-h-24 grid-flow-row pt-2"
        [style.grid-template-columns]="template()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class Board implements BoardContext {
  readonly columns = input.required<readonly BoardColumnSpec[]>();
  /** A narrow neutral column before the status columns. */
  readonly gutter = input(false, { transform: booleanAttribute });

  protected readonly template = computed(() =>
    this.gutter()
      ? `1.75rem repeat(${this.columns().length}, minmax(0, 1fr)) 1.75rem`
      : `repeat(${this.columns().length}, minmax(0, 1fr))`,
  );

  readonly onBoard = true;
  readonly root = true;
  readonly lead = () => (this.gutter() ? 1 : 0);
  readonly offset = () => 0;
  readonly columnCount = () => this.columns().length;
}
