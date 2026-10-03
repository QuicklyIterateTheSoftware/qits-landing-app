import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ExpandButton } from '$ui/components/expand-button/expand-button';
import { Findable } from '$ui/components/findable/findable';
import { Highlighter } from '$ui/components/highlight/highlight';

let nextListLaneId = 0;

/**
 * A group in a list (the Backlog, the Archive), drawn to look like a board lane without the
 * board's columns: a narrow left gutter, the content, a narrow right gutter.
 *
 * - The highlight is a ┌: a strip down the whole left side (only its top-left corner rounded)
 *   holds `[lane-gutter]` written bottom to top at its bottom, and the title bar
 *   (`[lane-header]`, right-aligned, 40% charcoal) starts beside it across the top.
 * - `[lane-tags]` wrap in a row of their own below the bar, at least 1rem tall.
 * - The strip is in the lane's grid (its first column, over all three rows), so a longer id makes
 *   the lane taller: even a collapsed lane shows its whole id. The extra height goes to the
 *   children's row.
 * - The children (`ui-list-row`s, cards) stack between the gutters, 1rem apart.
 * - A link projected as `[lane-header]` stretches over the whole lane and casts a shadow while
 *   hovered; rows and cards sit above it with their own links.
 * - With `collapsible`, the round button on the bottom edge switches between the children and
 *   `[lane-summary]`; `collapsed` sets where it starts. `[lane-action]` (a `ui-finish-button`)
 *   sits on the lane's bottom-right corner, outside every clip. Both views are always rendered and
 *   switched by class, so a server render hydrates as is. Collapsed children are hidden until
 *   found: find-in-page searches them and opens the lane on a match.
 */
@Component({
  selector: 'ui-list-lane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExpandButton, Findable],
  host: {
    class:
      'relative mx-1 grid grid-cols-[1.5rem_minmax(0,1fr)] grid-rows-[auto_auto_1fr] rounded-tl-xl bg-white/25 pb-(--lane-chin) ring-1 ring-black/10 [--lane-chin:--spacing(4)]',
    'data-highlight-target': '',
  },
  template: `
    <!--
      In the grid, not positioned, so its id sets the lane's least height: a short or collapsed
      lane shows its whole id. It reaches into the chin (the negative margin), and keeps the chin
      above the id too.
    -->
    <div
      class="col-start-1 row-span-3 row-start-1 -mb-(--lane-chin) flex items-end justify-center rounded-tl-xl bg-charcoal-brown-800/40 pt-(--lane-chin) pb-(--lane-chin) text-white [&_a]:text-inherit [&_a]:no-underline"
    >
      <span class="rotate-180 text-[0.6875rem] whitespace-nowrap [writing-mode:vertical-rl]">
        <ng-content select="[lane-gutter]" />
      </span>
    </div>
    <div
      class="col-start-2 row-start-1 flex items-center justify-end gap-2 bg-charcoal-brown-800/40 px-2 py-1 text-xs wrap-anywhere text-white [&>*]:min-w-0 [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:rounded-tl-xl [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md"
    >
      <ng-content select="[lane-header]" />
    </div>
    <div class="col-start-2 row-start-2 mr-6 flex min-h-4 flex-wrap items-center gap-1.5">
      <ng-content select="[lane-tags]" />
    </div>
    <div class="relative col-start-2 row-start-3">
      <div
        [id]="contentId"
        class="grid transition-[grid-template-rows] duration-200 ease-out"
        [class]="isCollapsed() ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'"
        [uiFindable]="isCollapsed()"
        (found)="reveal()"
      >
        <div
          class="flex min-h-0 flex-col gap-4 pr-6 [&_ui-board-card]:self-stretch"
          [class]="
            isCollapsed() ? 'overflow-hidden' : 'overflow-clip [overflow-clip-margin:0.5rem]'
          "
        >
          <ng-content />
        </div>
      </div>
      <div
        class="absolute inset-x-0 top-0 flex items-center justify-center py-2 text-sm text-charcoal-brown-900 transition-opacity duration-200 ease-out"
        [class]="isCollapsed() ? 'opacity-100' : 'pointer-events-none opacity-0'"
        [attr.inert]="isCollapsed() ? null : ''"
        [attr.aria-hidden]="isCollapsed() ? null : 'true'"
      >
        <ng-content select="[lane-summary]" />
      </div>
      <!-- Collapsed, the summary needs its line: the content takes none then. -->
      <div class="h-9" [class.hidden]="!isCollapsed()"></div>
    </div>
    <ng-content select="[lane-action]" />
    @if (collapsible()) {
      <ui-expand-button
        [open]="!isCollapsed()"
        [controls]="contentId"
        (toggled)="isCollapsed.set(!isCollapsed())"
      />
    }
  `,
})
export class ListLane {
  /** Shows the button that collapses and expands the lane. */
  readonly collapsible = input(false, { transform: booleanAttribute });
  /** Whether the lane starts collapsed; the button changes it after that. */
  readonly collapsed = input(false, { transform: booleanAttribute });

  protected readonly isCollapsed = linkedSignal(() => this.collapsible() && this.collapsed());
  protected readonly contentId = `list-lane-${nextListLaneId++}`;

  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly highlighter = inject(Highlighter);

  /** Find-in-page found text in the collapsed children: open the lane and point at it. */
  protected reveal(): void {
    this.isCollapsed.set(false);
    this.highlighter.highlight(this.element);
  }
}
