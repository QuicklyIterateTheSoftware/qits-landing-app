import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { exit, itemMark, outcomes, QitsExit, sourceMark, type ExitOutcome } from '@qits/angular';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { PROJECT_LIST, PROJECT_RELEASE_REQUESTS } from '$core/projects/projects.operations';
import {
  findReleaseRequest,
  latestReleaseRequest,
  releaseRequestName,
  requestBadge,
  requestTitle,
} from '$core/projects/release-requests';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { WORK_DETAIL, WORK_TABS } from '$core/work/work-tabs';
import { LIST_PROJECT_ACTIVE_AGENTS } from '$core/workspaces/agents.operations';
import { ProjectActiveAgents } from '$core/workspaces/project-active-agents';
import { FinishToasts } from '$patterns/work/finish-toasts/finish-toasts';
import { NotificationsMenu } from '$patterns/events/notifications-menu/notifications-menu';
import { BumpsMenu } from '$patterns/maintenance/bumps-menu/bumps-menu';
import { ReleaseMenu } from '$patterns/release-requests/release-menu/release-menu';
import { AgentsMenu } from '$patterns/agents/agents-menu/agents-menu';
import { ThemeChoices } from '$patterns/appearance/theme-choices/theme-choices';
import { ThemeMenu } from '$patterns/appearance/theme-menu/theme-menu';
import { Breadcrumbs, type Crumb, type CrumbMarks } from '$ui/components/breadcrumbs/breadcrumbs';
import { chipClass, type ChipTone } from '$ui/components/chip/chip';

/** A page of the trail or the sidebar: its label and its URL, which says where the user is. */
export interface NavPage {
  readonly label: string;
  /** The page's URL (absolute, `/projects/…`), matched against the router's. */
  readonly path: string;
  /** Where a label that is data comes from (qits-2141): a request's or an agent's crumb. */
  readonly marks?: CrumbMarks;
}

/** The shell's sections: one per sidebar entry, and Setup from the gear. */
type SectionKey =
  | 'work'
  | 'ideas'
  | 'agents'
  | 'releaseRequests'
  | 'desk'
  | 'repositories'
  | 'observability'
  | 'events'
  | 'setup';

/** A page of the open project the sidebar or the gear leads to: its exit takes the slug alone. */
type ProjectPageExit = ExitOutcome<`projects/:slug/${
  | 'work'
  | 'work/refinement'
  | 'work/schedule'
  | 'work/in-progress'
  | 'work/acceptance'
  | 'work/archive'
  | 'ideas'
  | 'agents'
  | 'release-requests'
  | 'desk'
  | 'repositories'
  | 'observability'
  | 'events'
  | 'setup'}`>;

/** One entry of the sidebar, or Setup (the gear's section, no entry). */
export interface NavLink extends NavPage {
  readonly key: SectionKey;
  /** Where the entry leads: its declared exit (epic qits-2000), with the open project's slug. */
  readonly exit: ProjectPageExit;
  /** The section's own pages, listed below it in the sidebar while the section is open. */
  readonly children?: readonly NavChild[];
  /** A line below the label: what is newest in the section, with a chip. */
  readonly note?: NavNote;
}

/** One of a section's own pages, below it in the sidebar. */
export interface NavChild extends NavPage {
  readonly exit: ProjectPageExit;
}

/** The line below a sidebar entry's label. */
export interface NavNote {
  readonly text: string;
  readonly chip: string;
  readonly tone: ChipTone;
  /** The full story, on hover. */
  readonly title: string;
  /** Where the line comes from (qits-2141): the read, the record, the fields it is derived from. */
  readonly marks: CrumbMarks;
}

/**
 * The platform's one layout: a top bar, a sidebar and the page. Mounted as the root route
 * component, so it survives navigation and only the outlet changes.
 *
 * From 768px up the sidebar is always shown. Below that, the burger shows and hides it. The
 * breakpoint is CSS, so the server renders the same markup as the browser.
 *
 * The page's column is `minmax(0,1fr)`, not `1fr` or an implicit track: those grow to the top
 * bar's min-content (the trail and the menus, which do not wrap), and on a phone that widened the
 * whole page past the screen. The trail truncates instead.
 *
 * Below 768px the top bar's padding and gaps tighten, so on a phone the trail keeps room for its
 * "…" and the current page beside the burger and all five menus. The network-access link is the
 * sixth and shows from 768px only: on a phone it would clip the current page (qits-1977). The
 * theme menu (qits-2086) is the seventh and shows from 768px only for the same reason; below
 * 768px the same radios (`app-theme-choices`) sit at the foot of the burger's navigation.
 *
 * Who scrolls (qits-2050): from 768px up the shell is exactly the window's height and the window
 * never scrolls; the sidebar and the page (`<main>`) each scroll on their own, with their own
 * scrollbar, so a long page does not carry the sidebar away and a long sidebar does not move the
 * page. Below 768px the document scrolls, as on any phone page: the top bar stays pinned to the
 * top of the window and the sidebar lies over the page. There it sits at `z-48`, above every layer
 * the page pins or raises (up to the work section's tabs, `z-45`) and below the top bar (`z-50`), so
 * nothing of the page shows through it and the burger still closes it (qits-2224). What pins at the
 * top of the scrolling box (the page's actions, the board's headings) reads `--app-pin-top`, which
 * covers both cases.
 *
 * Shell navigation is declared once, here (epic qits-2000, owner decision 3), and app-wide: the
 * sidebar's sections (`open-sidebar-section`) and the work pages below Work
 * (`open-sidebar-work-page`, one exit per `WORK_TABS` entry), the gear (`open-project-settings`),
 * the network icon (`open-network-access`), and the trail's brand and crumbs
 * (`follow-breadcrumb`), handed to `ui-breadcrumbs` as each crumb's exit and params. The agents and
 * release menus declare their own, being patterns (app-wide too). The gear, the network icon and a
 * work page are marked current by `[qitsExit]`; a section keeps its own rule (`currentOf`: `true`
 * while one of its pages below it is open, and Agents on a slot's page), given to `[qitsExit]`
 * through `[exitCurrent]` (qits-2064).
 *
 * What the shell shows of the platform comes from root services, each one `qitsResource` the shell
 * and the project pages share (qits-2146), never a store: the open project (`SelectedProject`),
 * its release requests (`ProjectReleaseRequests`: the sidebar's Release Requests line, a request's
 * crumb, and the lightning menu, which the shell hands that resource) and its ACTIVE agents
 * (`ProjectActiveAgents`: an agent's crumb, and the agents menu, which the shell hands that
 * resource). Their staleness is each resource's `refreshOn` (see each
 * service). What it shows of them is data the template cannot trace to a resource of its own, so
 * it carries its data marks (qits-2141) as plain attributes: the trail's crumbs (`CrumbMarks`) and
 * the sidebar's line (`data-qits-source`, `data-qits-item`, `data-qits-derived`).
 */
@Component({
  selector: 'app-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgentsMenu,
    Breadcrumbs,
    QitsExit,
    RouterOutlet,
    BumpsMenu,
    FinishToasts,
    NotificationsMenu,
    ReleaseMenu,
    ThemeChoices,
    ThemeMenu,
  ],
  // `--app-header-h`: the top bar's fixed height (what sits below the bar in the window reads it,
  // such as a menu's sheet on a phone). `--app-pin-top`: where what pins at the top of the scrolling
  // box (the page's actions, the board's headings) pins. Below 768px the document scrolls under the
  // pinned bar, so it is the bar's height; `<main>` sets it to 0 from 768px up, where `<main>` is
  // the scrolling box and the bar lies outside it. Outside the shell both are unset and read as 0.
  host: { class: 'block [--app-header-h:3.5rem] [--app-pin-top:var(--app-header-h)]' },
  template: `
    <div
      class="grid min-h-screen grid-cols-[minmax(0,1fr)] grid-rows-[var(--app-header-h)_1fr] md:h-dvh md:min-h-0 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[var(--app-header-h)_minmax(0,1fr)]"
    >
      <!-- At the top of the window, always. Below 768px the document scrolls and the bar is
           pinned over it; from 768px up the shell is the window's height and the bar stays put
           while the sidebar and the page below it scroll each on their own. -->
      <header
        class="sticky top-0 z-50 col-span-full flex items-center gap-1 border-b border-line bg-surface px-2 md:gap-3 md:px-4"
      >
        <button
          type="button"
          class="inline-flex size-9 shrink-0 cursor-pointer flex-col justify-center gap-1 rounded-md border-0 bg-transparent p-2 md:hidden"
          aria-controls="layout-nav"
          [attr.aria-expanded]="navOpen()"
          aria-label="Navigation"
          (click)="toggleNav()"
        >
          <span class="block h-0.5 bg-fg-control"></span>
          <span class="block h-0.5 bg-fg-control"></span>
          <span class="block h-0.5 bg-fg-control"></span>
        </button>
        <ui-breadcrumbs [home]="home" [crumbs]="crumbs()" />
        <!-- The menus at the right end: the platform's network access (from 768px), version bumps
             and notifications (always), then the open project's agents and its release requests,
             the theme (from 768px, qits-2086), and the open project's settings (agents, release
             requests and settings hidden, not removed, while no project is open). -->
        <div class="ml-auto flex items-center gap-1">
          <a
            class="hidden size-9 items-center justify-center rounded-md text-fg-muted no-underline hover:bg-surface-muted hover:text-fg md:inline-flex aria-[current=page]:text-fg"
            [qitsExit]="network.open"
            aria-label="Network access"
            title="Network access"
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
              <rect x="9" y="2" width="6" height="6" rx="1" />
              <rect x="2" y="16" width="6" height="6" rx="1" />
              <rect x="16" y="16" width="6" height="6" rx="1" />
              <path d="M12 8v4M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
            </svg>
          </a>
          <app-bumps-menu />
          <app-notifications-menu />
          <app-agents-menu [agents]="activeAgents.resource" [state]="agentsState()" />
          <app-release-menu
            [requests]="releaseRequests.resource"
            [state]="releaseRequests.state()"
          />
          <app-theme-menu class="max-md:hidden" />
          <a
            class="size-9 items-center justify-center rounded-md text-fg-muted no-underline hover:bg-surface-muted hover:text-fg aria-[current=page]:text-fg"
            [class]="slug() ? 'inline-flex' : 'hidden'"
            [qitsExit]="settings.open"
            [exitParams]="{ slug: slug() }"
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
        class="z-1 col-start-1 row-start-2 border-r border-line bg-surface-subtle max-md:z-48 md:block md:min-h-0 md:overflow-y-auto"
        [class.hidden]="!navOpen()"
        aria-label="qits"
      >
        <ul class="m-0 list-none px-2 py-3">
          @for (link of links(); track link.key) {
            <li>
              <a
                class="group block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg aria-[current=true]:font-semibold aria-[current=true]:text-fg"
                [qitsExit]="link.exit"
                [exitParams]="{ slug: slug() }"
                [exitCurrent]="currentOf(link)"
                (click)="closeNav()"
                >{{ link.label }}
                <!-- The section's newest item, below the label; switched by class. -->
                <span
                  class="mt-0.5 items-center gap-1.5 text-xs font-normal text-fg-muted group-aria-[current=page]:text-fg-soft"
                  [class]="link.note ? 'flex' : 'hidden'"
                  [attr.title]="link.note?.title"
                  [attr.data-qits-source]="link.note?.marks?.source"
                  [attr.data-qits-item]="link.note?.marks?.item"
                  [attr.data-qits-derived]="link.note?.marks?.derived"
                >
                  <span class="min-w-0 truncate">{{ link.note?.text }}</span>
                  <span
                    class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                    [class]="chip(link.note?.tone)"
                    >{{ link.note?.chip }}</span
                  >
                </span></a
              >
              <!-- The open section's pages, indented below it; switched by class, so the server
                   render hydrates as is. -->
              <ul
                class="m-0 mt-0.5 mb-1 ml-3 list-none border-l border-line pl-2"
                [class.hidden]="!link.children?.length || link.path !== section()?.path"
              >
                @for (child of link.children ?? []; track child.path) {
                  <li>
                    <a
                      class="block rounded-md px-3 py-[0.3rem] text-sm text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                      [qitsExit]="child.exit"
                      [exitParams]="{ slug: slug() }"
                      (click)="closeNav()"
                      >{{ child.label }}</a
                    >
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
        <!-- Below 768px the top bar has no room for the theme menu: its radios sit here instead. -->
        <app-theme-choices class="border-t border-line px-5 py-3 md:hidden" name="theme-nav" />
      </nav>

      <main
        class="col-start-1 row-start-2 min-w-0 md:col-start-2 md:min-h-0 md:overflow-y-auto md:[--app-pin-top:0px]"
      >
        <router-outlet />
      </main>
    </div>
    <!-- The board's finishes and their Undo, kept while the user moves between pages. -->
    <app-finish-toasts />
  `,
})
export class ShellLayout {
  private readonly selected = inject(SelectedProject);
  protected readonly releaseRequests = inject(ProjectReleaseRequests);
  protected readonly activeAgents = inject(ProjectActiveAgents);

  /** The agents menu's spinner: the agents' read, as the menu's own read was. */
  protected readonly agentsState = computed(() => loadState(this.activeAgents.resource));

  /** The sidebar's sections, one exit each (epic qits-2000). */
  private readonly sections = outcomes('open-sidebar-section', {
    work: exit('projects/:slug/work'),
    ideas: exit('projects/:slug/ideas'),
    agents: exit('projects/:slug/agents'),
    releaseRequests: exit('projects/:slug/release-requests'),
    desk: exit('projects/:slug/desk'),
    repositories: exit('projects/:slug/repositories'),
    observability: exit('projects/:slug/observability'),
    events: exit('projects/:slug/events'),
  });

  /** The work pages below Work in the sidebar, one exit per page (epic qits-2000). */
  private readonly workPages = outcomes('open-sidebar-work-page', {
    refinement: exit('projects/:slug/work/refinement'),
    schedule: exit('projects/:slug/work/schedule'),
    inProgress: exit('projects/:slug/work/in-progress'),
    acceptance: exit('projects/:slug/work/acceptance'),
    archive: exit('projects/:slug/work/archive'),
  });

  /** Each work page's exit, by its segment (`WORK_TABS`). */
  private readonly workPageExits: Readonly<Record<string, ProjectPageExit>> = {
    refinement: this.workPages.refinement,
    schedule: this.workPages.schedule,
    'in-progress': this.workPages.inProgress,
    acceptance: this.workPages.acceptance,
    archive: this.workPages.archive,
  };

  /** The gear: the open project's settings (epic qits-2000). */
  protected readonly settings = outcomes('open-project-settings', {
    open: exit('projects/:slug/setup'),
  });

  /** The network icon: the Network access page (epic qits-2000). */
  protected readonly network = outcomes('open-network-access', {
    open: exit('network-access'),
  });

  /**
   * The trail's brand and its crumbs before the current page (epic qits-2000): home, the picker,
   * the project, and the sections a subpage crumb can follow (Work, Agents, Release Requests).
   */
  private readonly trail = outcomes('follow-breadcrumb', {
    home: exit(''),
    projects: exit('projects'),
    project: exit('projects/:slug'),
    work: exit('projects/:slug/work'),
    agents: exit('projects/:slug/agents'),
    releaseRequests: exit('projects/:slug/release-requests'),
  });

  /** A section's crumb's exit, for the sections with a subpage below them. */
  private readonly sectionCrumbExits: Partial<Record<SectionKey, ExitOutcome>> = {
    work: this.trail.work,
    agents: this.trail.agents,
    releaseRequests: this.trail.releaseRequests,
  };

  /** The trail's brand, home. */
  protected readonly home: Crumb = { label: 'qits', exit: this.trail.home };

  /** The open project's slug, the exits' param; empty while no project is open. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /**
   * The open project's newest release request (`latestReleaseRequest`), as the line below the
   * sidebar's Release Requests entry: its repository and version, and its state. The requests are
   * `ProjectReleaseRequests`', read when the project opens; until they are there, and for a project
   * without any, there is no line.
   *
   * Staleness (qits-1270): that resource's `RELEASE_REQUEST_EVENTS` `refreshOn` reads the answer
   * again, so a request FINALIZED by `ReleaseRequestStateChanged` moves this line too.
   */
  private readonly latestRelease = computed((): NavNote | undefined => {
    const latest = latestReleaseRequest(this.releaseRequests.requests());
    if (!latest) return undefined;
    const badge = requestBadge(latest);
    const text = [latest.repoName, latest.version].filter(Boolean).join(' ');
    return {
      text,
      chip: badge.label,
      tone: badge.tone,
      title: `${text}: ${requestTitle(latest)} (${badge.label})`,
      marks: {
        source: sourceMark(PROJECT_RELEASE_REQUESTS),
        item: itemMark('id', latest.id),
        derived: 'repoName version state approvalRequired approvalState updatedAt',
      },
    };
  });

  /**
   * The sidebar lists the open project's sections; with no project open it is empty. Where you
   * are is the breadcrumb's job, so the sidebar does not repeat the project's name.
   */
  protected readonly links = computed((): readonly NavLink[] => {
    const slug = this.selected.slug();
    if (slug === undefined) return [];
    const params = { slug };
    const link = (key: SectionKey, label: string, to: ProjectPageExit): NavLink => ({
      key,
      label,
      exit: to,
      path: to.url(params),
    });
    const sections = this.sections;
    return [
      {
        ...link('work', 'Work', sections.work),
        children: WORK_TABS.flatMap((tab) => {
          const to = this.workPageExits[tab.segment];
          return to ? [{ label: tab.label, exit: to, path: to.url(params) }] : [];
        }),
      },
      link('ideas', 'Ideas', sections.ideas),
      link('agents', 'Agents', sections.agents),
      {
        ...link('releaseRequests', 'Release Requests', sections.releaseRequests),
        note: this.latestRelease(),
      },
      link('desk', 'Desk', sections.desk),
      link('repositories', 'Repositories', sections.repositories),
      link('observability', 'Observability', sections.observability),
      link('events', 'Events', sections.events),
    ];
  });

  /**
   * The trail after the "qits" brand: "Projects", then the open project's name, then the section
   * the URL is in ("Work", or "Setup" from the gear), then a subpage of it (Work › Archive,
   * Work › <item id>, Release Requests › <request id>, Agents › <agent's item id>, Agents ›
   * ws-<slot id>). The last crumb is the current page and is not a link; each one before it leads
   * through its `follow-breadcrumb` exit.
   */
  protected readonly crumbs = computed((): readonly Crumb[] => {
    const projects: Crumb = { label: 'Projects', exit: this.trail.projects };
    const project = this.selected.project();
    const slug = this.selected.slug();
    if (!project || !slug) return [projects];
    const params = { slug };
    const crumbs: Crumb[] = [
      projects,
      {
        label: project.name ?? slug,
        exit: this.trail.project,
        params,
        marks: {
          source: sourceMark(PROJECT_LIST),
          item: itemMark('id', project.id),
          field: 'name',
        },
      },
    ];
    const found = this.section();
    if (!found) return crumbs;
    const section: Crumb = {
      label: found.label,
      exit: this.sectionCrumbExits[found.key],
      params,
    };
    // A section's own subpages, one level deep: Work › In Progress, Work › <item id>,
    // Release Requests › <request id>.
    const url = this.selected.url();
    const requests = this.releaseRequests.requests();
    const agents = this.activeAgents.agents();
    const sub =
      workSubpage(url, `/projects/${slug}`) ??
      releaseRequestSubpage(url, `/projects/${slug}`, requests) ??
      slotSubpage(url, `/projects/${slug}`) ??
      agentSubpage(url, `/projects/${slug}`, agents);
    return sub
      ? [...crumbs, section, { label: sub.label, marks: sub.marks }]
      : [...crumbs, section];
  });

  /**
   * The section the URL is in (its page or one below it): a sidebar link, or Setup from the gear.
   * A slot's page (`workspaces/<slot id>`) is in Agents.
   */
  protected readonly section = computed((): NavLink | undefined => {
    const slug = this.selected.slug();
    if (slug === undefined) return undefined;
    const url = this.selected.url();
    if (within(url, `/projects/${slug}/${WORKSPACES}`)) {
      return this.links().find((link) => link.key === 'agents');
    }
    const setup: NavLink = {
      key: 'setup',
      label: 'Setup',
      exit: this.settings.open,
      path: this.settings.open.url({ slug }),
    };
    return [...this.links(), setup].find((link) => within(url, link.path));
  });

  /** Whether the URL is `page` or one below it. */
  private isAt(page: NavPage): boolean {
    return within(this.selected.url(), page.path);
  }

  /**
   * A section's `aria-current`: `page` when it is the current page, `true` when the current page
   * is one of its own pages in the sidebar below it (or another page of the section).
   */
  protected currentOf(link: NavLink): 'page' | 'true' | null {
    if (link.path !== this.section()?.path) return null;
    return link.children?.some((child) => this.isAt(child)) ? 'true' : 'page';
  }

  /** A note's chip colours; neutral while there is no note. */
  protected chip(tone: ChipTone | undefined): string {
    return chipClass(tone ?? 'neutral');
  }

  protected readonly navOpen = signal(false);

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }
}

/** The release requests section's segment below a project: `/projects/<slug>/release-requests`. */
export const RELEASE_REQUESTS = 'release-requests';

/** The desk section's segment below a project: `/projects/<slug>/desk`. */
export const DESK = 'desk';

/** The ideas section's segment below a project: `/projects/<slug>/ideas` (epic qits-888). */
export const IDEAS = 'ideas';

/** True when `url` is `path` or a page below it, query and fragment ignored. */
function within(url: string, path: string): boolean {
  return url === path || /^[/?#]/.test(url.startsWith(path) ? url.slice(path.length) : 'x');
}

/** The agents section's segment below a project: `/projects/<slug>/agents` (epic qits-1681). */
export const AGENTS = 'agents';

/**
 * The slots' segment below a project: `/projects/<slug>/workspaces/<slot id>`, a page of the
 * agents section (the bare `workspaces` redirects to `agents`).
 */
export const WORKSPACES = 'workspaces';

/**
 * The crumb of one workspace slot below the project at `project` (`/projects/<slug>`):
 * `<project>/workspaces/<slot id>` is "ws-<slot id>". Undefined for the list itself, a page whose
 * segment is not a slot id, and anything outside it.
 */
export function slotSubpage(url: string, project: string): NavPage | undefined {
  const prefix = `${project}/${WORKSPACES}/`;
  if (!url.startsWith(prefix)) return undefined;
  const id = url.slice(prefix.length).split(/[?#]/)[0].split('/')[0];
  return /^\d+$/.test(id) ? { label: `ws-${id}`, path: `${prefix}${id}` } : undefined;
}

/**
 * The crumb of one agent below the project at `project` (`/projects/<slug>`):
 * `<project>/agents/<agent id>` (and its tabs below) names the agent by its work item's qualified
 * id, found in `agents` (the project's ACTIVE agents, as `ProjectActiveAgents` holds them); an agent not
 * among them by its id's first eight characters. Undefined for the list itself and anything outside
 * it.
 */
export function agentSubpage(
  url: string,
  project: string,
  agents: readonly { readonly agentId?: string; readonly entityId?: string }[] = [],
): NavPage | undefined {
  const prefix = `${project}/${AGENTS}/`;
  if (!url.startsWith(prefix)) return undefined;
  const id = url.slice(prefix.length).split(/[?#]/)[0].split('/')[0];
  if (!id) return undefined;
  const agentId = decodeURIComponent(id);
  const item = agents.find((agent) => agent.agentId === agentId)?.entityId;
  return {
    label: item ?? agentId.slice(0, 8),
    path: `${prefix}${id}`,
    marks: item
      ? {
          source: sourceMark(LIST_PROJECT_ACTIVE_AGENTS),
          item: itemMark('agentId', agentId),
          field: 'entityId',
        }
      : undefined,
  };
}

/**
 * The crumb of a page below the work section of the project at `project` (`/projects/<slug>`):
 * one of its tabs (`<project>/work/in-progress` is "In Progress") or an item
 * (`<project>/work/detail/<item id>` is the id). Undefined for the section itself and anything
 * outside it.
 */
export function workSubpage(url: string, project: string): NavPage | undefined {
  const work = `${project}/work`;
  const [first, second] = url.startsWith(`${work}/`)
    ? url
        .slice(work.length + 1)
        .split(/[?#]/)[0]
        .split('/')
    : [];
  if (first === WORK_DETAIL && second) {
    return { label: decodeURIComponent(second), path: `${work}/${WORK_DETAIL}/${second}` };
  }
  const tab = WORK_TABS.find((t) => t.segment === first);
  return tab ? { label: tab.label, path: `${work}/${tab.segment}` } : undefined;
}

/**
 * The crumb of one release request below the project at `project` (`/projects/<slug>`):
 * `<project>/release-requests/<id>` names the request by its logical id (`<repository>-rr-<n>`),
 * found in `requests` by uuid or logical id; a request without one by its uuid's first eight
 * characters. Undefined for the list itself and anything outside it.
 */
export function releaseRequestSubpage(
  url: string,
  project: string,
  requests: readonly ReleaseRequestEntry[] = [],
): NavPage | undefined {
  const prefix = `${project}/${RELEASE_REQUESTS}/`;
  if (!url.startsWith(prefix)) return undefined;
  const id = url.slice(prefix.length).split(/[?#]/)[0].split('/')[0];
  if (!id) return undefined;
  const requestId = decodeURIComponent(id);
  const request = findReleaseRequest(requests, requestId);
  return {
    label: releaseRequestName(requests, requestId),
    path: `${prefix}${id}`,
    marks: request?.qualifiedId
      ? {
          source: sourceMark(PROJECT_RELEASE_REQUESTS),
          item: itemMark('id', request.id),
          field: 'qualifiedId',
        }
      : undefined,
  };
}
