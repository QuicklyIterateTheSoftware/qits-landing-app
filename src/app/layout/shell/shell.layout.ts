import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  exit,
  external,
  itemMark,
  outcomes,
  QitsExit,
  QitsTriggers,
  sourceMark,
  type ExitOutcome,
  type ExternalOutcome,
} from '@qits/angular';
import { DEPLOYMENT_REQUEST } from '$core/deployments/deployments.operations';
import {
  OpenDeploymentRequest,
  type OpenDeploymentRequestName,
} from '$core/deployments/open-deployment-request';
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
import { PlatformOrigins } from '$core/platform/platform-origins';
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
import { ComponentSearch } from '$patterns/repositories/component-search/component-search';
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

/** The shell's sections: one per sidebar entry, Desk from its icon and Setup from the gear. */
type SectionKey =
  | 'work'
  | 'releases'
  | 'desk'
  | 'components'
  | 'deployments'
  | 'observability'
  | 'events'
  | 'maintenance'
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
  | 'releases'
  | 'releases/requests'
  | 'releases/agents'
  | 'releases/ci'
  | 'desk'
  | 'components'
  | 'deployments'
  | 'deployments/requests'
  | 'observability'
  | 'observability/logs'
  | 'observability/errors'
  | 'observability/metrics'
  | 'observability/traces'
  | 'events'
  | 'maintenance'
  | 'maintenance/dependencies'
  | 'maintenance/artifacts'
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
  /** A search field as the section's first entry while it is open (Components, qits-2491). */
  readonly search?: boolean;
}

/** One of a section's own pages, below it in the sidebar. */
export interface NavChild extends NavPage {
  readonly exit: ProjectPageExit;
  /**
   * Its crumb, for a section whose trail names the page (Releases › Requests, Work › Ideas), with
   * the exit it follows while a page below it is shown (none for Ideas, whose pages have no crumb
   * after it).
   */
  readonly crumb?: { readonly exit?: ExitOutcome };
  /**
   * Other URLs (absolute) whose pages it stays current on, though they are not below `path`:
   * Agents on a slot's page (`workspaces/<slot id>`).
   */
  readonly alsoOn?: readonly string[];
  /** A gap below it, setting it apart from the pages after it (Ideas above the work pages). */
  readonly apart?: boolean;
}

/**
 * A global section's page in this app: a route that takes no params (qits-2316), or one process of
 * the Orchestrator's, by its kind (qits-2480).
 */
export type GlobalPath =
  | 'projects'
  | 'system'
  | 'system/swarm/services'
  | 'system/swarm/nodes'
  | 'system/swarm/configs'
  | 'system/swarm/secrets'
  | 'system/targets'
  | 'mirror'
  | 'mirror/repositories'
  | 'mirror/upstreams'
  | 'orchestrator'
  | 'idp'
  | 'idp/clients'
  | 'idp/users'
  | 'idp/devices'
  | 'orchestrator/processes/:kind';

/** A global section's own page: a route that takes no params (the sidebar's entry). */
type GlobalSectionPath = Exclude<GlobalPath, 'orchestrator/processes/:kind'>;

/** One of a global section's own pages, below it in the sidebar while the section is open. */
export interface GlobalChild {
  readonly label: string;
  /** Its `exit(...)` outcome, rendered through `[qitsExit]` and current on its page. */
  readonly exit: ExitOutcome<GlobalPath>;
  /** The page's URL (absolute, `/system/…`), matched against the router's. */
  readonly path: string;
  /** Its exit's params, for a page that takes some (an Orchestrator process's `kind`). */
  readonly params?: Readonly<Record<string, string>>;
  /**
   * Other URLs (absolute) whose pages it stays current on, though they are not below `path`: Nodes
   * on a terminal's page, `/system/terminals` (qits-2356), opened from a node's Containers tab.
   */
  readonly alsoOn?: readonly string[];
  /**
   * Its crumb's `follow-breadcrumb` exit, a link on a page below it (qits-2533), for a page with
   * pages below it: System's Services, Nodes and Configs, Mirror's Caches.
   */
  readonly crumb?: ExitOutcome<GlobalPath>;
}

/**
 * One of the sidebar's global sections, shown while no project is open: a platform page that
 * belongs to no project. Either a section of this app, opened by its declared exit as a router
 * link (`kind: 'exit'`, qits-2316: Artifacts; qits-2344: System; qits-2357: Mirror; qits-2359:
 * Orchestrator; qits-2481: IdP admin), with its own pages listed below it while it is open
 * (`children`, qits-2346: System's Services, Nodes, Configs and Secrets; qits-2479: Mirror's Caches
 * and OCI upstreams; qits-2481: IdP admin's Clients, Users and Signed-in devices), or a site of its
 * own the app leaves for at `href`, through its declared external outcome (`kind: 'external'`;
 * none today).
 */
export type GlobalLink =
  | {
      readonly kind: 'exit';
      readonly label: string;
      /** Its `exit(...)` outcome, rendered through `[qitsExit]` and current on its pages. */
      readonly exit: ExitOutcome<GlobalSectionPath>;
      /** The section's crumb in the trail, its `follow-breadcrumb` exit (qits-2386). */
      readonly crumb: ExitOutcome<GlobalSectionPath>;
      /** The section's own pages, listed below it in the sidebar while the section is open. */
      readonly children?: readonly GlobalChild[];
    }
  | {
      readonly kind: 'external';
      readonly label: string;
      /** Where the entry leads; `''` while it is not known (the server render), and then hidden. */
      readonly href: string;
      /** Its `external(...)` outcome, which records and then leaves for `href`. */
      readonly open: ExternalOutcome;
    };

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
 * "…" and the current page beside the burger and all five menus. The desk icon (qits-2484) is the
 * sixth and shows from 768px only: on a phone it would clip the current page (qits-1977); there
 * the burger's navigation lists Desk instead. The theme menu (qits-2086) shows from 768px only for
 * the same reason; below 768px the same radios (`app-theme-choices`) sit at the foot of the
 * burger's navigation. Network access is in the sidebar with no project open only (qits-2262,
 * qits-2485): it leaves this app for qits-network-access' own frontend at
 * `https://network-access.<domain>/` (`PlatformOrigins.page('network-access')`, qits-2361), which
 * stays public while this app is on the private network.
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
 * sidebar's sections (`open-sidebar-section`), the work pages below Work
 * (`open-sidebar-work-page`, Ideas and one exit per `WORK_TABS` entry), the Releases pages
 * (`open-sidebar-releases-page`), the global sections shown with no project open
 * (System, `open-sidebar-system`, Mirror,
 * `open-sidebar-mirror`, and Orchestrator, `open-sidebar-orchestrator`, in-app sections, with
 * System's own pages below it while it is open, `open-sidebar-system-page`, and Mirror's,
 * `open-sidebar-mirror-page`; IdP admin, `open-sidebar-idp`, with its pages below it,
 * `open-sidebar-idp-page`, qits-2481) and Network access below them (`open-sidebar-network-access`,
 * external), the desk icon (`open-project-desk`) and its phone entry (`open-sidebar-desk`), the
 * gear (`open-project-settings`), and the trail's brand and crumbs (`follow-breadcrumb`),
 * handed to `ui-breadcrumbs` as each crumb's exit and params. The agents and release menus declare
 * their own, being patterns (app-wide too). Network access is a plain link marked with its
 * outcome (`[qitsTriggers]`); a plain primary click records it and leaves
 * (`leave`), any other click is the browser's. The gear, the sidebar's Artifacts and
 * Orchestrator, a work page and a global section's page are marked current by `[qitsExit]`; a section keeps its own rule
 * (`currentOf`: `true` while one of its pages below it is open, and Releases › Agents on a slot's page), and so
 * does a global section with pages of its own (`globalCurrentOf`, the same rule: System is `true`
 * on Services, Nodes, Configs or Secrets, qits-2346, and Mirror on Caches or OCI upstreams,
 * qits-2479), given to `[qitsExit]` through `[exitCurrent]` (qits-2064).
 *
 * What the shell shows of the platform comes from root services, each one `qitsResource` the shell
 * and the project pages share (qits-2146), never a store: the open project (`SelectedProject`),
 * its release requests (`ProjectReleaseRequests`: the sidebar's Releases line, a request's
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
    QitsTriggers,
    RouterOutlet,
    BumpsMenu,
    ComponentSearch,
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
        <!-- The menus at the right end: version bumps and notifications (always), then the open
             project's agents and its release requests, the theme (from 768px, qits-2086), and the
             open project's desk (from 768px, qits-2484) and settings (release requests hidden while
             no project is open; agents, desk and settings not rendered then, qits-2225: a trigger
             nobody can reach would count against every project-less route). Network access is no
             project's concern: only the sidebar without a project links it (qits-2485). -->
        <div class="ml-auto flex items-center gap-1">
          <app-bumps-menu />
          <app-notifications-menu />
          <app-agents-menu [agents]="activeAgents.resource" [state]="agentsState()" />
          <app-release-menu
            [requests]="releaseRequests.resource"
            [state]="releaseRequests.state()"
          />
          <app-theme-menu class="max-md:hidden" />
          @if (slug()) {
            <a
              class="hidden size-9 items-center justify-center rounded-md text-fg-muted no-underline hover:bg-surface-muted hover:text-fg aria-[current=page]:bg-surface-active aria-[current=page]:text-fg md:inline-flex"
              [qitsExit]="desk.open"
              [exitParams]="{ slug: slug() }"
              aria-label="Desk"
              title="Desk"
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
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path
                  d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                />
              </svg>
            </a>
            <a
              class="inline-flex size-9 items-center justify-center rounded-md text-fg-muted no-underline hover:bg-surface-muted hover:text-fg aria-[current=page]:text-fg"
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
          }
        </div>
      </header>

      <nav
        id="layout-nav"
        class="z-1 col-start-1 row-start-2 border-r border-line bg-surface-subtle max-md:z-48 md:block md:min-h-0 md:overflow-y-auto"
        [class.hidden]="!navOpen()"
        aria-label="qits"
      >
        <!-- With no project open, the global sections in its place (Artifacts, System, Mirror,
             Orchestrator, IdP admin). A section of this app is a router link through its exit,
             current on its pages; one that leaves the app (none today) is a real link that records its outcome first. The list
             and a leaving entry with no address yet (the server render) are switched by class; such
             an entry names no outcome, being a trigger nobody can reach. -->
        <ul class="m-0 list-none px-2 py-3" [class.hidden]="!globalShown()">
          @for (link of globalLinks(); track link.label) {
            @if (link.kind === 'exit') {
              <li>
                <a
                  class="block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg aria-[current=true]:font-semibold aria-[current=true]:text-fg"
                  [qitsExit]="link.exit"
                  [exitCurrent]="globalCurrentOf(link)"
                  (click)="closeNav()"
                  >{{ link.label }}</a
                >
                <!-- The open global section's pages, indented below it, as a project section's
                     (qits-2346): the list switched by class, its links rendered only while the
                     section is open (\`openGlobalChildren\`, qits-2225). -->
                <ul
                  class="m-0 mt-0.5 mb-1 ml-3 list-none border-l border-line pl-2"
                  [class.hidden]="openGlobalChildren(link).length === 0"
                >
                  @for (child of openGlobalChildren(link); track child.path) {
                    <li>
                      <a
                        class="block rounded-md px-3 py-[0.3rem] text-sm text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                        [qitsExit]="child.exit"
                        [exitParams]="child.params"
                        [exitCurrent]="globalChildCurrent(child)"
                        (click)="closeNav()"
                        >{{ child.label }}</a
                      >
                    </li>
                  }
                </ul>
              </li>
            } @else {
              <li [class.hidden]="!link.href">
                <a
                  class="block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted"
                  [attr.href]="link.href || null"
                  [qitsTriggers]="link.href ? [link.open] : []"
                  (click)="leave($event, link.href, link.open)"
                  >{{ link.label }}</a
                >
              </li>
            }
          }
        </ul>
        <!-- With a repository open (qits-2492), its own pages in the project's sections' place,
             below a way back to the project's Components; rendered only then (qits-2225). -->
        @if (repository(); as repo) {
          <ul class="m-0 list-none px-2 py-3" aria-label="Repository">
            <li>
              <a
                class="block rounded-md px-3 py-[0.4rem] text-sm text-fg-muted no-underline hover:bg-surface-muted"
                [qitsExit]="repositoryBack.components"
                [exitParams]="{ slug: slug() }"
                [exitCurrent]="null"
                (click)="closeNav()"
                >← Components</a
              >
            </li>
            <li
              class="truncate px-3 pt-2 pb-1 font-mono text-xs font-semibold text-fg"
              [title]="repo"
            >
              {{ repo }}
            </li>
            @for (entry of repositoryLinks(); track entry.label) {
              <li>
                <a
                  class="block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                  [qitsExit]="entry.exit"
                  [exitParams]="{ slug: slug(), repo: repo }"
                  [exitCurrent]="entry.current"
                  (click)="closeNav()"
                  >{{ entry.label }}</a
                >
              </li>
            }
          </ul>
        }
        <!-- The open project's sections; switched by class while there are none. -->
        <ul class="m-0 list-none px-2 py-3" [class.hidden]="shownLinks().length === 0">
          @for (link of shownLinks(); track link.key) {
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
              <!-- The open section's pages, indented below it; the list switched by class, so the
                   server render hydrates as is, its links rendered only while the section is open
                   (\`openChildren\`, qits-2225). -->
              <ul
                class="m-0 mt-0.5 mb-1 ml-3 list-none border-l border-line pl-2"
                [class.hidden]="
                  (!link.children?.length && !link.search) || link.path !== section()?.path
                "
              >
                <!-- The section's search, its first entry while it is open (qits-2491). -->
                @if (link.search && link.path === section()?.path) {
                  <li class="py-1">
                    <app-component-search />
                  </li>
                }
                @for (child of openChildren(link); track child.path) {
                  <li [class.mb-3]="child.apart">
                    <a
                      class="block rounded-md px-3 py-[0.3rem] text-sm text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                      [qitsExit]="child.exit"
                      [exitParams]="{ slug: slug() }"
                      [exitCurrent]="childCurrent(child)"
                      (click)="closeNav()"
                      >{{ child.label }}</a
                    >
                  </li>
                }
              </ul>
            </li>
          }
          <!-- Below 768px the top bar has no room for the desk icon: its entry sits here instead
               (qits-2484), while the project's sections show (not a repository's, qits-2492). -->
          @if (slug() && shownLinks().length > 0) {
            <li class="md:hidden">
              <a
                class="block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-surface-active aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                [qitsExit]="phoneDesk.open"
                [exitParams]="{ slug: slug() }"
                (click)="closeNav()"
                >Desk</a
              >
            </li>
          }
        </ul>
        <!-- The platform's own pages, with no project open only: Network access (qits-2262),
             qits-network-access' own frontend (qits-2361), which is no project's concern
             (qits-2485). -->
        @if (!slug()) {
          <ul
            class="m-0 list-none px-2 py-3"
            [class.border-t]="globalShown()"
            [class.border-line]="globalShown()"
          >
            <li>
              <a
                class="block rounded-md px-3 py-[0.4rem] text-fg-soft no-underline hover:bg-surface-muted"
                [attr.href]="networkAccessHref || null"
                [qitsTriggers]="[platformPages.networkAccess]"
                (click)="closeNav(); leave($event, networkAccessHref, platformPages.networkAccess)"
                >Network access</a
              >
            </li>
          </ul>
        }
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
  private readonly openDeploymentRequest = inject(OpenDeploymentRequest);

  /**
   * qits-network-access' own frontend, at the root of its host (qits-2361); `''` while its origin
   * is not known (the server render), so the link has no `href` until the browser takes over.
   */
  private readonly networkAccessOrigin = inject(PlatformOrigins).page('network-access');
  protected readonly networkAccessHref = this.networkAccessOrigin
    ? `${this.networkAccessOrigin}/`
    : '';

  /** The agents menu's spinner: the agents' read, as the menu's own read was. */
  protected readonly agentsState = computed(() => loadState(this.activeAgents.resource));

  /** The sidebar's sections, one exit each (epic qits-2000). */
  private readonly sections = outcomes('open-sidebar-section', {
    work: exit('projects/:slug/work'),
    releases: exit('projects/:slug/releases'),
    components: exit('projects/:slug/components'),
    deployments: exit('projects/:slug/deployments'),
    observability: exit('projects/:slug/observability'),
    events: exit('projects/:slug/events'),
    maintenance: exit('projects/:slug/maintenance'),
  });

  /**
   * The work pages below Work in the sidebar, one exit per page (epic qits-2000): Ideas first
   * (qits-2483, not a work entity, so not one of the Work page's tabs), then one per `WORK_TABS`
   * entry.
   */
  private readonly workPages = outcomes('open-sidebar-work-page', {
    ideas: exit('projects/:slug/ideas'),
    refinement: exit('projects/:slug/work/refinement'),
    schedule: exit('projects/:slug/work/schedule'),
    inProgress: exit('projects/:slug/work/in-progress'),
    acceptance: exit('projects/:slug/work/acceptance'),
    archive: exit('projects/:slug/work/archive'),
  });

  /**
   * The Releases pages below Releases in the sidebar, one exit per page (qits-2482): agents file
   * release requests, CI carries them.
   */
  private readonly releasesPages = outcomes('open-sidebar-releases-page', {
    requests: exit('projects/:slug/releases/requests'),
    agents: exit('projects/:slug/releases/agents'),
    ci: exit('projects/:slug/releases/ci'),
  });

  /** The Deployments pages below Deployments in the sidebar, one exit per page (qits-2315). */
  private readonly deploymentsPages = outcomes('open-sidebar-deployments-page', {
    requests: exit('projects/:slug/deployments/requests'),
  });

  /**
   * The Observability pages below Observability in the sidebar, one exit per page (qits-2313;
   * Errors, qits-2339; Metrics, qits-2340; Traces, qits-2342). Slow spans is no page of its own any
   * more but the Traces page's duration floor (qits-2536).
   */
  private readonly observabilityPages = outcomes('open-sidebar-observability-page', {
    logs: exit('projects/:slug/observability/logs'),
    errors: exit('projects/:slug/observability/errors'),
    metrics: exit('projects/:slug/observability/metrics'),
    traces: exit('projects/:slug/observability/traces'),
  });

  /**
   * The Maintenance pages below Maintenance in the sidebar, one exit per page (qits-2317;
   * Artifacts, qits-2330).
   */
  private readonly maintenancePages = outcomes('open-sidebar-maintenance-page', {
    dependencies: exit('projects/:slug/maintenance/dependencies'),
    artifacts: exit('projects/:slug/maintenance/artifacts'),
  });

  /**
   * The repository sidebar's entries (qits-2492), one exit per page of the open repository:
   * Overview, Artifacts, Docs, Contracts, Entities, UI builder and Release requests (qits-2506).
   */
  private readonly repositoryPages = outcomes('open-sidebar-repository-page', {
    overview: exit('projects/:slug/components/:repo'),
    artifacts: exit('projects/:slug/components/:repo/artifacts'),
    docs: exit('projects/:slug/components/:repo/docs'),
    contracts: exit('projects/:slug/components/:repo/contracts'),
    entities: exit('projects/:slug/components/:repo/entities'),
    uiBuilder: exit('projects/:slug/components/:repo/ui-builder'),
    releaseRequests: exit('projects/:slug/components/:repo/release-requests'),
  });

  /** The repository sidebar's way back to the project's sidebar (qits-2492). */
  protected readonly repositoryBack = outcomes('leave-sidebar-repository', {
    components: exit('projects/:slug/components'),
  });

  /** Each work page's exit, by its segment (`WORK_TABS`). */
  private readonly workPageExits: Readonly<Record<string, ProjectPageExit>> = {
    refinement: this.workPages.refinement,
    schedule: this.workPages.schedule,
    'in-progress': this.workPages.inProgress,
    acceptance: this.workPages.acceptance,
    archive: this.workPages.archive,
  };

  /**
   * The desk icon, beside the gear: the open project's delivery desk (qits-2484), shown from 768px
   * while a project is open.
   */
  protected readonly desk = outcomes('open-project-desk', {
    open: exit('projects/:slug/desk'),
  });

  /**
   * The desk below 768px, where the top bar has no room for its icon: an entry at the foot of the
   * project's sections in the burger's navigation (qits-2484).
   */
  protected readonly phoneDesk = outcomes('open-sidebar-desk', {
    open: exit('projects/:slug/desk'),
  });

  /** The gear: the open project's settings (epic qits-2000). */
  protected readonly settings = outcomes('open-project-settings', {
    open: exit('projects/:slug/setup'),
  });

  /**
   * The sidebar's platform pages, below the global sections, with no project open only: Network
   * access (qits-2262), qits-network-access' own frontend (qits-2361); no project's concern
   * (qits-2485).
   */
  protected readonly platformPages = outcomes('open-sidebar-network-access', {
    networkAccess: external('network-access'),
  });

  /**
   * The sidebar's Projects (qits-2532): the first global entry, the project picker, current on it.
   */
  protected readonly projects = outcomes('open-sidebar-projects', {
    open: exit('projects'),
  });

  /**
   * The sidebar's System (qits-2344): the System section, qits-system's one swarm, which belongs
   * to no project. `system` opens the swarm's services (a redirect), and the entry stays current
   * on every page below it.
   */
  protected readonly system = outcomes('open-sidebar-system', {
    open: exit('system'),
  });

  /**
   * The sidebar's Mirror (qits-2357): the Mirror section, qits-mirror's pull-through caches, which
   * belong to no project. `mirror` opens the Caches page (a redirect, qits-2479), and the entry
   * stays current on every page below it.
   */
  protected readonly mirror = outcomes('open-sidebar-mirror', {
    open: exit('mirror'),
  });

  /**
   * The sidebar's Orchestrator (qits-2359): the Orchestrator section, qits-orchestrator's
   * technical processes, which belong to no project. `orchestrator` opens the gc process (a
   * redirect), and the entry stays current on every page below it.
   */
  protected readonly orchestrator = outcomes('open-sidebar-orchestrator', {
    open: exit('orchestrator'),
  });

  /**
   * The System section's pages below the sidebar's System, one exit per page (qits-2346), listed
   * while the section is open: the swarm's Services, Nodes and Configs (qits-2348), then Targets
   * (qits-2351). qits-2347…qits-2356 each add one more.
   */
  private readonly systemPages = outcomes('open-sidebar-system-page', {
    services: exit('system/swarm/services'),
    nodes: exit('system/swarm/nodes'),
    configs: exit('system/swarm/configs'),
    secrets: exit('system/swarm/secrets'),
    targets: exit('system/targets'),
  });

  /**
   * The Orchestrator section's pages below the sidebar's Orchestrator, one exit per process
   * (qits-2480), listed while the section is open: Garbage collection (`gc`), the only process
   * qits-orchestrator runs today. A static list: the shell reads no processes.
   */
  private readonly orchestratorPages = outcomes('open-sidebar-orchestrator-page', {
    gc: exit('orchestrator/processes/:kind'),
  });

  /**
   * The Mirror section's pages below the sidebar's Mirror, one exit per page (qits-2479), listed
   * while the section is open: Caches (every cache root, qits-2471) and OCI upstreams (qits-2357).
   */
  private readonly mirrorPages = outcomes('open-sidebar-mirror-page', {
    caches: exit('mirror/repositories'),
    upstreams: exit('mirror/upstreams'),
  });

  /**
   * The sidebar's IdP admin (qits-2481): the IdP admin section, the idp's own admin pages shown in
   * a frame in this app's main slot. `idp` opens the clients (a redirect), and the entry stays
   * current on every page below it.
   */
  protected readonly idp = outcomes('open-sidebar-idp', {
    open: exit('idp'),
  });

  /** The IdP admin section's pages below the sidebar's IdP admin, one exit per page (qits-2481). */
  private readonly idpPages = outcomes('open-sidebar-idp-page', {
    clients: exit('idp/clients'),
    users: exit('idp/users'),
    devices: exit('idp/devices'),
  });

  /**
   * The sidebar's global sections: where the sections that belong to no project go, shown in the
   * project's sections' place while no project is open, and not at all while one is: System (qits-2344; the root Artifacts of
   * qits-2316 is gone, qits-2477), Mirror (qits-2357), Orchestrator (qits-2359) and IdP admin
   * (qits-2481), in-app sections. An in-app section may list its own pages
   * below it (`children`, qits-2346): System's Services, Nodes, Configs (qits-2348), Secrets
   * (qits-2350) and Targets (qits-2351), one exit each of `open-sidebar-system-page`, and IdP
   * admin's Clients, Users and Signed-in devices, one exit each of `open-sidebar-idp-page`;
   * qits-2347…qits-2356 each add one child there. Mirror lists Caches and OCI upstreams
   * (qits-2479), one exit each of `open-sidebar-mirror-page`; Orchestrator lists its processes
   * (qits-2480): Garbage collection, which `orchestrator` opens, one exit each of
   * `open-sidebar-orchestrator-page`.
   */
  protected readonly globalLinks = computed((): readonly GlobalLink[] => {
    if (this.selected.slug() !== undefined) return [];
    const system = this.systemPages;
    const mirror = this.mirrorPages;
    const idp = this.idpPages;
    const trail = this.trail;
    return [
      { kind: 'exit', label: 'Projects', exit: this.projects.open, crumb: trail.projects },
      {
        kind: 'exit',
        label: 'System',
        exit: this.system.open,
        crumb: trail.system,
        children: [
          {
            label: 'Services',
            exit: system.services,
            path: system.services.url(),
            crumb: trail.systemServices,
          },
          {
            label: 'Nodes',
            exit: system.nodes,
            path: system.nodes.url(),
            alsoOn: ['/system/terminals'],
            crumb: trail.systemNodes,
          },
          {
            label: 'Configs',
            exit: system.configs,
            path: system.configs.url(),
            crumb: trail.systemConfigs,
          },
          { label: 'Secrets', exit: system.secrets, path: system.secrets.url() },
          { label: 'Targets', exit: system.targets, path: system.targets.url() },
        ],
      },
      {
        kind: 'exit',
        label: 'Mirror',
        exit: this.mirror.open,
        crumb: trail.mirror,
        children: [
          {
            label: 'Caches',
            exit: mirror.caches,
            path: mirror.caches.url(),
            crumb: trail.mirrorCaches,
          },
          { label: 'OCI upstreams', exit: mirror.upstreams, path: mirror.upstreams.url() },
        ],
      },
      {
        kind: 'exit',
        label: 'Orchestrator',
        exit: this.orchestrator.open,
        crumb: trail.orchestrator,
        children: [
          {
            label: 'Garbage collection',
            exit: this.orchestratorPages.gc,
            params: { kind: 'gc' },
            path: this.orchestratorPages.gc.url({ kind: 'gc' }),
          },
        ],
      },
      {
        kind: 'exit',
        label: 'IdP admin',
        exit: this.idp.open,
        crumb: trail.idp,
        children: [
          { label: 'Clients', exit: idp.clients, path: idp.clients.url() },
          { label: 'Users', exit: idp.users, path: idp.users.url() },
          { label: 'Signed-in devices', exit: idp.devices, path: idp.devices.url() },
        ],
      },
    ];
  });

  /** Whether any global section can be shown (an in-app one, or one with an address). */
  protected readonly globalShown = computed(() =>
    this.globalLinks().some((link) => link.kind === 'exit' || link.href),
  );

  /**
   * The trail's brand and its crumbs before the current page (epic qits-2000): home, the picker,
   * the project, and the sections and pages a subpage crumb can follow (Work; Releases and its
   * Requests, Agents and CI, qits-2482); with no project open, the global section the URL is in
   * (System, Mirror, Orchestrator, IdP admin, qits-2386), to its root, and the section's page
   * above a page below it (qits-2533).
   */
  private readonly trail = outcomes('follow-breadcrumb', {
    home: exit(''),
    projects: exit('projects'),
    project: exit('projects/:slug'),
    work: exit('projects/:slug/work'),
    releases: exit('projects/:slug/releases'),
    releasesRequests: exit('projects/:slug/releases/requests'),
    releasesAgents: exit('projects/:slug/releases/agents'),
    releasesCi: exit('projects/:slug/releases/ci'),
    components: exit('projects/:slug/components'),
    repository: exit('projects/:slug/components/:repo'),
    repositoryContracts: exit('projects/:slug/components/:repo/contracts'),
    repositoryEntities: exit('projects/:slug/components/:repo/entities'),
    repositoryReleaseRequests: exit('projects/:slug/components/:repo/release-requests'),
    repositoryDocs: exit('projects/:slug/components/:repo/docs'),
    system: exit('system'),
    mirror: exit('mirror'),
    orchestrator: exit('orchestrator'),
    idp: exit('idp'),
    systemServices: exit('system/swarm/services'),
    systemNodes: exit('system/swarm/nodes'),
    systemConfigs: exit('system/swarm/configs'),
    mirrorCaches: exit('mirror/repositories'),
  });

  /** A section's crumb's exit, for the sections with a subpage below them. */
  private readonly sectionCrumbExits: Partial<Record<SectionKey, ExitOutcome>> = {
    work: this.trail.work,
    releases: this.trail.releases,
    components: this.trail.components,
  };

  /** A repository page's crumb's exit, for the pages with a page below them (qits-2478). */
  private readonly repositoryPageCrumbExits: Readonly<Record<string, ExitOutcome | undefined>> = {
    contracts: this.trail.repositoryContracts,
    entities: this.trail.repositoryEntities,
    'release-requests': this.trail.repositoryReleaseRequests,
    docs: this.trail.repositoryDocs,
  };

  /** The trail's brand, home. */
  protected readonly home: Crumb = { label: 'qits', exit: this.trail.home };

  /** The open project's slug, the exits' param; empty while no project is open. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /**
   * The open project's newest release request (`latestReleaseRequest`), as the line below the
   * sidebar's Releases entry: its repository and version, and its state. The requests are
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
   * The sidebar lists the open project's sections; with no project open there are none, and only
   * the platform's pages below them show. Where you are is the breadcrumb's job, so the sidebar
   * does not repeat the project's name.
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
        children: [
          // Ideas are not work items: first, and set apart from the work pages (qits-2483).
          {
            label: 'Ideas',
            exit: this.workPages.ideas,
            path: this.workPages.ideas.url(params),
            crumb: {},
            apart: true,
          },
          ...WORK_TABS.flatMap((tab) => {
            const to = this.workPageExits[tab.segment];
            return to ? [{ label: tab.label, exit: to, path: to.url(params) }] : [];
          }),
        ],
      },
      {
        ...link('releases', 'Releases', sections.releases),
        note: this.latestRelease(),
        children: [
          {
            label: 'Requests',
            exit: this.releasesPages.requests,
            path: this.releasesPages.requests.url(params),
            crumb: { exit: this.trail.releasesRequests },
          },
          {
            label: 'Agents',
            exit: this.releasesPages.agents,
            path: this.releasesPages.agents.url(params),
            crumb: { exit: this.trail.releasesAgents },
            alsoOn: [`/projects/${slug}/${WORKSPACES}`],
          },
          {
            label: 'CI',
            exit: this.releasesPages.ci,
            path: this.releasesPages.ci.url(params),
            crumb: { exit: this.trail.releasesCi },
          },
        ],
      },
      { ...link('components', 'Components', sections.components), search: true },
      {
        ...link('deployments', 'Deployments', sections.deployments),
        children: [
          {
            label: 'Requests',
            exit: this.deploymentsPages.requests,
            path: this.deploymentsPages.requests.url(params),
          },
        ],
      },
      {
        ...link('observability', 'Observability', sections.observability),
        children: [
          {
            label: 'Logs',
            exit: this.observabilityPages.logs,
            path: this.observabilityPages.logs.url(params),
          },
          {
            label: 'Errors',
            exit: this.observabilityPages.errors,
            path: this.observabilityPages.errors.url(params),
          },
          {
            label: 'Metrics',
            exit: this.observabilityPages.metrics,
            path: this.observabilityPages.metrics.url(params),
          },
          {
            label: 'Traces',
            exit: this.observabilityPages.traces,
            path: this.observabilityPages.traces.url(params),
          },
        ],
      },
      link('events', 'Events', sections.events),
      {
        ...link('maintenance', 'Maintenance', sections.maintenance),
        children: [
          {
            label: 'Dependencies',
            exit: this.maintenancePages.dependencies,
            path: this.maintenancePages.dependencies.url(params),
          },
          {
            label: 'Artifacts',
            exit: this.maintenancePages.artifacts,
            path: this.maintenancePages.artifacts.url(params),
          },
        ],
      },
    ];
  });

  /** The open repository's name while the URL is one of its pages (qits-2492), else undefined. */
  protected readonly repository = computed((): string | undefined => {
    const slug = this.selected.slug();
    if (slug === undefined) return undefined;
    return repositoryTrail(this.selected.url(), `/projects/${slug}`)?.repo;
  });

  /**
   * The repository sidebar's entries (qits-2492): each page with its exit and its `aria-current`
   * (Overview `page` on the repository's own page only, the others by `[qitsExit]`'s path rule, so
   * Contracts stays current on a state's page). Every entry shows for every repository: each page
   * says itself when the repository has nothing for it. Dependencies waits for qits-2489.
   */
  protected readonly repositoryLinks = computed(() => {
    const slug = this.selected.slug();
    const repo = this.repository();
    if (slug === undefined || repo === undefined) return [];
    const pages = this.repositoryPages;
    const overview = pages.overview.url({ slug, repo });
    const atOverview = this.selected.url().split(/[?#]/)[0] === overview;
    return [
      { label: 'Overview', exit: pages.overview, current: atOverview ? ('page' as const) : null },
      { label: 'Artifacts', exit: pages.artifacts, current: undefined },
      { label: 'Docs', exit: pages.docs, current: undefined },
      { label: 'Contracts', exit: pages.contracts, current: undefined },
      { label: 'Entities', exit: pages.entities, current: undefined },
      { label: 'UI builder', exit: pages.uiBuilder, current: undefined },
      { label: 'Release requests', exit: pages.releaseRequests, current: undefined },
    ];
  });

  /** The project's sections as the sidebar renders them: none while a repository is open. */
  protected readonly shownLinks = computed(() => (this.repository() ? [] : this.links()));

  /**
   * The trail after the "qits" brand: "Projects", then the open project's name, then the section
   * the URL is in ("Work", or "Setup" from the gear), the section's page when it names one (Work ›
   * Ideas, qits-2483; Releases › Requests, Agents or CI, qits-2482), then a subpage of it (Work › Archive, Work › <item id>, Releases › Requests ›
   * <request id>, Releases › CI › <run>, Releases › Agents › <agent's item id>, Releases › Agents ›
   * ws-<slot id>, Deployments › <version> · <application>). With no project open, a global
   * section's page has that section's trail instead (`globalCrumbs`, qits-2386: System ›
   * Nodes, IdP admin › Users; System › Services › <id> below a page, qits-2533), and any other page "Projects". The last crumb
   * is the current page and is not a link; each one before it leads through its
   * `follow-breadcrumb` exit.
   */
  protected readonly crumbs = computed((): readonly Crumb[] => {
    const projects: Crumb = { label: 'Projects', exit: this.trail.projects };
    const project = this.selected.project();
    const slug = this.selected.slug();
    if (!project || !slug) return this.globalCrumbs() ?? [projects];
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
    const url = this.selected.url();
    // A repository and its pages (qits-2478): Components › <repo> › Contracts › <state>, each
    // crumb before the last leading to its page.
    const repository = repositoryTrail(url, `/projects/${slug}`);
    if (found.key === 'components' && repository) {
      const repoParams = { slug, repo: repository.repo };
      const steps: Crumb[] = [
        { label: repository.repo, exit: this.trail.repository, params: repoParams },
      ];
      if (repository.page) {
        steps.push({
          label: repository.page.label,
          exit: this.repositoryPageCrumbExits[repository.page.segment],
          params: repoParams,
        });
      }
      if (repository.leaf) steps.push({ label: repository.leaf });
      const last = steps[steps.length - 1];
      steps[steps.length - 1] = { label: last.label };
      return [...crumbs, section, ...steps];
    }
    // The section's page the trail names (Releases › Requests), when it has a crumb of its own.
    const child = found.children?.find((page) => page.crumb && this.isOn(page));
    const page: Crumb[] = child ? [{ label: child.label, exit: child.crumb?.exit, params }] : [];
    // A section's own subpages, one level deep: Work › In Progress, Work › <item id>,
    // Releases › Requests › <request id>, Releases › CI › <run>.
    const base = `/projects/${slug}`;
    const requests = this.releaseRequests.requests();
    const agents = this.activeAgents.agents();
    const sub =
      workSubpage(url, base) ??
      releaseRequestSubpage(url, base, requests) ??
      ciSubpage(url, base) ??
      deploymentRequestSubpage(url, base, this.openDeploymentRequest.shown()) ??
      slotSubpage(url, base) ??
      agentSubpage(url, base, agents);
    return sub
      ? [...crumbs, section, ...page, { label: sub.label, marks: sub.marks }]
      : [...crumbs, section, ...page];
  });

  /**
   * The trail of a global section's page, with no project open (qits-2386): the section (its
   * root, `follow-breadcrumb`), then the section's own page the URL is on, as the sidebar marks it
   * (System › Nodes, also on a terminal's page; Mirror › Caches; Orchestrator › Garbage
   * collection; IdP admin › Users). On a page below that one (qits-2533) the page is a link, and
   * the current page is named by its id (`globalLeaf`: System › Services › <id>, System › Nodes ›
   * <terminal id>, Mirror › Caches › <repository>). Undefined outside every global section.
   */
  private readonly globalCrumbs = computed((): readonly Crumb[] | undefined => {
    const link = this.globalLinks().find(
      (global): global is GlobalLink & { kind: 'exit' } =>
        global.kind === 'exit' && this.isInGlobal(global),
    );
    if (!link) return undefined;
    const section: Crumb = { label: link.label, exit: link.crumb };
    const child = link.children?.find((page) => this.isAt(page) || this.isAlsoAt(page));
    if (!child) return [section];
    const page: Crumb = { label: child.label, exit: child.crumb, params: child.params };
    const url = this.selected.url();
    const leaf = [child.path, ...(child.alsoOn ?? [])]
      .map((path) => globalLeaf(url, path))
      .find((id) => id !== undefined);
    return leaf ? [section, page, { label: leaf }] : [section, page];
  });

  /**
   * The section the URL is in (its page or one below it): a sidebar link, Desk from its icon
   * (qits-2484), or Setup from the gear.
   * A slot's page (`workspaces/<slot id>`) is in Releases (its Agents), an idea's (`ideas/…`) in
   * Work (qits-2483).
   */
  protected readonly section = computed((): NavLink | undefined => {
    const slug = this.selected.slug();
    if (slug === undefined) return undefined;
    const url = this.selected.url();
    if (within(url, `/projects/${slug}/${WORKSPACES}`)) {
      return this.links().find((link) => link.key === 'releases');
    }
    if (within(url, `/projects/${slug}/${IDEAS}`)) {
      return this.links().find((link) => link.key === 'work');
    }
    const setup: NavLink = {
      key: 'setup',
      label: 'Setup',
      exit: this.settings.open,
      path: this.settings.open.url({ slug }),
    };
    const desk: NavLink = {
      key: 'desk',
      label: 'Desk',
      exit: this.desk.open,
      path: this.desk.open.url({ slug }),
    };
    return [...this.links(), desk, setup].find((link) => within(url, link.path));
  });

  /** Whether the URL is `page` or one below it. */
  private isAt(page: NavPage): boolean {
    return within(this.selected.url(), page.path);
  }

  /** Whether the URL is a section's page `child`, one below it, or one it stays current on. */
  private isOn(child: NavChild): boolean {
    return (
      this.isAt(child) || (child.alsoOn ?? []).some((path) => within(this.selected.url(), path))
    );
  }

  /** A section's page's `aria-current`: `page` on a page it stays current on outside its path. */
  protected childCurrent(child: NavChild): 'page' | undefined {
    return !this.isAt(child) && this.isOn(child) ? 'page' : undefined;
  }

  /**
   * A section's `aria-current`: `page` when it is the current page, `true` when the current page
   * is one of its own pages in the sidebar below it (or another page of the section).
   */
  protected currentOf(link: NavLink): 'page' | 'true' | null {
    if (link.path !== this.section()?.path) return null;
    return link.children?.some((child) => this.isOn(child)) ? 'true' : 'page';
  }

  /** Whether the URL is within a global section: its page or one below it (qits-2346). */
  private isInGlobal(link: GlobalLink & { kind: 'exit' }): boolean {
    return within(this.selected.url(), link.exit.url());
  }

  /**
   * A global section's `aria-current`, as `currentOf` is a project section's (qits-2346): for one
   * with pages of its own, `page` on its page, `true` when the current page is one of its pages
   * below it, none outside it; for one without, unbound (`undefined`), so `[qitsExit]`'s path rule
   * marks it `page` on every page below it.
   */
  protected globalCurrentOf(
    link: GlobalLink & { kind: 'exit' },
  ): 'page' | 'true' | null | undefined {
    if (!link.children?.length) return undefined;
    if (!this.isInGlobal(link)) return null;
    return link.children.some((child) => this.isAt(child) || this.isAlsoAt(child))
      ? 'true'
      : 'page';
  }

  /**
   * A global section's page's `aria-current`: `page` on a page it stays current on outside its
   * own path (`alsoOn`, qits-2356), else unbound, so `[qitsExit]`'s path rule decides.
   */
  protected globalChildCurrent(child: GlobalChild): 'page' | undefined {
    return this.isAlsoAt(child) ? 'page' : undefined;
  }

  /** Whether the URL is one of the pages `child` stays current on outside its own path. */
  private isAlsoAt(child: GlobalChild): boolean {
    return (child.alsoOn ?? []).some((path) => within(this.selected.url(), path));
  }

  /**
   * A global section's own pages as the sidebar renders them (qits-2346): all of them while the
   * URL is within the section, none otherwise. Not rendered rather than hidden, as `openChildren`
   * (qits-2225).
   */
  protected openGlobalChildren(link: GlobalLink & { kind: 'exit' }): readonly GlobalChild[] {
    return this.isInGlobal(link) ? (link.children ?? []) : [];
  }

  /**
   * A section's own pages as the sidebar renders them: all of them while the section is open,
   * none otherwise. Not rendered rather than hidden (ticket qits-2225): a closed section's links
   * are triggers no person can reach (the sidebar has no control that opens a section without
   * leaving for it), and the outcome check counts a trigger a route renders and never shows
   * against that route.
   */
  protected openChildren(link: NavLink): readonly NavChild[] {
    return link.path === this.section()?.path ? (link.children ?? []) : [];
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

  /**
   * A leaving link's click (a global section, or Network access, qits-2361): a plain primary click
   * records `open` and leaves for `href`, in this tab (`open.leave`); a click with a modifier,
   * another button or no `href` yet is the browser's, as `QitsExit` leaves it, and records nothing.
   */
  protected leave(event: MouseEvent, href: string, open: ExternalOutcome): void {
    if (
      !href ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    open.leave(href);
    this.closeNav();
  }
}

/**
 * The release requests' segments below a project: `/projects/<slug>/releases/requests`, a page of
 * the Releases section (qits-2482; the old `release-requests` redirects).
 */
export const RELEASE_REQUESTS = 'releases/requests';

/** The CI pages' segments below a project: `/projects/<slug>/releases/ci` (qits-2482). */
export const CI = 'releases/ci';

/** The desk section's segment below a project: `/projects/<slug>/desk`. */
export const DESK = 'desk';

/**
 * The ideas' segment below a project: `/projects/<slug>/ideas` (epic qits-888), Work's first page
 * in the sidebar (qits-2483).
 */
export const IDEAS = 'ideas';

/** True when `url` is `path` or a page below it, query and fragment ignored. */
function within(url: string, path: string): boolean {
  return url === path || /^[/?#]/.test(url.startsWith(path) ? url.slice(path.length) : 'x');
}

/**
 * The id of the page right below the global section page at `path` (qits-2533), decoded:
 * `/system/swarm/services/abc` below `/system/swarm/services` is "abc", and
 * `/system/swarm/nodes/n1/containers` below `/system/swarm/nodes` is "n1". Undefined for the page
 * itself and anything outside it.
 */
export function globalLeaf(url: string, path: string): string | undefined {
  if (!url.startsWith(`${path}/`)) return undefined;
  const id = url
    .slice(path.length + 1)
    .split(/[?#]/)[0]
    .split('/')[0];
  if (!id) return undefined;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * The agents' segments below a project: `/projects/<slug>/releases/agents` (epic qits-1681), a
 * page of the Releases section (qits-2482; the old `agents` redirects).
 */
export const AGENTS = 'releases/agents';

/**
 * The slots' segment below a project: `/projects/<slug>/workspaces/<slot id>`, a page of the
 * Releases section's Agents (the bare `workspaces` redirects to `releases/agents`).
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
 * `<project>/releases/requests/<id>` names the request by its logical id (`<repository>-rr-<n>`),
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

/**
 * The components section's segment below a project: `/projects/<slug>/components` (qits-2491;
 * the old `repositories` redirects).
 */
export const REPOSITORIES = 'components';

/** A repository's pages that have a crumb of their own, by segment (qits-2478). */
const REPOSITORY_PAGES: Readonly<Record<string, string>> = {
  artifacts: 'Artifacts',
  contracts: 'Contracts',
  entities: 'Entities',
  'ui-builder': 'UI builder',
  'release-requests': 'Release requests',
  docs: 'Docs',
};

/** Where in a repository the URL is: the repository, one of its pages, and a page below that. */
export interface RepositoryTrail {
  readonly repo: string;
  readonly page?: { readonly segment: string; readonly label: string };
  readonly leaf?: string;
}

/**
 * The trail below the Components section of the project at `project` (`/projects/<slug>`,
 * qits-2478): `<project>/components/<repo>` is the repository, `…/<repo>/contracts` one of its
 * pages, `…/contracts/<state>` a page below that (its segment, decoded). Undefined for the list
 * itself and anything outside it.
 */
export function repositoryTrail(url: string, project: string): RepositoryTrail | undefined {
  const prefix = `${project}/${REPOSITORIES}/`;
  if (!url.startsWith(prefix)) return undefined;
  const [repo, segment, ...rest] = url.slice(prefix.length).split(/[?#]/)[0].split('/');
  if (!repo) return undefined;
  // An artifact's page (qits-2477), `artifacts/<store>/<kind>/<name>`, is named by its name.
  const leaf = segment === 'artifacts' ? rest[2] : rest[0];
  const label = segment ? REPOSITORY_PAGES[segment] : undefined;
  return {
    repo: decodeURIComponent(repo),
    page: segment ? { segment, label: label ?? decodeURIComponent(segment) } : undefined,
    leaf: segment && leaf ? decodeURIComponent(leaf) : undefined,
  };
}

/**
 * The crumb of a CI page below the project at `project` (`/projects/<slug>`, qits-2482):
 * `<project>/releases/ci/runs/<run id>` is the run, by its id's first eight characters, and
 * `<project>/releases/ci/<repository>` the repository's name. Undefined for the list itself and
 * anything outside it.
 */
export function ciSubpage(url: string, project: string): NavPage | undefined {
  const prefix = `${project}/${CI}/`;
  if (!url.startsWith(prefix)) return undefined;
  const [first, second] = url.slice(prefix.length).split(/[?#]/)[0].split('/');
  if (first === 'runs') {
    return second
      ? { label: decodeURIComponent(second).slice(0, 8), path: `${prefix}runs/${second}` }
      : undefined;
  }
  return first ? { label: decodeURIComponent(first), path: `${prefix}${first}` } : undefined;
}

/** The deployment requests' segment below a project: `/projects/<slug>/deployments/requests`. */
export const DEPLOYMENT_REQUESTS = 'deployments/requests';

/** One release's requests below the deployment requests (qits-2323): `by-release/<repo>/<v>`. */
const BY_RELEASE = 'by-release';

/**
 * The crumb of one deployment request below the project at `project` (`/projects/<slug>`,
 * qits-2322): `<project>/deployments/requests/<id>` names the request `<version> · <application>`
 * once its page shows it (`shown`, `OpenDeploymentRequest`), else by its id's first eight
 * characters. One release's requests (qits-2323), `<project>/deployments/requests/by-release/
 * <repoId>/<version>`, is `release <version>`. Undefined for the list itself and anything outside
 * it.
 */
export function deploymentRequestSubpage(
  url: string,
  project: string,
  shown?: OpenDeploymentRequestName,
): NavPage | undefined {
  const prefix = `${project}/${DEPLOYMENT_REQUESTS}/`;
  if (!url.startsWith(prefix)) return undefined;
  const segments = url.slice(prefix.length).split(/[?#]/)[0].split('/');
  const id = segments[0];
  if (!id) return undefined;
  if (id === BY_RELEASE) {
    const [, repoId, version] = segments;
    if (!repoId || !version) return undefined;
    return {
      label: `release ${decodeURIComponent(version)}`,
      path: `${prefix}${BY_RELEASE}/${repoId}/${version}`,
    };
  }
  const requestId = decodeURIComponent(id);
  const named = shown?.id === requestId && shown.version ? shown : undefined;
  return {
    label: named
      ? [named.version, named.applicationName].filter(Boolean).join(' · ')
      : requestId.slice(0, 8),
    path: `${prefix}${id}`,
    marks: named
      ? {
          source: sourceMark(DEPLOYMENT_REQUEST),
          item: itemMark('id', requestId),
          derived: 'version applicationName',
        }
      : undefined,
  };
}
