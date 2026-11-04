import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dropdown } from '$ui/components/dropdown/dropdown';

/** One step of the trail. */
export interface Crumb {
  readonly label: string;
  readonly path: string;
}

/**
 * The breadcrumb trail: the brand (`home`, the bold link home), then one link per crumb, the last
 * one the current page (not a link).
 *
 * ```html
 * <ui-breadcrumbs [crumbs]="crumbs" />
 * ```
 *
 * From 768px up (the layout's burger breakpoint) the whole trail shows: "qits › Projects › qits ›
 * Work › qits-112". Below that only the current page and its parent show, after a "…" menu button
 * and with no separator between the "…" and the parent ("… Work › qits-112"). The breakpoint is CSS,
 * so the server renders the same markup as the browser, and the full trail stays in the DOM.
 *
 * The "…" is a `ui-dropdown` whose panel hangs from its left edge and lists the whole path, one
 * row each, top-down: the brand, every crumb before the current page as a link, then the current
 * page, in full and wrapping, never truncated. Its label names the rows before the current page.
 * Following a link in the panel closes it; Escape or a click outside does too, as for any dropdown.
 * The "…" sits outside the trail's list, which clips, so nothing clips the panel.
 *
 * Where even the two crumbs do not fit, the parent gives way first (a thousand times faster than
 * the current page): it truncates with an ellipsis and then goes, its separator with it (below
 * 768px the separator is the parent's own, after its label), so at worst the trail reads
 * "… qits-112". The current page truncates only once the parent is gone.
 */
@Component({
  selector: 'ui-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, RouterLink],
  host: { class: 'flex min-w-0 items-center' },
  template: `
    <nav aria-label="Breadcrumb" class="flex min-w-0 items-center">
      <div class="flex shrink-0 md:hidden" data-crumbs-ellipsis>
        <ui-dropdown
          align="start"
          [label]="'Show the full path: ' + ancestors()"
          panelLabel="Full path"
        >
          <svg
            dropdown-trigger
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="size-5"
            fill="currentColor"
          >
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
          <ol dropdown-panel class="m-0 list-none py-1 pl-0 text-sm">
            @for (row of path(); track row.path; let last = $last) {
              <li>
                @if (last) {
                  <span
                    class="block px-3 py-1.5 font-medium whitespace-normal break-words text-gray-900"
                    aria-current="page"
                    >{{ row.label }}</span
                  >
                } @else {
                  <a
                    class="block px-3 py-1.5 whitespace-normal break-words text-gray-600 no-underline hover:bg-gray-100 hover:text-gray-900 focus-visible:-outline-offset-2"
                    [routerLink]="row.path"
                    (click)="dropdown().close()"
                    >{{ row.label }}</a
                  >
                }
              </li>
            }
          </ol>
        </ui-dropdown>
      </div>
      <ol class="m-0 flex min-w-0 list-none items-center overflow-hidden p-0">
        <li
          class="hidden min-w-0 shrink-[1000] truncate *:focus-visible:-outline-offset-2 md:block"
        >
          <a class="font-bold text-gray-900 no-underline" [routerLink]="home().path">{{
            home().label
          }}</a>
        </li>
        @for (crumb of crumbs(); track crumb.path; let index = $index) {
          <!-- A crumb before the current page shrinks a thousand times faster than the current page,
               and its separators go with it (the li clips). -->
          <li
            class="min-w-0 items-center overflow-hidden"
            [class]="
              (index < crumbs().length - 2 ? 'hidden md:flex' : 'flex') +
              (index === crumbs().length - 1 ? '' : ' shrink-[1000]')
            "
          >
            <!-- Below 768px nothing separates the "…" from the first crumb that shows. -->
            <span
              aria-hidden="true"
              class="shrink-0 px-2 text-gray-400"
              [class]="index >= crumbs().length - 2 ? 'hidden md:inline' : ''"
              >›</span
            >
            <!-- One element for both cases (no @if): the last crumb is the current page. -->
            <a
              class="min-w-0 truncate text-gray-600 focus-visible:-outline-offset-2 no-underline hover:text-gray-900 aria-[current=page]:pointer-events-none aria-[current=page]:text-gray-900"
              [routerLink]="crumb.path"
              [attr.aria-current]="index === crumbs().length - 1 ? 'page' : null"
              >{{ crumb.label }}</a
            >
            <!-- Below 768px the parent carries the separator before the current page, so it goes
                 with the parent when the parent gives way. Drawn as generated content, so the
                 trail's text still has one "›" between the parent and the current page. -->
            @if (index === crumbs().length - 2) {
              <span
                aria-hidden="true"
                class="shrink-0 px-2 text-gray-400 after:content-['›'] md:hidden"
              ></span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class Breadcrumbs {
  readonly crumbs = input.required<readonly Crumb[]>();

  /** The trail's first item, ahead of the crumbs: the brand, linking home. */
  readonly home = input<Crumb>({ label: 'qits', path: '/' });

  /** The "…" menu, which a link in its panel closes as it navigates. */
  protected readonly dropdown = viewChild.required(Dropdown);

  /** The whole path, as the "…" panel lists it: the brand, then every crumb. */
  protected readonly path = computed(() => [this.home(), ...this.crumbs()]);

  /** The labels of the panel's rows before the current page, as one trail ("qits › Projects"). */
  protected readonly ancestors = computed(() =>
    this.path()
      .slice(0, -1)
      .map((crumb) => crumb.label)
      .join(' › '),
  );
}
