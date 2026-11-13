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
import type { ValueMarks } from '$ui/dom/value-marks';
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
 * - Header: `title` as an `<h1>` (its data marks `titleMarks`, when it shows data), or projected
 *   `[slot=header]` / `[uiPageHeader]` content, which wins.
 * - Actions: `actions` (single actions and groups), or projected `[slot=actions]` /
 *   `[uiPageActions]` content, which wins. A group is joined buttons in a `role="group"` named by
 *   its title, which is also its visible caption, centred below the buttons. A group wider than the
 *   bar wraps its buttons inside the bar instead of spilling past its edge.
 * - Content: everything else.
 *
 * The actions stay pinned to the top of the box that scrolls the page while any of the page is in
 * view, at `--app-pin-top` (0 where unset): from 768px up that box is the shell's `<main>`, which
 * scrolls on its own below the top bar, so they pin at its top edge (0); below 768px the document
 * scrolls, so they pin just below the shell's top bar (its height). Their height is
 * `--page-actions-h` on this component, measured in the browser
 * (0 on the server and while there are no actions), so what pins inside the content (the board's
 * headings) sits below them instead of under them. The actions float right and come
 * first; the header after them is a box of its own (flex) beside the float, so a long title wraps
 * there first. Once less than 12rem is left beside the actions, the header moves below them: the
 * actions keep line 1. The content clears both. A float's sticky box is bound by this component's
 * whole box, not by a row, which is why it is not a flex or grid row. Pinned, the actions keep a
 * surface background.
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
      class="sticky top-[var(--app-pin-top,0px)] z-40 float-right flex min-h-10 max-w-full flex-wrap items-start justify-end-safe gap-x-4 gap-y-2 bg-surface py-1 pl-3 empty:hidden"
      data-page-actions
    >
      <ng-content select="[slot=actions], [uiPageActions]">
        @for (group of groups(); track $index) {
          <div
            class="flex min-w-0 max-w-full flex-col-reverse items-center gap-0.5"
            [attr.role]="group.group ? 'group' : null"
            [attr.aria-label]="group.group ? (group.title ?? null) : null"
          >
            <span
              class="text-[0.525rem] leading-none font-semibold tracking-wide text-fg-soft uppercase"
              [class]="group.title ? 'block' : 'hidden'"
              aria-hidden="true"
              >{{ group.title }}</span
            >
            <div class="flex flex-wrap justify-end gap-y-1">
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
        <h1
          class="m-0 text-3xl leading-[1.1] font-bold"
          [attr.data-qits-source]="titleMarks()?.source"
          [attr.data-qits-item]="titleMarks()?.item"
          [attr.data-qits-field]="titleMarks()?.field"
          [attr.data-qits-derived]="titleMarks()?.derived"
        >
          {{ title() }}
        </h1>
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

  /**
   * The title's data marks, when it shows data (qits-2146): a title is handed in already made
   * (`Agent <id>`, an idea's title), so the page makes its marks (`valueMarks`) and they are set on
   * the `<h1>` as is. None (the default) means the title is design copy.
   */
  readonly titleMarks = input<ValueMarks | undefined>(undefined);

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
