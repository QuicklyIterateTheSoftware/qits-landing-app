import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Action, ActionGroup, isActionGroup } from '$ui/components/action-button/action';
import { ActionButton, ActionJoin } from '$ui/components/action-button/action-button';

/** One rendered group: a lone action is a group of one, without a role or a caption. */
interface ShownGroup {
  readonly group: boolean;
  readonly title: string | undefined;
  readonly actions: readonly { readonly action: Action; readonly join: ActionJoin }[];
}

/**
 * The standard structure of a page's main content: a header, actions on the same row at the
 * right, and the content below.
 *
 * ```html
 * <ui-page-layout title="Work" [actions]="[{ label: 'Archive', variant: 'muted', callback: open }]">
 *   …the content…
 * </ui-page-layout>
 *
 * <ui-page-layout>
 *   <div slot="header">…a custom header…</div>
 *   <a slot="actions" routerLink="…">…a custom action…</a>
 *   …the content…
 * </ui-page-layout>
 * ```
 *
 * - Header: `title` as an `<h1>`, or projected `[slot=header]` / `[uiPageHeader]` content, which wins.
 * - Actions: `actions` (single actions and groups), or projected `[slot=actions]` /
 *   `[uiPageActions]` content, which wins. A group is joined buttons in a `role="group"` named by
 *   its title, which is also its visible caption.
 * - Content: everything else.
 *
 * The page scrolls as a whole (the document scrolls, not the shell), and the actions stay pinned
 * to the top of the window while any of the page is in view. Header and actions are two floats,
 * so they share one row while both fit and the actions drop below the header when they do not;
 * the content clears both. A float's sticky box is bound by this component's whole box, not by a
 * row, which is why it is not a flex or grid row. Pinned, the actions keep a white background.
 * Fallback content (`<ng-content>`'s own children) shows the inputs only when nothing is
 * projected, so the server and the browser render the same markup.
 *
 * The class is not `PageLayout`: a class named `…Layout` is a routed layout (`qits/page-suffix`).
 */
@Component({
  selector: 'ui-page-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flow-root' },
  template: `
    <div class="float-left flex min-h-10 max-w-full items-center pr-4">
      <ng-content select="[slot=header], [uiPageHeader]">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">{{ title() }}</h1>
      </ng-content>
    </div>
    <div
      class="sticky top-0 z-10 float-right flex min-h-10 max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-white py-1 pl-3 empty:hidden"
      data-page-actions
    >
      <ng-content select="[slot=actions], [uiPageActions]">
        @for (group of groups(); track $index) {
          <div
            class="flex items-center gap-2"
            [attr.role]="group.group ? 'group' : null"
            [attr.aria-label]="group.group ? (group.title ?? null) : null"
          >
            <span
              class="text-xs font-semibold tracking-wide text-charcoal-brown-600 uppercase"
              [class]="group.title ? 'inline' : 'hidden'"
              aria-hidden="true"
              >{{ group.title }}</span
            >
            <div class="flex">
              @for (shown of group.actions; track $index) {
                <ui-action-button [action]="shown.action" [join]="shown.join" />
              }
            </div>
          </div>
        }
      </ng-content>
    </div>
    <div class="clear-both pt-6">
      <ng-content />
    </div>
  `,
})
export class PageLayoutComponent {
  /** The page's heading, unless a header is projected. */
  readonly title = input('');

  /** The page's actions, unless actions are projected. */
  readonly actions = input<readonly (Action | ActionGroup)[]>([]);

  protected readonly groups = computed((): readonly ShownGroup[] =>
    this.actions().map((item) => {
      const actions = isActionGroup(item) ? item.actions : [item];
      return {
        group: isActionGroup(item),
        title: isActionGroup(item) ? item.title : undefined,
        actions: actions.map((action, i) => ({ action, join: joinAt(i, actions.length) })),
      };
    }),
  );
}

function joinAt(index: number, count: number): ActionJoin {
  if (count === 1) return 'none';
  if (index === 0) return 'start';
  return index === count - 1 ? 'end' : 'middle';
}
