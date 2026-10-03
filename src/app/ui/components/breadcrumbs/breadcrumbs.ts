import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

/** One step of the trail. */
export interface Crumb {
  readonly label: string;
  readonly path: string;
}

/**
 * The breadcrumb trail. The projected content is its first item (the brand link home); then one
 * link per crumb, the last one marked as the current page.
 *
 * ```html
 * <ui-breadcrumbs [crumbs]="crumbs"><a routerLink="/">qits</a></ui-breadcrumbs>
 * ```
 *
 * Below 768px (the layout's burger breakpoint) only the first crumb and the last two show. One "…"
 * icon stands for the crumbs between them, names them in its label and takes the place of the
 * separators around it ("Projects … Work › qits-112"). With three crumbs or fewer nothing hides
 * and there is no "…". The breakpoint is CSS, so the server renders the same markup as the
 * browser, and the full trail stays in the DOM.
 *
 * The "…" is a button. While focus is inside the trail (`group-focus-within`), the whole trail
 * shows; a tap elsewhere or Escape takes the focus away and collapses it again. A press on a link
 * does not move the focus: the trail does not open or close under the pointer between press and
 * release, so the link's click lands. After that click the focus leaves the trail.
 */
@Component({
  selector: 'ui-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  host: { class: 'block min-w-0' },
  template: `
    <nav aria-label="Breadcrumb" (keydown.escape)="blur()">
      <ol
        class="group m-0 flex list-none items-center gap-2 p-0"
        (mousedown)="keepFocus($event)"
        (click)="leaveAfterLink($event)"
      >
        <li><ng-content /></li>
        @for (crumb of crumbs().slice(0, 1); track crumb.path) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: crumb, index: 0 }" />
        }
        <li
          class="items-center md:hidden group-focus-within:sr-only"
          [class]="collapsed() ? 'flex' : 'hidden'"
          data-crumbs-ellipsis
        >
          <button
            type="button"
            class="inline-flex cursor-pointer rounded-md border-0 bg-transparent p-0 text-gray-500 hover:text-gray-900 focus-visible:ring-1 focus-visible:ring-gray-400 focus-visible:outline-none"
            [attr.aria-label]="collapsed() ? 'Show the full path: ' + collapsed() : null"
            [attr.title]="collapsed() ? 'Show the full path: ' + collapsed() : null"
            (click)="focus($event)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" class="size-5" fill="currentColor">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>
        </li>
        @for (crumb of crumbs().slice(1); track crumb.path; let index = $index) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: crumb, index: index + 1 }" />
        }
      </ol>
    </nav>
    <ng-template #item let-crumb let-index="index">
      <li
        class="items-center gap-2"
        [class]="hides(index) ? 'hidden group-focus-within:flex md:flex' : 'flex'"
      >
        <!-- On a narrow screen the "…" replaces the separator of the crumb after it. -->
        <span
          aria-hidden="true"
          class="text-gray-400"
          [class]="followsEllipsis(index) ? 'hidden group-focus-within:inline md:inline' : ''"
          >›</span
        >
        <!-- One element for both cases (no @if): the last crumb is the current page. -->
        <a
          class="text-gray-600 no-underline hover:text-gray-900 aria-[current=page]:pointer-events-none aria-[current=page]:text-gray-900"
          [routerLink]="crumb.path"
          [attr.aria-current]="index === crumbs().length - 1 ? 'page' : null"
          >{{ crumb.label }}</a
        >
      </li>
    </ng-template>
  `,
})
export class Breadcrumbs {
  readonly crumbs = input.required<readonly Crumb[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The "…" takes the focus on a tap: Safari does not focus a button on click by itself. */
  protected focus(event: MouseEvent): void {
    (event.currentTarget as HTMLButtonElement).focus();
  }

  /** A press on a link keeps the focus where it is, so the trail does not change under it. */
  protected keepFocus(event: MouseEvent): void {
    if ((event.target as Element).closest('a')) event.preventDefault();
  }

  /** After a link's click, the focus leaves the trail and it collapses. */
  protected leaveAfterLink(event: MouseEvent): void {
    if ((event.target as Element).closest('a')) this.blur();
  }

  /** Takes the focus out of the trail, which collapses it. */
  protected blur(): void {
    const active = this.host.nativeElement.ownerDocument.activeElement;
    if (active instanceof HTMLElement && this.host.nativeElement.contains(active)) active.blur();
  }

  /** The crumbs between the first and the last two, which hide on a narrow screen. */
  private readonly middle = computed(() => this.crumbs().slice(1, -2));

  /** True for a crumb (by index) that hides on a narrow screen. */
  protected hides(index: number): boolean {
    return index >= 1 && index < 1 + this.middle().length;
  }

  /** True for the crumb right after the "…", whose separator hides on a narrow screen. */
  protected followsEllipsis(index: number): boolean {
    return this.middle().length > 0 && index === 1 + this.middle().length;
  }

  /** The hidden crumbs' labels as one trail ("qits"), or undefined when none hide. */
  protected readonly collapsed = computed(() => {
    const hidden = this.middle();
    return hidden.length ? hidden.map((crumb) => crumb.label).join(' › ') : undefined;
  });
}
