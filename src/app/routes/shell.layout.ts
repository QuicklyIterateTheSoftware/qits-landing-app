import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { FinishToasts } from '$patterns/work/finish-toasts/finish-toasts';
import { NotificationsMenu } from '$patterns/events/notifications-menu/notifications-menu';
import { BumpsMenu } from '$patterns/maintenance/bumps-menu/bumps-menu';
import { ReleaseMenu } from '$patterns/release-requests/release-menu/release-menu';

/** One entry of the sidebar. */
export interface NavLink {
  readonly label: string;
  readonly path: string;
  /** Other pages that belong to this section (the Work section's archive). */
  readonly also?: readonly string[];
}

/**
 * The platform's one layout: a top bar, a sidebar and the page. Mounted as the root route
 * component, so it survives navigation and only the outlet changes.
 *
 * From 768px up the sidebar is always shown. Below that, the burger shows and hides it. The
 * breakpoint is CSS, so the server renders the same markup as the browser.
 */
@Component({
  selector: 'app-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    BumpsMenu,
    FinishToasts,
    NotificationsMenu,
    ReleaseMenu,
  ],
  host: { class: 'block' },
  template: `
    <div class="grid min-h-screen grid-rows-[3.5rem_1fr] md:grid-cols-[15rem_1fr]">
      <header class="col-span-full flex items-center gap-3 border-b border-gray-200 bg-white px-4">
        <button
          type="button"
          class="inline-flex size-9 cursor-pointer flex-col justify-center gap-1 rounded-md border-0 bg-transparent p-2 md:hidden"
          aria-controls="layout-nav"
          [attr.aria-expanded]="navOpen()"
          aria-label="Navigation"
          (click)="toggleNav()"
        >
          <span class="block h-0.5 bg-gray-700"></span>
          <span class="block h-0.5 bg-gray-700"></span>
          <span class="block h-0.5 bg-gray-700"></span>
        </button>
        <nav aria-label="Breadcrumb">
          <ol class="m-0 flex list-none items-center gap-2 p-0">
            <li><a class="font-bold text-gray-900 no-underline" routerLink="/">qits</a></li>
            @for (crumb of crumbs(); track crumb.path; let last = $last) {
              <li class="flex items-center gap-2">
                <span aria-hidden="true" class="text-gray-400">›</span>
                <!-- One element for both cases (no @if): the last crumb is the current page. -->
                <a
                  class="text-gray-600 no-underline hover:text-gray-900 aria-[current=page]:pointer-events-none aria-[current=page]:text-gray-900"
                  [routerLink]="crumb.path"
                  [attr.aria-current]="last ? 'page' : null"
                  >{{ crumb.label }}</a
                >
              </li>
            }
          </ol>
        </nav>
        <!-- The menus at the right end: the platform's version bumps and notifications (always), then the open
             project's release requests and its settings (both hidden, not removed, while no
             project is open). -->
        <div class="ml-auto flex items-center gap-1">
          <app-bumps-menu />
          <app-notifications-menu />
          <app-release-menu />
          <a
            class="size-9 items-center justify-center rounded-md text-gray-500 no-underline hover:bg-gray-100 hover:text-gray-900 aria-[current=page]:text-gray-900"
            [class]="settingsPath() ? 'inline-flex' : 'hidden'"
            [routerLink]="settingsPath() ?? '/projects'"
            routerLinkActive=""
            ariaCurrentWhenActive="page"
            aria-label="Settings"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </a>
        </div>
      </header>

      <nav
        id="layout-nav"
        class="z-1 col-start-1 row-start-2 border-r border-gray-200 bg-gray-50 md:block"
        [class.hidden]="!navOpen()"
        aria-label="qits"
      >
        <ul class="m-0 list-none px-2 py-3">
          @for (link of links(); track link.path) {
            <li>
              <a
                class="block rounded-md px-3 py-[0.4rem] text-gray-700 no-underline hover:bg-gray-100 aria-[current=page]:bg-gray-200 aria-[current=page]:font-semibold aria-[current=page]:text-gray-900"
                [routerLink]="link.path"
                [attr.aria-current]="link.path === section()?.path ? 'page' : null"
                (click)="closeNav()"
                >{{ link.label }}</a
              >
            </li>
          }
        </ul>
      </nav>

      <main class="col-start-1 row-start-2 min-w-0 md:col-start-2">
        <router-outlet />
      </main>
    </div>
    <!-- The board's finishes and their Undo, kept while the user moves between pages. -->
    <app-finish-toasts />
  `,
})
export class ShellLayout {
  private readonly selected = inject(SelectedProject);

  /**
   * The sidebar lists the open project's sections; with no project open it is empty. Where you
   * are is the breadcrumb's job, so the sidebar does not repeat the project's name.
   */
  protected readonly links = computed((): readonly NavLink[] => {
    const slug = this.selected.slug();
    return slug === undefined
      ? []
      : [
          {
            label: 'Work',
            path: `/projects/${slug}/work`,
            also: [`/projects/${slug}/work-archive`],
          },
          { label: 'Editor', path: `/projects/${slug}/editor` },
          { label: 'Repositories', path: `/projects/${slug}/repositories` },
          { label: 'Observability', path: `/projects/${slug}/observability` },
          { label: 'Events', path: `/projects/${slug}/events` },
        ];
  });

  /**
   * The trail after the "qits" brand: "Projects", then the open project's name, then the section
   * the URL is in ("Work", or "Setup" from the gear), then a subpage of it (Work › Archive). The
   * last crumb is the current page and is
   * not a link.
   */
  protected readonly crumbs = computed((): readonly NavLink[] => {
    const projects: NavLink = { label: 'Projects', path: '/projects' };
    const project = this.selected.project();
    const slug = this.selected.slug();
    if (!project || !slug) return [projects];
    const crumbs = [projects, { label: project.name ?? slug, path: `/projects/${slug}` }];
    const section = this.section();
    if (!section) return crumbs;
    // A section's own subpages, one level deep: Work › Archive, Work › <item id>.
    const sub = workSubpage(this.selected.url(), `/projects/${slug}`);
    return sub ? [...crumbs, section, sub] : [...crumbs, section];
  });

  /** The section the URL is in: a sidebar link, or Setup from the gear. */
  protected readonly section = computed((): NavLink | undefined => {
    const slug = this.selected.slug();
    if (slug === undefined) return undefined;
    const url = this.selected.url();
    return [...this.links(), { label: 'Setup', path: `/projects/${slug}/setup` }].find((link) =>
      [link.path, ...(link.also ?? [])].some((path) => within(url, path)),
    );
  });

  /** The open project's settings page, or undefined while no project is open. */
  protected readonly settingsPath = computed(() => {
    const slug = this.selected.slug();
    return slug === undefined ? undefined : `/projects/${slug}/setup`;
  });

  protected readonly navOpen = signal(false);

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }
}

/** True when `url` is `path` or a page below it, query and fragment ignored. */
function within(url: string, path: string): boolean {
  return url === path || /^[/?#]/.test(url.startsWith(path) ? url.slice(path.length) : 'x');
}

/**
 * The crumb of a page below the work section of the project at `project` (`/projects/<slug>`):
 * `<project>/work-archive` or `<project>/work/<item id>`. Undefined for the section itself and
 * anything outside it.
 */
export function workSubpage(url: string, project: string): NavLink | undefined {
  const archive = `${project}/work-archive`;
  if (within(url, archive)) return { label: 'Archive', path: archive };
  const work = `${project}/work`;
  const rest = url.startsWith(`${work}/`) ? url.slice(work.length + 1).split(/[/?#]/)[0] : '';
  if (!rest) return undefined;
  return { label: decodeURIComponent(rest), path: `${work}/${rest}` };
}
