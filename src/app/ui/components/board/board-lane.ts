import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ExpandButton } from '../expand-button/expand-button';
import { BOARD_CONTEXT, type BoardContext } from './board-context';

let nextLaneId = 0;

/**
 * A container band.
 *
 * A link projected as `[lane-header]` stretches over the whole lane on a board (over the header
 * strip only off a board) and casts a shadow while hovered. Rows and cards are positioned and come
 * later, so they sit above it with their own links: hovering or clicking one does not touch the
 * lane.
 *
 * **On a board** it runs the board's full width (gutters and all columns): a title bar across the
 * top (projected `[lane-header]`, right-aligned, on a 40% background, only its top-left corner
 * rounded) ending just before `[lane-tags]` at its top right, the gutter cell below it holding `[lane-gutter]` written vertically at its
 * bottom left, and its children (`ui-board-row`s, cards) in the columns beside it.
 *
 * With `collapsible`, a round button on its bottom edge switches between the children (expanded)
 * and `[lane-summary]` (collapsed), a single centred line. `collapsed` sets where it starts; a
 * click wins after that. Both views are always rendered and switched by class, so a server render
 * hydrates as is.
 *
 * **Off a board** (a list) it is a plain group: a header strip (`[lane-header]`, `[lane-tags]`)
 * above its children, stacked. `muted` draws that header quieter: a group shown only to place its
 * children, its own item living elsewhere.
 */
@Component({
  selector: 'ui-board-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExpandButton],
  providers: [{ provide: BOARD_CONTEXT, useExisting: BoardLane }],
  host: {
    // Exactly one display class, chosen by where the lane is (a static one would fight it).
    class: 'ring-1 ring-black/10',
    '[class]':
      "onBoard ? 'relative mx-1 grid grid-cols-subgrid self-start rounded-tl-xl pb-4 bg-white/25' : 'mx-1 flex flex-col gap-1 rounded-md pb-1 bg-charcoal-brown-50'",
    '[style.grid-column]': "onBoard ? '1 / -1' : null",
  },
  template: `
    <div
      class="col-span-full flex items-center gap-2 px-2 py-1 text-xs [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md"
      [class]="
        onBoard
          ? 'mb-4 justify-end rounded-tl-xl bg-charcoal-brown-800/40 text-white [&>a]:after:rounded-tl-xl'
          : muted()
            ? 'relative bg-charcoal-brown-100 text-charcoal-brown-600'
            : 'relative bg-charcoal-brown-800 font-semibold text-white'
      "
    >
      <ng-content select="[lane-header]" />
      <span class="flex gap-1" [class]="onBoard ? 'shrink-0' : 'ml-auto'">
        <ng-content select="[lane-tags]" />
      </span>
    </div>
    @if (onBoard) {
      <div
        class="col-start-1 row-start-2 flex items-end justify-start pb-1 [&_a]:text-inherit [&_a]:no-underline"
      >
        <span
          class="text-[0.6875rem] text-charcoal-brown-700 [writing-mode:vertical-rl] rotate-180"
        >
          <ng-content select="[lane-gutter]" />
        </span>
      </div>
    }
    <div
      [id]="contentId"
      [class]="
        !onBoard
          ? 'contents'
          : isCollapsed()
            ? 'hidden'
            : 'col-span-full row-start-2 grid grid-cols-subgrid grid-flow-row-dense gap-y-2'
      "
    >
      <ng-content />
    </div>
    @if (onBoard) {
      <div
        class="col-span-full row-start-2 items-center justify-center py-2 text-sm text-charcoal-brown-900"
        [class]="isCollapsed() ? 'flex' : 'hidden'"
      >
        <ng-content select="[lane-summary]" />
      </div>
      @if (collapsible()) {
        <ui-expand-button
          [open]="!isCollapsed()"
          [controls]="contentId"
          (toggled)="isCollapsed.set(!isCollapsed())"
        />
      }
    }
  `,
})
export class BoardLane implements BoardContext {
  readonly muted = input(false, { transform: booleanAttribute });
  /** Shows the button that collapses and expands the lane (on a board). */
  readonly collapsible = input(false, { transform: booleanAttribute });
  /** Whether the lane starts collapsed; the button changes it after that. */
  readonly collapsed = input(false, { transform: booleanAttribute });

  protected readonly isCollapsed = linkedSignal(() => this.collapsible() && this.collapsed());
  protected readonly contentId = `board-lane-${nextLaneId++}`;

  private readonly parent = inject(BOARD_CONTEXT, { optional: true, skipSelf: true });
  readonly onBoard = this.parent?.onBoard ?? false;

  readonly lead = () => this.parent?.lead() ?? 0;
  readonly offset = () => 0;
  readonly columnCount = () => this.parent?.columnCount() ?? 0;
}
