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
 * the same columns above it, each child placing itself.
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
    <div class="grid" [style.grid-template-columns]="template()">
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
        class="relative grid min-h-24 grid-flow-row-dense gap-y-8 py-2"
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
  readonly lead = () => (this.gutter() ? 1 : 0);
  readonly offset = () => 0;
  readonly columnCount = () => this.columns().length;
}
