import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A row inside a list lane, drawn to look like a board row: a lighter shade of the lane, its
 * children (cards) stacked across it, and a ┘ highlight: `[row-footer]` (a title) left-aligned in
 * a bar along its bottom, which ends at the row's right edge where a strip in the lane's right
 * gutter takes over, holding `[row-id]` written bottom to top at its top. Only the outer
 * bottom-right corner is rounded. A link in the footer stretches over the row and its strip and
 * casts a shadow while hovered; cards sit above it with their own links.
 */
@Component({
  selector: 'ui-list-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative flex flex-col gap-y-2 bg-white/50 pt-2 ring-1 ring-black/5 [&_ui-board-card]:self-stretch',
    'data-highlight-target': '',
  },
  template: `
    <span
      class="absolute inset-y-0 left-full flex w-6 items-start justify-center rounded-br-xl bg-charcoal-brown-600/40 pt-(--lane-chin) text-[0.625rem] leading-none whitespace-nowrap text-charcoal-brown-950 [&>*]:rotate-180 [&>*]:[writing-mode:vertical-rl]"
    >
      <ng-content select="[row-id]" />
    </span>
    <ng-content />
    <div
      class="flex items-baseline justify-start gap-2 bg-charcoal-brown-600/40 py-1 pr-2 pl-2 text-xs text-charcoal-brown-950 [&>a]:text-inherit [&>a]:no-underline [&>a]:after:absolute [&>a]:after:inset-0 [&>a]:after:-right-6 [&>a]:after:rounded-br-xl [&>a]:after:transition-shadow [&>a]:after:duration-150 [&>a]:hover:underline [&>a]:hover:after:shadow-md"
    >
      <ng-content select="[row-footer]" />
    </div>
  `,
})
export class ListRow {}
