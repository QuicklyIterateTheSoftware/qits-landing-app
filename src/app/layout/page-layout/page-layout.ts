import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
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
 * <app-page-layout title="Work" [actions]="[{ label: 'Archive', variant: 'muted', callback: open }]">
 *   …the content…
 * </app-page-layout>
 *
 * <app-page-layout>
 *   <div slot="header">…a custom header…</div>
 *   <a slot="actions" routerLink="…">…a custom action…</a>
 *   …the content…
 * </app-page-layout>
 * ```
 *
 * - Header: `title` as an `<h1>`, or projected `[slot=header]` / `[uiPageHeader]` content, which wins.
 * - Actions: `actions` (single actions and groups), or projected `[slot=actions]` /
 *   `[uiPageActions]` content, which wins. A group is joined buttons in a `role="group"` named by
 *   its title, which is also its visible caption, centred below the buttons.
 * - Content: everything else.
 *
 * The page scrolls as a whole (the document scrolls, not the shell), and the actions stay pinned
 * to the top of the window, just below the shell's top bar (`--app-header-h`), while any of the
 * page is in view. Their height is `--page-actions-h` on this component, measured in the browser
 * (0 on the server and while there are no actions), so what pins inside the content (the board's
 * headings) sits below them instead of under them. The actions float right and come
 * first; the header after them is a box of its own (flex) beside the float, so a long title wraps
 * there first. Once less than 12rem is left beside the actions, the header moves below them: the
 * actions keep line 1. The content clears both. A float's sticky box is bound by this component's
 * whole box, not by a row, which is why it is not a flex or grid row. Pinned, the actions keep a
 * white background.
 * Fallback content (`<ng-content>`'s own children) shows the inputs only when nothing is
 * projected, so the server and the browser render the same markup.
 *
 * The class is not `PageLayout`: a class named `…Layout` is a routed layout (`qits/page-suffix`).
 */
@Component({
  selector: 'app-page-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flow-root', '[style.--page-actions-h]': "actionsHeight() + 'px'" },
  template: `
    <div
      #actionsBar
      class="sticky top-[var(--app-header-h,0px)] z-40 float-right flex min-h-10 max-w-full flex-wrap items-start justify-end gap-x-4 gap-y-2 bg-white py-1 pl-3 empty:hidden"
      data-page-actions
    >
      <ng-content select="[slot=actions], [uiPageActions]">
        @for (group of groups(); track $index) {
          <div
            class="flex flex-col-reverse items-center gap-0.5"
            [attr.role]="group.group ? 'group' : null"
            [attr.aria-label]="group.group ? (group.title ?? null) : null"
          >
            <span
              class="text-[0.525rem] leading-none font-semibold tracking-wide text-charcoal-brown-600 uppercase"
              [class]="group.title ? 'block' : 'hidden'"
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
    <div class="flex min-h-10 min-w-[min(12rem,100%)] items-center">
      <ng-content select="[slot=header], [uiPageHeader]">
        <h1 class="m-0 text-3xl leading-[1.1] font-bold">{{ title() }}</h1>
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

  private readonly actionsBar = viewChild.required<ElementRef<HTMLElement>>('actionsBar');

  /** The actions bar's height in px, kept current while it changes (0 when it has no actions). */
  protected readonly actionsHeight = signal(0);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      // Absent in jsdom (the plain specs); there the height stays 0.
      if (typeof ResizeObserver === 'undefined') return;
      const bar = this.actionsBar().nativeElement;
      const observer = new ResizeObserver(() => this.actionsHeight.set(bar.offsetHeight));
      observer.observe(bar);
      destroy.onDestroy(() => observer.disconnect());
    });
  }

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
