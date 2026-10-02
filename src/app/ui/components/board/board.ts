import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
 * A board: flush columns side by side, each in its own colour, with no gaps. The colours are a
 * background layer; the projected content (`ui-board-lane`, `ui-board-card`) is laid out on a grid
 * of the same columns above it (no column gap, so it lines up with the colours), each child placing
 * itself in its columns and keeping its own small inset from the column edges.
 *
 * ```html
 * <ui-board [columns]="columns">
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
      @for (column of columns(); track column.label) {
        <div
          class="flex items-baseline justify-between px-3 py-2 text-sm font-semibold"
          [class]="column.header"
        >
          {{ column.label }}
          <span class="text-xs font-normal opacity-80">{{ column.count ?? '' }}</span>
        </div>
      }
    </div>
    <div class="relative">
      <div
        aria-hidden="true"
        class="absolute inset-0 grid"
        [style.grid-template-columns]="template()"
      >
        @for (column of columns(); track column.label) {
          <div [class]="column.body"></div>
        }
      </div>
      <div
        class="relative grid min-h-24 grid-flow-row-dense gap-y-2 py-2"
        [style.grid-template-columns]="template()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class Board implements BoardContext {
  readonly columns = input.required<readonly BoardColumnSpec[]>();

  protected readonly template = computed(() => `repeat(${this.columns().length}, minmax(0, 1fr))`);

  readonly offset = () => 0;
  readonly columnCount = computed(() => this.columns().length);
}
