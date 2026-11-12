import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { QitsExit, type ExitOutcome } from '@qits/angular';
import { Dropdown } from '$ui/components/dropdown/dropdown';

/**
 * One step of the trail. A step before the current page leads to `exit` (a declared exit of the
 * layout that draws the trail, with its `params`); the current page, and a step without one, is
 * plain text.
 */
export interface Crumb {
  readonly label: string;
  readonly exit?: ExitOutcome;
  /** The exit's path params. */
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * The breadcrumb trail: the brand (`home`, the bold link home), then one link per crumb, the last
 * one the current page (not a link).
 *
 * It declares nothing (epic qits-2000): each crumb carries the exit its layout declares, bound to
 * `<a [qitsExit]>` (marked current only on its very page, `exitActiveExact`, so no ancestor reads as
 * the current page), and the current page is a plain `aria-current="page"` text.
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
 * Below 768px, where the two crumbs do not fit, the parent goes whole, its separator with it (the
 * separator is then the parent's own, after its label): the list wraps within one line's height,
 * reversed with the current page first, so the parent drops to the hidden second line rather
 * than shrinking to a sliver, and the current page keeps the whole width ("… Refinement"). It
 * truncates only when it is wider than the trail by itself. From 768px up the crumbs before the
 * current page give way first, a thousand times faster than the current page.
 */
@Component({
  selector: 'ui-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, QitsExit],
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
            @for (row of path(); track $index; let last = $last) {
              <li>
                @if (last || !row.exit) {
                  <span
                    class="block px-3 py-1.5 font-medium whitespace-normal break-words text-fg"
                    [attr.aria-current]="last ? 'page' : null"
                    >{{ row.label }}</span
                  >
                } @else {
                  <a
                    class="block px-3 py-1.5 whitespace-normal break-words text-fg-soft no-underline hover:bg-surface-muted hover:text-fg focus-visible:-outline-offset-2"
                    [qitsExit]="row.exit"
                    [exitParams]="row.params"
                    [exitActiveExact]="true"
                    (click)="dropdown().close()"
                    >{{ row.label }}</a
                  >
                }
              </li>
            }
          </ol>
        </ui-dropdown>
      </div>
      <!-- Below 768px the list runs reversed and wraps within one line's height, with the current
           page ordered first: the current page always takes the visible line, and the parent stays
           on it only when it fits whole, else it wraps out of sight. -->
      <ol
        class="m-0 flex min-w-0 list-none items-center overflow-hidden p-0 max-md:h-6 max-md:flex-row-reverse max-md:flex-wrap max-md:content-start max-md:justify-end"
      >
        <li
          class="hidden min-w-0 shrink-[1000] truncate *:focus-visible:-outline-offset-2 md:block"
        >
          @if (home().exit; as exit) {
            <a
              class="font-bold text-fg no-underline"
              [qitsExit]="exit"
              [exitParams]="home().params"
              [exitActiveExact]="true"
              >{{ home().label }}</a
            >
          } @else {
            <span class="font-bold text-fg">{{ home().label }}</span>
          }
        </li>
        @for (crumb of crumbs(); track $index; let index = $index) {
          <!-- A crumb before the current page shrinks a thousand times faster than the current page,
               and its separators go with it (the li clips). -->
          <li
            class="min-w-0 items-center overflow-hidden"
            [class]="
              (index < crumbs().length - 2 ? 'hidden md:flex' : 'flex') +
              (index === crumbs().length - 1 ? ' max-md:-order-1' : ' shrink-[1000]')
            "
          >
            <!-- Below 768px nothing separates the "…" from the first crumb that shows. -->
            <span
              aria-hidden="true"
              class="shrink-0 px-2 text-fg-faint"
              [class]="index >= crumbs().length - 2 ? 'hidden md:inline' : ''"
              >›</span
            >
            <!-- The current page (the last crumb) is text, not a link. -->
            @if (index === crumbs().length - 1 || !crumb.exit) {
              <span
                class="min-w-0 truncate text-fg-soft aria-[current=page]:text-fg"
                [attr.aria-current]="index === crumbs().length - 1 ? 'page' : null"
                >{{ crumb.label }}</span
              >
            } @else {
              <a
                class="min-w-0 truncate text-fg-soft focus-visible:-outline-offset-2 no-underline hover:text-fg"
                [qitsExit]="crumb.exit"
                [exitParams]="crumb.params"
                [exitActiveExact]="true"
                >{{ crumb.label }}</a
              >
            }
            <!-- Below 768px the parent carries the separator before the current page, so it goes
                 with the parent when the parent gives way. Drawn as generated content, so the
                 trail's text still has one "›" between the parent and the current page. -->
            @if (index === crumbs().length - 2) {
              <span
                aria-hidden="true"
                class="shrink-0 px-2 text-fg-faint after:content-['›'] md:hidden"
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

  /** The trail's first item, ahead of the crumbs: the brand, linking home through its exit. */
  readonly home = input<Crumb>({ label: 'qits' });

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
