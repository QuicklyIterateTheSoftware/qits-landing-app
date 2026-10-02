import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ExpandButton } from '../expand-button/expand-button';
import { BOARD_CONTEXT, ROOT_ITEM_SPACING, type BoardContext } from './board-context';

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
 * top (projected `[lane-header]`, right-aligned) that continues down the whole left side over the gutter as one ┌ of the same colour,
 * only its top-left corner rounded, holding `[lane-gutter]` written vertically at its bottom.
 * Below the bar, `[lane-tags]` sit in a row of their own across the status columns, wrapping,
 * that row no taller than the usual 1rem unless they need it; then its children
 * (`ui-board-row`s, cards) in the columns beside the strip.
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
    // The chin below the last row; the id at the bottom of the left strip keeps the same distance.
    class: 'ring-1 ring-black/10 [--lane-chin:--spacing(4)]',
    '[class]':
      "(onBoard ? 'relative mx-1 grid grid-cols-subgrid self-start rounded-tl-xl pb-(--lane-chin) bg-white/25' + (atRoot ? ' ' + spacing : '') : 'relative mx-1 flex flex-col gap-1 rounded-md pb-1 bg-charcoal-brown-50')",
    '[style.grid-column]': "onBoard ? '1 / -1' : null",
  },
  template: `
    @if (onBoard) {
      <!--
        The left arm of the ┌: the whole left side, the top-left corner included, so the title bar
        starts beside it and the two never overlap. Before the bar, so the bar's stretched link
        lies above it.
      -->
      <div
        class="absolute inset-y-0 left-0 flex w-6 items-end justify-center rounded-tl-xl bg-charcoal-brown-800/40 pb-(--lane-chin) text-white [&_a]:text-inherit [&_a]:no-underline"
      >
        <span class="rotate-180 text-[0.6875rem] whitespace-nowrap [writing-mode:vertical-rl]">
          <ng-content select="[lane-gutter]" />
        </span>
      </div>
    }
    <div
      class="col-span-full flex items-center gap-2 px-2 py-1 text-xs [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md"
      [class]="
        onBoard
          ? 'ml-6 justify-end bg-charcoal-brown-800/40 text-white [&>a]:after:rounded-tl-xl'
          : muted()
            ? 'relative bg-charcoal-brown-100 text-charcoal-brown-600'
            : 'relative bg-charcoal-brown-800 font-semibold text-white'
      "
    >
      <ng-content select="[lane-header]" />
    </div>
    <!--
      The tags. On a board: their own row between the title bar and the rows, across the status
      columns, at least the 1rem that separates bar and rows and taller only when they wrap. Off a
      board: at the right of the header strip.
    -->
    <div
      class="flex flex-wrap items-center gap-1.5"
      [class]="
        onBoard
          ? 'col-start-2 col-end-[-2] row-start-2 min-h-4'
          : 'absolute top-0 right-1 h-6 flex-nowrap'
      "
    >
      <ng-content select="[lane-tags]" />
    </div>
    <!--
      The rows. On a board their height animates through grid-template-rows (0fr to 1fr), as on the
      card's expandable; both views are always rendered and switched by class. Collapsed, the rows
      clip fully and are inert; open, they clip with a margin, so hover shadows still show.
    -->
    <div
      [id]="contentId"
      [class]="
        !onBoard
          ? 'contents'
          : 'col-span-full row-start-3 grid grid-cols-subgrid transition-[grid-template-rows] duration-200 ease-out ' +
            (isCollapsed() ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')
      "
      [attr.inert]="onBoard && isCollapsed() ? '' : null"
    >
      <div
        [class]="
          !onBoard
            ? 'contents'
            : 'col-span-full grid min-h-0 grid-cols-subgrid grid-flow-row-dense gap-y-4 ' +
              (isCollapsed() ? 'overflow-hidden' : 'overflow-clip [overflow-clip-margin:0.5rem]')
        "
      >
        <ng-content />
      </div>
    </div>
    @if (onBoard) {
      <!-- The summary shares the rows' grid cell and cross-fades with them. -->
      <div
        class="col-span-full row-start-3 flex items-center justify-center self-start py-2 text-sm text-charcoal-brown-900 transition-opacity duration-200 ease-out"
        [class]="isCollapsed() ? 'opacity-100' : 'pointer-events-none opacity-0'"
        [attr.inert]="isCollapsed() ? null : ''"
        [attr.aria-hidden]="isCollapsed() ? null : 'true'"
      >
        <ng-content select="[lane-summary]" />
      </div>
      <!-- An action button straddling the lane's edge (ui-finish-button), outside every clip. -->
      <ng-content select="[lane-action]" />
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
  protected readonly atRoot = this.parent?.root === true;
  protected readonly spacing = ROOT_ITEM_SPACING;

  readonly lead = () => this.parent?.lead() ?? 0;
  readonly offset = () => 0;
  readonly columnCount = () => this.parent?.columnCount() ?? 0;
}
