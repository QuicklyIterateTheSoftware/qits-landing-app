import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { QITS_DOMAIN_EVENTS, QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { client as eventsClient } from '../../api/events/client.gen';
import { client as systemClient } from '../../api/system/client.gen';
import { client as ciClient } from '../../api/ci/client.gen';
import { client as edgeClient } from '../../api/edge/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { hostOrigin } from '$core/platform/platform-origins';
import { RECENT_EVENTS } from '$core/events/events.consumes';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Board } from '$ui/components/board/board';
import { BoardCard } from '$ui/components/board/board-card';
import { ShellLayout } from './shell.layout';
import { SidebarOutlet } from './sidebar-outlet';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { noPools, UPSTREAM_POOLS_PATH } from '../../../testing/browser/upstream-pools';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/** qits-network-access' page origin in these specs: its frontend is at `/` of that host (qits-2361). */
const NETWORK_ACCESS = 'https://network-access.qits.example.test';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A page with fixed text, so the screenshots show the layout and nothing that loads. */
@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

/**
 * A page with navigation of its own (qits-2493), as the UI builder's: once rendered it holds a
 * template in `SidebarOutlet`, one choice that asks the shell to close the burger's navigation, and
 * lets go of it on destroy. Fixed text, as `TestPage`.
 */
@Component({
  selector: 'app-nav-holding-page',
  template: `
    <p>Page content</p>
    <ng-template #nav>
      <ul class="m-0 list-none p-0" aria-label="Page navigation">
        <li><button type="button" (click)="outlet.close()">A choice</button></li>
      </ul>
    </ng-template>
  `,
})
class NavHoldingPage {
  protected readonly outlet = inject(SidebarOutlet);
  private readonly nav = viewChild.required<TemplateRef<unknown>>('nav');

  constructor() {
    let held: TemplateRef<unknown> | null = null;
    afterNextRender(() => {
      held = this.nav();
      this.outlet.show(held);
    });
    inject(DestroyRef).onDestroy(() => {
      if (held) this.outlet.clear(held);
    });
  }
}

/** A long page: actions, then a tall board, then more content; inline UI data. */
@Component({
  selector: 'app-tall-page',
  imports: [PageLayoutComponent, Board, BoardCard],
  template: `
    <app-page-layout title="Tall page" [actions]="actions">
      <ui-board [columns]="columns" gutter>
        @for (card of cards; track card) {
          <ui-board-card [column]="card % 2" [code]="'qits-' + card" title="A card" kind="task" />
        }
      </ui-board>
      <div class="h-[60rem]"></div>
    </app-page-layout>
  `,
})
class TallPage {
  readonly actions = [{ label: 'Act', variant: 'muted' as const, callback: () => undefined }];
  readonly columns = [
    { label: 'Left', body: 'bg-accent-soft', header: 'bg-accent-line text-fg' },
    { label: 'Right', body: 'bg-success-soft', header: 'bg-success-line text-fg' },
  ];
  readonly cards = Array.from({ length: 12 }, (_, i) => i + 1);
}

/**
 * A page with raised content, as the work section's is (qits-2224): a bar pinned below the shell's
 * top bar at the work tabs' `z-45`, then a raised link (`z-10`) and a raised button (`z-20`), as a
 * list row's drag handle and tags are. Fixed text, as `TestPage`.
 */
@Component({
  selector: 'app-pinned-page',
  template: `
    <div class="sticky top-[var(--app-pin-top,0px)] z-45 h-12 bg-surface">Pinned</div>
    <div class="relative">
      <a class="relative z-10 block h-64 bg-accent-soft" href="#">Raised link</a>
      <button class="absolute inset-x-0 top-64 z-20 h-64 bg-success-soft" type="button">
        Raised button
      </button>
    </div>
  `,
})
class PinnedPage {}

/**
 * Screenshots of the layout in a real browser: the wide sidebar, and the narrow burger closed and
 * open, with no project open; and the sidebar of an open project. The open project is qits-projects'
 * recorded one ("a project exists"), named by the URL; its release requests (the lightning menu and
 * the sidebar's Releases entry) are the recorded "a project with no release requests", or
 * "a project with pending release requests" where a case says so. The event stream never connects.
 * Each top-bar menu is also opened on a phone and on a wide screen, its reads answered with the
 * golden masters its own browser spec uses, to show where its panel lies.
 *
 * The shell's navigation is declared in the layout (epic qits-2000), and each exit is followed once
 * to a stand-in route: the sidebar's sections (`open-sidebar-section`), work pages
 * (`open-sidebar-work-page`), the gear (`open-project-settings`), and the trail's brand and crumbs
 * (`follow-breadcrumb`). The agents and release menus' own exits are followed in their own specs.
 * The global sections shown with no project open open a section of this app (System,
 * `open-sidebar-system`, qits-2344, Mirror,
 * `open-sidebar-mirror`, qits-2357, and Orchestrator, `open-sidebar-orchestrator`, qits-2359, each
 * to a stand-in route, with System's own pages below it
 * while it is open, `open-sidebar-system-page`, qits-2346, Mirror's, `open-sidebar-mirror-page`,
 * qits-2479, and IdP admin, `open-sidebar-idp`, qits-2481, with its pages,
 * `open-sidebar-idp-page`). Network access leaves the app for qits-network-access' own
 * frontend (qits-2361): the sidebar's entry (`open-sidebar-network-access`, qits-2262), shown with
 * no project open only (qits-2485), is pressed once. A page's own navigation (qits-2493) is a
 * stand-in page holding a template (`NavHoldingPage`), shown in the repository sidebar's place and
 * followed back once (`leave-sidebar-ui-builder`). The
 * page origins are under `PLATFORM_DOMAIN`, and `QITS_LEAVE_APP` is a spy, so the tab stays.
 */
describe('ShellLayout (screenshots)', () => {
  const PLATFORM_DOMAIN = 'qits.example.test';
  let http: HttpTestingController;
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    leave = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: TestPage },
          { path: 'system', component: TestPage },
          { path: 'system/swarm/services', component: TestPage },
          { path: 'system/swarm/services/:id', component: TestPage },
          { path: 'system/swarm/nodes', component: TestPage },
          { path: 'system/swarm/nodes/:id/containers', component: TestPage },
          { path: 'system/swarm/configs', component: TestPage },
          { path: 'system/swarm/configs/:id', component: TestPage },
          { path: 'system/swarm/secrets', component: TestPage },
          { path: 'system/targets', component: TestPage },
          { path: 'system/terminals/:id', component: TestPage },
          { path: 'mirror', component: TestPage },
          { path: 'mirror/repositories', component: TestPage },
          { path: 'mirror/repositories/:repository', component: TestPage },
          { path: 'mirror/upstreams', component: TestPage },
          { path: 'orchestrator', component: TestPage },
          { path: 'idp', component: TestPage },
          { path: 'idp/clients', component: TestPage },
          { path: 'idp/users', component: TestPage },
          { path: 'idp/devices', component: TestPage },
          { path: 'orchestrator/processes/:kind', component: TestPage },
          { path: 'projects', component: TestPage },
          { path: 'projects/:slug', component: TestPage },
          { path: 'projects/:slug/work', component: TestPage },
          { path: 'projects/:slug/work/refinement', component: PinnedPage },
          { path: 'projects/:slug/work/schedule', component: TestPage },
          { path: 'projects/:slug/work/in-progress', component: TallPage },
          { path: 'projects/:slug/work/acceptance', component: TestPage },
          { path: 'projects/:slug/work/archive', component: TestPage },
          { path: 'projects/:slug/work/detail/:item', component: TestPage },
          { path: 'projects/:slug/ideas', component: TestPage },
          { path: 'projects/:slug/releases', component: TestPage },
          { path: 'projects/:slug/releases/agents', component: TestPage },
          { path: 'projects/:slug/releases/agents/:agentId', component: TestPage },
          { path: 'projects/:slug/releases/requests', component: TestPage },
          { path: 'projects/:slug/releases/requests/:requestId', component: TestPage },
          { path: 'projects/:slug/releases/ci', component: TestPage },
          { path: 'projects/:slug/releases/ci/runs/:runId', component: TestPage },
          { path: 'projects/:slug/desk', component: TestPage },
          { path: 'projects/:slug/components', component: TestPage },
          { path: 'projects/:slug/components/:repo', component: TestPage },
          { path: 'projects/:slug/components/:repo/ui-builder', component: NavHoldingPage },
          { path: 'projects/:slug/deployments', component: TestPage },
          { path: 'projects/:slug/deployments/requests', component: TestPage },
          { path: 'projects/:slug/observability', component: TestPage },
          { path: 'projects/:slug/observability/logs', component: TestPage },
          { path: 'projects/:slug/observability/errors', component: TestPage },
          { path: 'projects/:slug/observability/metrics', component: TestPage },
          { path: 'projects/:slug/observability/traces', component: TestPage },
          { path: 'projects/:slug/docs', component: TestPage },
          { path: 'projects/:slug/events', component: TestPage },
          { path: 'projects/:slug/setup', component: TestPage },
          { path: 'projects/:slug/workspaces/:slotId', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(maintenanceClient),
        provideHeyApiClient(eventsClient),
        provideHeyApiClient(systemClient),
        provideHeyApiClient(ciClient),
        provideHeyApiClient(edgeClient),
        provideTestPlatformOrigins(
          {},
          {
            idp: hostOrigin('idp', PLATFORM_DOMAIN),
            'network-access': NETWORK_ACCESS,
          },
        ),
        { provide: QITS_LEAVE_APP, useValue: leave },
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        // The shell's resources follow that stream, as `app.config.ts` provides it (qits-2146).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /**
   * The layout at the root, with no project open: nothing is read (`SelectedProject` reads the
   * project list once a URL names a project, qits-2146).
   */
  async function render(url = '/') {
    const fixture = TestBed.createComponent(ShellLayout);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await settle();
    http.expectNone('/projects/api/projects');
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, layout: page.elementLocator(fixture.nativeElement) };
  }

  it('shows the sidebar beside the page on a wide screen', async () => {
    const { layout } = await render();
    await expect.element(layout).toMatchTextContent('Page content');
    // The theme is the top bar's menu here; the navigation's own radios are for phones (qits-2086).
    await expect.element(page.getByRole('button', { name: 'Theme', exact: true })).toBeVisible();
    await expect
      .element(
        page
          .getByRole('navigation', { name: 'qits' })
          .getByRole('group', { name: 'Theme', includeHidden: true }),
      )
      .not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('wide', { kind: 'DATA' });
  });

  it('hides the sidebar behind the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { layout } = await render();
    await expect.element(layout).toMatchScreenshot('narrow', { kind: 'DATA' });
  });

  it('opens the sidebar from the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { fixture, layout } = await render();
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    await expect.element(page.getByRole('navigation', { name: 'qits' })).toBeVisible();
    // At the root the navigation holds no project's sections: Projects (qits-2532), the global sections (System,
    // qits-2344; Mirror, qits-2357; Orchestrator, qits-2359; IdP admin,
    // qits-2481), then Network access, the phone's way there (qits-2262); the "qits" brand leads
    // home.
    const links = page.getByRole('navigation', { name: 'qits' }).getByRole('link');
    expect(links.elements().map((link) => link.textContent?.trim())).toEqual([
      'Projects',
      'System',
      'Mirror',
      'Orchestrator',
      'IdP admin',
      'Network access',
    ]);
    await expect.element(links.first()).toBeVisible();
    // The top bar has no room for the theme menu on a phone: its radios are at the navigation's
    // foot instead, so System, Light and Dark are reachable at every width (qits-2086).
    await expect
      .element(page.getByRole('button', { name: 'Theme', exact: true, includeHidden: true }))
      .not.toBeVisible();
    const theme = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('group', { name: 'Theme' });
    await expect.element(theme).toBeVisible();
    await expect.element(theme.getByRole('radio', { name: 'System' })).toBeChecked();
    await userEvent.click(theme.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    await userEvent.click(theme.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await expect.element(layout).toMatchScreenshot('narrow-open', { kind: 'DATA' });
  });

  /**
   * The layout at `path` below the recorded project, which is open; its menus answered, the
   * release requests from the recorded `requests` state, the agents menu's read refused.
   */
  async function renderProject(path: string, requests = 'a project with no release requests') {
    const fixture = TestBed.createComponent(ShellLayout);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const navigated = TestBed.inject(Router).navigateByUrl(`/projects/${project.slug}${path}`);
    fixture.detectChanges();
    await navigated;
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await settle();
    TestBed.tick();
    await settle();
    // Read once (qits-2146), by `ProjectReleaseRequests`, for the sidebar, the trail and the
    // lightning menu; the rounds let its read start and settle.
    const answer = await goldenMaster(requests, 'listProjectReleaseRequests');
    for (let round = 0; round < 2; round++) {
      for (const read of http.match(`/projects/api/projects/${project.id}/release-requests`)) {
        read.flush(answer);
      }
      await settle();
      TestBed.tick();
      await settle();
    }
    // The agents menu's read, refused: its own browser spec draws agents; here its badge stays
    // hidden and the bar shows only its icon.
    http
      .expectOne(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, project, layout: page.elementLocator(fixture.nativeElement) };
  }

  it('lists the open project’s sections and marks the current one', async () => {
    const { project, layout } = await renderProject('/work');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(navigation.getByRole('link', { name: 'Components' })).toBeVisible();
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(project.name);
    await expect.element(layout).toMatchScreenshot('project', { kind: 'DATA' });
  });

  it('lists the work section’s pages below Work and marks the current one', async () => {
    const { layout } = await renderProject('/work/acceptance');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    // Work holds the current page; the page itself is the current link.
    await expect
      .element(navigation.getByRole('link', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    for (const label of ['Refinement', 'In Progress', 'Archive']) {
      await expect.element(navigation.getByRole('link', { name: label })).toBeVisible();
    }
    await expect
      .element(navigation.getByRole('link', { name: 'Acceptance' }))
      .toHaveAttribute('aria-current', 'page');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Work' })).toBeVisible();
    await expect.element(breadcrumb).toMatchTextContent('Acceptance');
    await expect.element(layout).toMatchScreenshot('work-tab', { kind: 'DATA' });
  });

  it('lists Ideas, then Refinement first of the work pages below Work, no Campaigns or Milestones, and marks it when open', async () => {
    await renderProject('/work/refinement');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    const refinement = navigation.getByRole('link', { name: 'Refinement' });
    await expect.element(refinement).toBeVisible();
    await expect.element(refinement).toHaveAttribute('aria-current', 'page');
    // First of the work section's pages, below Work and Ideas (epic qits-1899: no Campaigns;
    // qits-2483: Ideas).
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((a) => a.textContent?.trim());
    expect(labels.slice(labels.indexOf('Work'), labels.indexOf('Work') + 4)).toEqual([
      'Work',
      'Ideas',
      'Refinement',
      'Schedule',
    ]);
    expect(labels).not.toContain('Campaigns');
    expect(labels).not.toContain('Milestones');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent('Refinement');
  });

  it('shows the newest release request below Releases, with its pages below it', async () => {
    const { project, layout } = await renderProject(
      '/releases/requests',
      'a project with pending release requests',
    );
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const entry = navigation.getByRole('link', { name: /^Releases/ });
    await expect.element(entry).toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Requests', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    // Recorded: every request changed at the same instant, so the first listed is the newest.
    await expect.element(entry).toMatchTextContent('contract-service');
    await expect.element(entry).toMatchTextContent('pending');
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((a) => a.firstChild?.textContent?.trim());
    expect(labels).toEqual([
      'Work',
      'Releases',
      // Its pages, while it is open (qits-2482).
      'Requests',
      'Agents',
      'CI',
      'Components',
      'Deployments',
      'Observability',
      'Events',
      // No Network access with a project open (qits-2485).
    ]);
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${project.name}›Releases›Requests`);
    await expect.element(layout).toMatchScreenshot('release-requests', { kind: 'DATA' });
  });

  it('shows no line below Releases for a project without any', async () => {
    await renderProject('/work');
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Releases' });
    await expect.element(entry).toMatchTextContent(/^Releases$/);
  });

  it('shows the whole breadcrumb trail of a work item on a wide screen', async () => {
    const { project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: project.name })).toBeVisible();
    await expect.element(breadcrumb.getByRole('button', { includeHidden: true })).not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-wide', { kind: 'DATA' });
  });

  /** True when `element`'s box lies within the window, left to right. */
  function inWindow(element: Element): boolean {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.left >= 0 && box.right <= window.innerWidth;
  }

  it('collapses a work item’s breadcrumbs to the …, the parent and the current page on a phone', async () => {
    await page.viewport(390, 844);
    const { fixture, project, layout } = await renderProject('/work/detail/qits-112');
    const root = fixture.nativeElement as HTMLElement;
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    const ellipsis = breadcrumb.getByRole('button', {
      name: `Show the full path: qits › Projects › ${project.name} › Work`,
    });
    await expect.element(ellipsis).toBeVisible();
    await expect.element(ellipsis).toHaveAttribute('aria-haspopup', 'true');
    await expect.element(ellipsis).toHaveAttribute('aria-expanded', 'false');
    // Only the parent and the current page show after the "…"; the panel is closed.
    const trail = root.querySelector('nav[aria-label="Breadcrumb"] > ol')!;
    // The parent a link, the current page its text.
    const visible = [...trail.querySelectorAll<HTMLElement>('a, [aria-current=page]')].filter(
      (link) => link.getBoundingClientRect().width > 0,
    );
    expect(visible.map((link) => link.textContent?.trim())).toEqual(['Work', 'qits-112']);
    await expect
      .element(page.getByRole('region', { name: 'Full path', includeHidden: true }))
      .not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-narrow', { kind: 'DATA' });
  });

  it('opens the whole path from the … on a phone, and closes it', async () => {
    await page.viewport(390, 844);
    const { fixture, project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    const ellipsis = breadcrumb.getByRole('button', { name: /^Show the full path/ });
    const panel = page.getByRole('region', { name: 'Full path', includeHidden: true });
    const open = async () => {
      await userEvent.click(ellipsis);
      fixture.detectChanges();
      await expect.element(panel).toBeVisible();
      await expect.element(ellipsis).toHaveAttribute('aria-expanded', 'true');
    };

    await open();
    for (const name of ['qits', 'Projects', project.name, 'Work']) {
      const link = panel.getByRole('link', { name, exact: true });
      await expect.element(link).toBeVisible();
      expect(inWindow(link.element())).toBe(true);
    }
    // The current page: not a link, whole.
    const current = panel.getByText('qits-112', { exact: true });
    await expect.element(current).toHaveAttribute('aria-current', 'page');
    expect(current.element().tagName).toBe('SPAN');
    expect(current.element().scrollWidth).toBeLessThanOrEqual(current.element().clientWidth);
    expect(inWindow(current.element())).toBe(true);
    expect(inWindow(panel.element())).toBe(true);
    await expect.element(layout).toMatchScreenshot('work-item-narrow-expanded', { kind: 'DATA' });

    // Escape closes it and gives the focus back to the "…".
    await userEvent.keyboard('{Escape}');
    fixture.detectChanges();
    await expect.element(panel).not.toBeVisible();
    await expect.element(ellipsis).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(ellipsis.element());

    // A click outside closes it: on the page below the sheet, which covers the page's top.
    await open();
    await userEvent.click(page.elementLocator(fixture.nativeElement.querySelector('main')!), {
      position: { x: 20, y: 600 },
    });
    fixture.detectChanges();
    await expect.element(panel).not.toBeVisible();

    // Following a link in it navigates and closes it.
    await open();
    await userEvent.click(panel.getByRole('link', { name: 'Work', exact: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/work`);
    expect(reached()).toEqual(['follow-breadcrumb:work']);
    await expect.element(panel).not.toBeVisible();
    await expect.element(ellipsis).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a work item’s page within a phone’s width', async () => {
    await page.viewport(390, 844);
    const { fixture } = await renderProject('/work/detail/qits-112');
    const root = fixture.nativeElement as HTMLElement;
    const main = root.querySelector('main')!;
    const menus = root.querySelector('header')!.lastElementChild!;
    // The top bar's trail and menus do not widen the page: nothing scrolls sideways.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(main.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    expect(menus.lastElementChild!.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth,
    );
    // The parent gives way first: the current page stays on screen and in the trail.
    const trail = root.querySelector('ui-breadcrumbs')!.getBoundingClientRect();
    const current = root
      .querySelector('nav[aria-label="Breadcrumb"] > ol [aria-current=page]')!
      .getBoundingClientRect();
    expect(current.left).toBeGreaterThanOrEqual(0);
    expect(current.right).toBeLessThanOrEqual(window.innerWidth);
    expect(
      Math.min(current.right, trail.right) - Math.max(current.left, trail.left),
    ).toBeGreaterThan(0);
  });

  it('shows a work tab’s name whole beside all five menus on a phone', async () => {
    await page.viewport(390, 844);
    const { fixture } = await renderProject('/work/refinement');
    const root = fixture.nativeElement as HTMLElement;
    const menus = root.querySelector('header')!.lastElementChild!;
    // All five menus show: the project is open.
    expect(
      [...menus.children].filter((menu) => menu.getBoundingClientRect().width > 0),
    ).toHaveLength(5);
    const current = root.querySelector<HTMLElement>(
      'nav[aria-label="Breadcrumb"] > ol [aria-current=page]',
    )!;
    expect(current.textContent?.trim()).toBe('Refinement');
    expect(current.scrollWidth).toBeLessThanOrEqual(current.clientWidth);
    // The parent shows whole on the trail's line or not at all: never a clipped sliver.
    const trail = current.closest('ol')!;
    const parent = trail.children[trail.children.length - 2] as HTMLElement;
    if (parent.getBoundingClientRect().top < trail.getBoundingClientRect().bottom) {
      expect(parent.scrollWidth).toBeLessThanOrEqual(parent.clientWidth);
    }
    expect(inWindow(current)).toBe(true);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it('opens the sidebar over the page’s pinned content on a phone', async () => {
    await page.viewport(390, 844);
    const { fixture, layout } = await renderProject('/work/refinement');
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const nav = root.querySelector<HTMLElement>('#layout-nav')!;
    await expect.element(page.getByRole('navigation', { name: 'qits' })).toBeVisible();
    /** What the browser hits at the centre of `element`. */
    const atCentre = (element: Element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    };
    // Work lies where the page's pinned bar (z-45) pins, Refinement, Events and Desk over its
    // raised content: the sidebar is drawn over all of it (qits-2224).
    const links = [...nav.querySelectorAll('a')];
    for (const label of ['Work', 'Refinement', 'Events', 'Desk']) {
      const link = links.find((a) => a.textContent?.trim() === label)!;
      expect(link, label).toBeDefined();
      expect(nav.contains(atCentre(link)), label).toBe(true);
    }
    // The top bar stays above the sidebar: the burger closes it.
    const burger = root.querySelector<HTMLElement>('button[aria-controls="layout-nav"]')!;
    expect(burger.contains(atCentre(burger))).toBe(true);
    await expect.element(layout).toMatchScreenshot('narrow-open-over-page', { kind: 'DATA' });
  });

  /** The outcomes the test reached, as `<interaction>:<outcome>`. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** Clicks `link`, lets the navigation end, and gives the router's URL. */
  async function follow(
    fixture: { detectChanges(): void; whenStable(): Promise<unknown> },
    link: ReturnType<typeof page.getByRole>,
  ) {
    await userEvent.click(link);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return TestBed.inject(Router).url;
  }

  /** The sidebar's sections, by label, with their segment below the project and their outcome. */
  const SECTIONS = [
    { label: 'Work', segment: 'work', outcome: 'work' },
    { label: /^Releases/, segment: 'releases', outcome: 'releases' },
    { label: 'Components', segment: 'components', outcome: 'components' },
    { label: 'Deployments', segment: 'deployments', outcome: 'deployments' },
    { label: 'Observability', segment: 'observability', outcome: 'observability' },
    { label: 'Events', segment: 'events', outcome: 'events' },
  ] as const;

  for (const section of SECTIONS) {
    it(`open-sidebar-section ${section.outcome}: the sidebar's ${section.segment} opens it`, async () => {
      const { fixture, project } = await renderProject('/work/detail/qits-112');
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', {
        name: section.label,
        exact: typeof section.label === 'string',
      });
      expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/${section.segment}`);
      expect(reached()).toEqual([`open-sidebar-section:${section.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
    });
  }

  /** The work pages below Work in the sidebar, by label, with their segment and their outcome. */
  const WORK_PAGES = [
    { label: 'Refinement', segment: 'refinement', outcome: 'refinement' },
    { label: 'Schedule', segment: 'schedule', outcome: 'schedule' },
    { label: 'In Progress', segment: 'in-progress', outcome: 'inProgress' },
    { label: 'Acceptance', segment: 'acceptance', outcome: 'acceptance' },
    { label: 'Archive', segment: 'archive', outcome: 'archive' },
  ] as const;

  for (const work of WORK_PAGES) {
    it(`open-sidebar-work-page ${work.outcome}: ${work.label} below Work opens it`, async () => {
      // On a work page already, so the work pages show below Work.
      const from = work.segment === 'archive' ? '/work/acceptance' : '/work/archive';
      const { fixture, project } = await renderProject(from);
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: work.label, exact: true });
      expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/work/${work.segment}`);
      expect(reached()).toEqual([`open-sidebar-work-page:${work.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
      await expect
        .element(navigation.getByRole('link', { name: 'Work', exact: true }))
        .toHaveAttribute('aria-current', 'true');
    });
  }

  /** The Releases pages below Releases in the sidebar (qits-2482), with their segment and outcome. */
  const RELEASES_PAGES = [
    { label: 'Requests', segment: 'requests', from: '/releases/ci' },
    { label: 'Agents', segment: 'agents', from: '/releases/requests' },
    { label: 'CI', segment: 'ci', from: '/releases/requests' },
  ] as const;

  for (const releases of RELEASES_PAGES) {
    it(`open-sidebar-releases-page ${releases.segment}: ${releases.label} below Releases opens it`, async () => {
      // On a Releases page already, so its pages show below Releases.
      const { fixture, project } = await renderProject(releases.from);
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: releases.label, exact: true });
      expect(await follow(fixture, link)).toBe(
        `/projects/${project.slug}/releases/${releases.segment}`,
      );
      expect(reached()).toEqual([`open-sidebar-releases-page:${releases.segment}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
      await expect
        .element(navigation.getByRole('link', { name: /^Releases/ }))
        .toHaveAttribute('aria-current', 'true');
    });
  }

  it('open-sidebar-work-page ideas: Ideas, first below Work and set apart, opens the ideas', async () => {
    const { fixture, project } = await renderProject('/work/archive');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Ideas', exact: true });
    const work = navigation.getByRole('link', { name: 'Work', exact: true });
    // Work's first page, with a gap below it before the work pages (qits-2483).
    const pages = work.element().parentElement?.querySelectorAll(':scope > ul a') ?? [];
    expect([...pages].map((a) => a.textContent?.trim())).toEqual([
      'Ideas',
      ...WORK_PAGES.map((page) => page.label),
    ]);
    const gap = (a: Element) =>
      parseFloat(getComputedStyle(a.parentElement as Element).marginBottom);
    expect(gap(pages[0])).toBeGreaterThan(0);
    expect(gap(pages[1])).toBe(0);
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/ideas`);
    expect(reached()).toEqual(['open-sidebar-work-page:ideas']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect.element(work).toHaveAttribute('aria-current', 'true');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${project.name}›Work›Ideas`);
  });

  /** The Components section open, its search's repositories read once the field is focused. */
  async function openSearch() {
    const rendered = await renderProject('/components');
    const field = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('combobox', { name: 'Search components' });
    await userEvent.click(field);
    await settle();
    const repositories = await goldenMaster('two projects exist', 'listProjectRepositories');
    http
      .expectOne(`/projects/api/projects/${rendered.project.id}/repositories`)
      .flush(repositories);
    await settle();
    rendered.fixture.detectChanges();
    const entries = (repositories as { entries?: { repository?: { name?: string } }[] }).entries;
    const names = (entries ?? []).map((entry) => entry.repository?.name ?? '');
    return { ...rendered, field, names };
  }

  it('lists Search first below Components while it is open, and reads nothing before (qits-2491)', async () => {
    await renderProject('/components');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('combobox', { name: 'Search components' }))
      .toBeVisible();
    http.expectNone((request) => request.url.endsWith('/repositories'));
    await expect
      .element(navigation.getByRole('link', { name: 'Components', exact: true }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('shows no Search while Components is closed', async () => {
    await renderProject('/work');
    await expect
      .element(page.getByRole('combobox', { name: 'Search components', includeHidden: true }))
      .not.toBeInTheDocument();
  });

  it('open-component-search opened: typing part of a name lists the matching repositories, Enter opens the highlighted one', async () => {
    const { fixture, project, field, names } = await openSearch();
    const name = names[0];
    // Part of the name, in other case: the match ignores case.
    const part = name.slice(1, 5).toUpperCase();
    await userEvent.type(field, part);
    fixture.detectChanges();
    const list = page.getByRole('listbox', { name: 'Matching components' });
    await expect.element(list).toBeVisible();
    const options = list.getByRole('option').elements();
    expect(options.map((option) => option.textContent?.trim())).toEqual(
      names.filter((other: string) => other.toLowerCase().includes(part.toLowerCase())),
    );
    await expect.element(field).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    fixture.detectChanges();
    await expect.element(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    await settle();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project.slug}/components/${encodeURIComponent(name)}`,
    );
    expect(reached()).toEqual(['open-component-search:opened']);
  });

  it('open-component-search opened: a click on a match opens it; Escape closes the list', async () => {
    const { fixture, project, field, names } = await openSearch();
    await userEvent.type(field, names[1]);
    fixture.detectChanges();
    const list = page.getByRole('listbox', { name: 'Matching components' });
    await expect.element(list).toBeVisible();
    await userEvent.keyboard('{Escape}');
    fixture.detectChanges();
    await expect
      .element(page.getByRole('listbox', { name: 'Matching components', includeHidden: true }))
      .not.toBeVisible();
    await expect.element(field).toHaveAttribute('aria-expanded', 'false');
    await userEvent.type(field, '{ArrowDown}');
    fixture.detectChanges();
    const option = list.getByRole('option', { name: names[1], exact: true });
    expect(await follow(fixture, option)).toBe(
      `/projects/${project.slug}/components/${encodeURIComponent(names[1])}`,
    );
    expect(reached()).toEqual(['open-component-search:opened']);
  });

  it('says when no component matches', async () => {
    const { fixture, field } = await openSearch();
    await userEvent.type(field, 'no-such-component');
    fixture.detectChanges();
    await expect
      .element(page.getByRole('listbox', { name: 'Matching components' }))
      .toMatchTextContent('No component matches.');
  });

  /** The page that holds its own navigation (`NavHoldingPage`), below `contract-service`. */
  async function renderPageNav() {
    const rendered = await renderProject('/components/contract-service/ui-builder');
    await settle();
    rendered.fixture.detectChanges();
    await rendered.fixture.whenStable();
    return rendered;
  }

  it('shows a page’s own navigation in the repository sidebar’s place, below “← <repo>” (qits-2493)', async () => {
    const { fixture, project, layout } = await renderPageNav();
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect.element(navigation.getByRole('list', { name: 'Page navigation' })).toBeVisible();
    const back = navigation.getByRole('link', { name: '← contract-service' });
    await expect.element(back).toBeVisible();
    await expect
      .element(back)
      .toHaveAttribute('href', `/projects/${project.slug}/components/contract-service`);
    // The repository sidebar and the project's sections are not rendered meanwhile.
    expect(navigation.getByRole('list', { name: 'Repository' }).query()).toBeNull();
    expect(navigation.getByRole('link', { name: 'Work', exact: true }).query()).toBeNull();
    await expect.element(layout).toMatchScreenshot('page-nav', { kind: 'DATA' });

    // Let go of, the repository sidebar is back.
    const outlet = TestBed.inject(SidebarOutlet);
    outlet.clear(outlet.template()!);
    fixture.detectChanges();
    await expect.element(navigation.getByRole('list', { name: 'Repository' })).toBeVisible();
    await expect.element(navigation.getByRole('link', { name: '← Components' })).toBeVisible();
    expect(navigation.getByRole('list', { name: 'Page navigation' }).query()).toBeNull();
  });

  it('leave-sidebar-ui-builder overview: “← <repo>” goes back to the repository’s page and its sidebar (qits-2493)', async () => {
    const { fixture, project } = await renderPageNav();
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const back = navigation.getByRole('link', { name: '← contract-service' });
    expect(await follow(fixture, back)).toBe(
      `/projects/${project.slug}/components/contract-service`,
    );
    expect(reached()).toEqual(['leave-sidebar-ui-builder:overview']);
    fixture.detectChanges();
    // The page let go of its navigation: the repository's sidebar, Overview current.
    await expect
      .element(navigation.getByRole('link', { name: 'Overview' }))
      .toHaveAttribute('aria-current', 'page');
    expect(navigation.getByRole('list', { name: 'Page navigation' }).query()).toBeNull();
  });

  it('closes the burger’s navigation on a choice in a page’s own navigation (qits-2493)', async () => {
    await page.viewport(390, 844);
    const { fixture } = await renderPageNav();
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect.element(navigation).toBeVisible();
    await userEvent.click(navigation.getByRole('button', { name: 'A choice' }));
    fixture.detectChanges();
    await expect
      .element(page.getByRole('navigation', { name: 'qits', includeHidden: true }))
      .not.toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Navigation' }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  it('open-sidebar-deployments-page requests: Requests below Deployments opens it', async () => {
    // On the section's page already, so its pages show below Deployments.
    const { fixture, project } = await renderProject('/deployments');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Requests', exact: true });
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/deployments/requests`);
    expect(reached()).toEqual(['open-sidebar-deployments-page:requests']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'Deployments', exact: true }))
      .toHaveAttribute('aria-current', 'true');
  });

  it('open-sidebar-observability-page logs: Logs below Observability opens it', async () => {
    // On the section's page already, so its pages show below Observability.
    const { fixture, project } = await renderProject('/observability');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Logs', exact: true });
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/observability/logs`);
    expect(reached()).toEqual(['open-sidebar-observability-page:logs']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'Observability', exact: true }))
      .toHaveAttribute('aria-current', 'true');
  });

  it('open-sidebar-observability-page errors: Errors below Observability opens it', async () => {
    const { fixture, project } = await renderProject('/observability/logs');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Errors', exact: true });
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/observability/errors`);
    expect(reached()).toEqual(['open-sidebar-observability-page:errors']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'Observability', exact: true }))
      .toHaveAttribute('aria-current', 'true');
  });

  it('open-sidebar-observability-page metrics: Metrics below Observability opens it', async () => {
    const { fixture, project } = await renderProject('/observability/logs');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Metrics', exact: true });
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/observability/metrics`);
    expect(reached()).toEqual(['open-sidebar-observability-page:metrics']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'Observability', exact: true }))
      .toHaveAttribute('aria-current', 'true');
  });

  it('open-sidebar-observability-page traces: Traces below Observability opens it', async () => {
    const { fixture, project } = await renderProject('/observability/logs');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const link = navigation.getByRole('link', { name: 'Traces', exact: true });
    expect(await follow(fixture, link)).toBe(`/projects/${project.slug}/observability/traces`);
    expect(reached()).toEqual(['open-sidebar-observability-page:traces']);
    await expect.element(link).toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'Observability', exact: true }))
      .toHaveAttribute('aria-current', 'true');
  });

  it('open-project-settings open: the gear opens the project’s settings, marked current there', async () => {
    const { fixture, project } = await renderProject('/work/acceptance');
    const gear = page.getByRole('link', { name: 'Settings' });
    await expect.element(gear).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, gear)).toBe(`/projects/${project.slug}/setup`);
    expect(reached()).toEqual(['open-project-settings:open']);
    await expect.element(gear).toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${project.name}›Setup`);
  });

  it('open-project-desk open: the desk icon opens the project’s desk, marked current there', async () => {
    const { fixture, project } = await renderProject('/work/acceptance');
    const icon = page.getByRole('banner').getByRole('link', { name: 'Desk' });
    await expect.element(icon).toHaveAttribute('title', 'Desk');
    await expect.element(icon).not.toHaveAttribute('aria-current');
    // No sidebar entry of its own from 768px (qits-2484).
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Desk' }))
      .not.toBeInTheDocument();
    expect(await follow(fixture, icon)).toBe(`/projects/${project.slug}/desk`);
    expect(reached()).toEqual(['open-project-desk:open']);
    await expect.element(icon).toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${project.name}›Desk`);
  });

  it('open-sidebar-desk open: on a phone the burger’s Desk entry opens the project’s desk', async () => {
    await page.viewport(390, 844);
    const { fixture, project } = await renderProject('/work/acceptance');
    // The top bar has no room for the icon below 768px.
    await expect
      .element(page.getByRole('banner').getByRole('link', { name: 'Desk', includeHidden: true }))
      .not.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Desk' });
    await expect.element(entry).toBeVisible();
    expect(await follow(fixture, entry)).toBe(`/projects/${project.slug}/desk`);
    expect(reached()).toEqual(['open-sidebar-desk:open']);
  });

  it('shows no desk icon with no project open', async () => {
    await render();
    await expect
      .element(page.getByRole('banner').getByRole('link', { name: 'Desk', includeHidden: true }))
      .not.toBeInTheDocument();
  });

  it('open-sidebar-network-access networkAccess: the sidebar’s Network access leaves for its frontend with no project open', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Network access' });
    await expect.element(entry).toHaveAttribute('href', `${NETWORK_ACCESS}/`);
    expect(await follow(fixture, entry)).toBe('/');
    expect(leave).toHaveBeenCalledExactlyOnceWith(`${NETWORK_ACCESS}/`);
    expect(reached()).toEqual(['open-sidebar-network-access:networkAccess']);
  });

  it('lists the global sections, then Network access, with no project open', async () => {
    const { layout } = await render();
    const labels = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Projects',
      'System',
      'Mirror',
      'Orchestrator',
      'IdP admin',
      'Network access',
    ]);
    await expect.element(layout).toMatchScreenshot('root-sidebar', { kind: 'DATA' });
  });

  it('open-sidebar-projects open: the sidebar’s Projects opens the project picker, marked current there', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render('/system/swarm/nodes');
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Projects', exact: true });
    await expect.element(entry).toHaveAttribute('href', '/projects');
    await expect.element(entry).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, entry)).toBe('/projects');
    expect(reached()).toEqual(['open-sidebar-projects:open']);
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
  });

  it('open-sidebar-system open: the sidebar’s System opens the System section, marked current there', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'System', exact: true });
    await expect.element(entry).toHaveAttribute('href', '/system');
    await expect.element(entry).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, entry)).toBe('/system');
    expect(reached()).toEqual(['open-sidebar-system:open']);
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
  });

  it('open-sidebar-mirror open: the sidebar’s Mirror opens the Mirror section, marked current there', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Mirror', exact: true });
    await expect.element(entry).toHaveAttribute('href', '/mirror');
    await expect.element(entry).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, entry)).toBe('/mirror');
    expect(reached()).toEqual(['open-sidebar-mirror:open']);
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
  });

  it('open-sidebar-orchestrator open: the sidebar’s Orchestrator opens the Orchestrator section, marked current there', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Orchestrator', exact: true });
    await expect.element(entry).toHaveAttribute('href', '/orchestrator');
    await expect.element(entry).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, entry)).toBe('/orchestrator');
    expect(reached()).toEqual(['open-sidebar-orchestrator:open']);
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
  });

  /**
   * The Orchestrator section's processes below Orchestrator in the sidebar, in this order:
   * Garbage collection (qits-2480), Manifest scan and SBOM check (qits-2490).
   */
  const ORCHESTRATOR_PAGES = [
    { label: 'Garbage collection', path: '/orchestrator/processes/gc', outcome: 'gc' },
    { label: 'Manifest scan', path: '/orchestrator/processes/scan', outcome: 'scan' },
    { label: 'SBOM check', path: '/orchestrator/processes/sbom-check', outcome: 'sbomCheck' },
  ] as const;

  it('lists the Orchestrator section’s processes below Orchestrator while it is open', async () => {
    await page.viewport(1280, 800);
    await render('/orchestrator');
    const labels = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    const at = labels.indexOf('Orchestrator');
    expect(labels.slice(at, at + 1 + ORCHESTRATOR_PAGES.length)).toEqual([
      'Orchestrator',
      ...ORCHESTRATOR_PAGES.map((process) => process.label),
    ]);
  });

  for (const process of ORCHESTRATOR_PAGES) {
    it(`open-sidebar-orchestrator-page ${process.outcome}: ${process.label} below Orchestrator opens its process (qits-2480, qits-2490)`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render('/orchestrator');
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: process.label, exact: true });
      await expect.element(link).toHaveAttribute('href', process.path);
      expect(await follow(fixture, link)).toBe(process.path);
      expect(reached()).toEqual([`open-sidebar-orchestrator-page:${process.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
      await expect
        .element(navigation.getByRole('link', { name: 'Orchestrator', exact: true }))
        .toHaveAttribute('aria-current', 'true');
    });
  }

  it('lists the System section’s pages below System while it is open, and marks the current one', async () => {
    await page.viewport(1280, 800);
    await render('/system/swarm/nodes');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Projects',
      'System',
      'Services',
      'Nodes',
      'Configs',
      'Secrets',
      'Targets',
      'Mirror',
      'Orchestrator',
      'IdP admin',
      'Network access',
    ]);
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Nodes', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    for (const label of ['Services', 'Configs', 'Secrets']) {
      await expect
        .element(navigation.getByRole('link', { name: label, exact: true }))
        .not.toHaveAttribute('aria-current');
    }
    await expect
      .element(navigation.getByRole('link', { name: 'Mirror', exact: true }))
      .not.toHaveAttribute('aria-current');
  });

  it('marks Targets below System current on the targets page (qits-2351)', async () => {
    await page.viewport(1280, 800);
    await render('/system/targets');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Targets', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    for (const label of ['Services', 'Nodes', 'Configs', 'Secrets']) {
      await expect
        .element(navigation.getByRole('link', { name: label, exact: true }))
        .not.toHaveAttribute('aria-current');
    }
  });

  /** The System section's pages below System in the sidebar (qits-2346, qits-2348, qits-2350, qits-2351), each from another. */
  const SYSTEM_PAGES = [
    {
      label: 'Services',
      path: '/system/swarm/services',
      from: '/system/swarm/nodes',
      outcome: 'services',
    },
    {
      label: 'Nodes',
      path: '/system/swarm/nodes',
      from: '/system/swarm/services',
      outcome: 'nodes',
    },
    {
      label: 'Configs',
      path: '/system/swarm/configs',
      from: '/system/swarm/services',
      outcome: 'configs',
    },
    {
      label: 'Secrets',
      path: '/system/swarm/secrets',
      from: '/system/swarm/nodes',
      outcome: 'secrets',
    },
    {
      label: 'Targets',
      path: '/system/targets',
      from: '/system/swarm/services',
      outcome: 'targets',
    },
  ] as const;

  for (const system of SYSTEM_PAGES) {
    it(`open-sidebar-system-page ${system.outcome}: ${system.label} below System opens it`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render(system.from);
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: system.label, exact: true });
      await expect.element(link).toHaveAttribute('href', system.path);
      expect(await follow(fixture, link)).toBe(system.path);
      expect(reached()).toEqual([`open-sidebar-system-page:${system.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
      await expect
        .element(navigation.getByRole('link', { name: 'System', exact: true }))
        .toHaveAttribute('aria-current', 'true');
    });
  }

  it('lists the Mirror section’s pages below Mirror while it is open, and marks the current one (qits-2479)', async () => {
    await page.viewport(1280, 800);
    await render('/mirror/repositories');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Projects',
      'System',
      'Mirror',
      'Caches',
      'OCI upstreams',
      'Orchestrator',
      'IdP admin',
      'Network access',
    ]);
    await expect
      .element(navigation.getByRole('link', { name: 'Mirror', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Caches', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: 'OCI upstreams', exact: true }))
      .not.toHaveAttribute('aria-current');
  });

  /** The Mirror section's pages below Mirror in the sidebar (qits-2479), each from the other. */
  const MIRROR_PAGES = [
    {
      label: 'Caches',
      path: '/mirror/repositories',
      from: '/mirror/upstreams',
      outcome: 'caches',
    },
    {
      label: 'OCI upstreams',
      path: '/mirror/upstreams',
      from: '/mirror/repositories',
      outcome: 'upstreams',
    },
  ] as const;

  for (const mirror of MIRROR_PAGES) {
    it(`open-sidebar-mirror-page ${mirror.outcome}: ${mirror.label} below Mirror opens it`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render(mirror.from);
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: mirror.label, exact: true });
      await expect.element(link).toHaveAttribute('href', mirror.path);
      expect(await follow(fixture, link)).toBe(mirror.path);
      expect(reached()).toEqual([`open-sidebar-mirror-page:${mirror.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
      await expect
        .element(navigation.getByRole('link', { name: 'Mirror', exact: true }))
        .toHaveAttribute('aria-current', 'true');
    });
  }

  it('renders no System page outside the System section', async () => {
    await render('/orchestrator');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .not.toHaveAttribute('aria-current');
    for (const label of [
      'Services',
      'Nodes',
      'Configs',
      'Secrets',
      'Targets',
      'Caches',
      'OCI upstreams',
    ]) {
      await expect
        .element(navigation.getByRole('link', { name: label, exact: true, includeHidden: true }))
        .not.toBeInTheDocument();
    }
  });

  it('open-sidebar-idp open: the sidebar’s IdP admin opens the IdP admin section, marked current there', async () => {
    await page.viewport(1280, 800);
    const { fixture } = await render();
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'IdP admin', exact: true });
    await expect.element(entry).toHaveAttribute('href', '/idp');
    await expect.element(entry).not.toHaveAttribute('aria-current');
    expect(await follow(fixture, entry)).toBe('/idp');
    expect(reached()).toEqual(['open-sidebar-idp:open']);
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
    expect(leave).not.toHaveBeenCalled();
  });

  it('lists the IdP admin section’s pages below IdP admin while it is open (qits-2481)', async () => {
    await page.viewport(1280, 800);
    const { layout } = await render('/idp/users');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Projects',
      'System',
      'Mirror',
      'Orchestrator',
      'IdP admin',
      'Clients',
      'Users',
      'Signed-in devices',
      'Network access',
    ]);
    await expect
      .element(navigation.getByRole('link', { name: 'IdP admin', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Users', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(layout).toMatchScreenshot('idp-sidebar', { kind: 'DATA' });
  });

  /** The IdP admin section's pages below IdP admin in the sidebar (qits-2481), each from another. */
  const IDP_PAGES = [
    { label: 'Clients', path: '/idp/clients', from: '/idp/users', outcome: 'clients' },
    { label: 'Users', path: '/idp/users', from: '/idp/clients', outcome: 'users' },
    {
      label: 'Signed-in devices',
      path: '/idp/devices',
      from: '/idp/clients',
      outcome: 'devices',
    },
  ] as const;

  for (const idp of IDP_PAGES) {
    it(`open-sidebar-idp-page ${idp.outcome}: ${idp.label} below IdP admin opens it`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render(idp.from);
      const navigation = page.getByRole('navigation', { name: 'qits' });
      const link = navigation.getByRole('link', { name: idp.label, exact: true });
      await expect.element(link).toHaveAttribute('href', idp.path);
      expect(await follow(fixture, link)).toBe(idp.path);
      expect(reached()).toEqual([`open-sidebar-idp-page:${idp.outcome}`]);
      await expect.element(link).toHaveAttribute('aria-current', 'page');
    });
  }

  it('shows no global sections with a project open', async () => {
    await renderProject('/work/acceptance');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect.element(navigation.getByRole('link', { name: 'Work', exact: true })).toBeVisible();
    await expect
      .element(navigation.getByRole('link', { name: 'IdP admin', includeHidden: true }))
      .not.toBeInTheDocument();
    await expect
      .element(navigation.getByRole('link', { name: 'Artifacts', includeHidden: true }))
      .not.toBeInTheDocument();
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true, includeHidden: true }))
      .not.toBeInTheDocument();
    await expect
      .element(navigation.getByRole('link', { name: 'Mirror', exact: true, includeHidden: true }))
      .not.toBeInTheDocument();
    await expect
      .element(
        navigation.getByRole('link', { name: 'Orchestrator', exact: true, includeHidden: true }),
      )
      .not.toBeInTheDocument();
    for (const label of ['Services', 'Nodes', 'Configs', 'Secrets', 'Targets']) {
      await expect
        .element(navigation.getByRole('link', { name: label, exact: true, includeHidden: true }))
        .not.toBeInTheDocument();
    }
  });

  it('links no Network access with a project open, in the top bar or the sidebar (qits-2485)', async () => {
    await page.viewport(1280, 800);
    await renderProject('/work/acceptance');
    await expect
      .element(page.getByRole('link', { name: 'Network access', includeHidden: true }))
      .not.toBeInTheDocument();
    const labels = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link')
      .elements()
      .map((link) => link.textContent?.trim());
    expect(labels.at(-1)).toBe('Events');
  });

  it('marks Releases › Agents current on a slot’s page, with the slot below it in the trail', async () => {
    const { layout } = await renderProject('/workspaces/3');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Agents', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(navigation.getByRole('link', { name: /^Releases/ }))
      .toHaveAttribute('aria-current', 'true');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Agents' })).toBeVisible();
    await expect.element(breadcrumb).toMatchTextContent('Releases›Agents›ws-3');
    await expect.element(layout).toMatchScreenshot('slot', { kind: 'DATA' });
  });

  it('shows a release request’s trail below Releases › Requests', async () => {
    const { layout } = await renderProject(
      '/releases/requests/contract-frontend-rr-1',
      'a project with pending release requests',
    );
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Requests' })).toBeVisible();
    await expect.element(breadcrumb).toMatchTextContent('Releases›Requests›contract-frontend-rr-1');
    await expect.element(layout).toMatchScreenshot('release-request', { kind: 'DATA' });
  });

  /** A crumb before the current page: where it is shown, its name, where it leads, its outcome. */
  const CRUMBS = [
    { from: '/work/detail/qits-112', name: 'qits', to: () => '/', outcome: 'home' },
    { from: '/work/detail/qits-112', name: 'Projects', to: () => '/projects', outcome: 'projects' },
    {
      from: '/work/detail/qits-112',
      name: 'project',
      to: (slug: string) => `/projects/${slug}`,
      outcome: 'project',
    },
    {
      from: '/work/detail/qits-112',
      name: 'Work',
      to: (slug: string) => `/projects/${slug}/work`,
      outcome: 'work',
    },
    {
      from: '/releases/requests',
      name: 'Releases',
      to: (slug: string) => `/projects/${slug}/releases`,
      outcome: 'releases',
    },
    {
      from: '/releases/requests/contract-frontend-rr-1',
      name: 'Requests',
      to: (slug: string) => `/projects/${slug}/releases/requests`,
      outcome: 'releasesRequests',
    },
    {
      from: '/workspaces/3',
      name: 'Agents',
      to: (slug: string) => `/projects/${slug}/releases/agents`,
      outcome: 'releasesAgents',
    },
    {
      from: '/releases/ci/runs/r-1',
      name: 'CI',
      to: (slug: string) => `/projects/${slug}/releases/ci`,
      outcome: 'releasesCi',
    },
  ] as const;

  for (const crumb of CRUMBS) {
    it(`follow-breadcrumb ${crumb.outcome}: the trail's ${crumb.name} opens its page`, async () => {
      await page.viewport(1280, 800);
      const { fixture, project } = await renderProject(crumb.from);
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      const name = crumb.name === 'project' ? project.name : crumb.name;
      // The brand comes first: the project may share its name.
      const link = breadcrumb.getByRole('link', { name, exact: true }).first();
      // Only the current page is marked current: no crumb before it.
      await expect.element(link).not.toHaveAttribute('aria-current');
      expect(await follow(fixture, link)).toBe(crumb.to(project.slug));
      expect(reached()).toEqual([`follow-breadcrumb:${crumb.outcome}`]);
    });
  }

  /**
   * A global section's crumb, with no project open (qits-2386): a page below it where it is a
   * link, its name, the section's root it leads to, its outcome.
   */
  const GLOBAL_CRUMBS = [
    { from: '/system/swarm/nodes', name: 'System', to: '/system', outcome: 'system' },
    { from: '/mirror/repositories/docker-hub', name: 'Mirror', to: '/mirror', outcome: 'mirror' },
    {
      from: '/orchestrator/processes/gc',
      name: 'Orchestrator',
      to: '/orchestrator',
      outcome: 'orchestrator',
    },
    { from: '/idp/users', name: 'IdP admin', to: '/idp', outcome: 'idp' },
  ] as const;

  for (const crumb of GLOBAL_CRUMBS) {
    it(`follow-breadcrumb ${crumb.outcome}: the trail's ${crumb.name} opens its section`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render(crumb.from);
      const link = page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: crumb.name, exact: true });
      await expect.element(link).not.toHaveAttribute('aria-current');
      expect(await follow(fixture, link)).toBe(crumb.to);
      expect(reached()).toEqual([`follow-breadcrumb:${crumb.outcome}`]);
    });
  }

  /**
   * A global section's page and its trail after the brand (qits-2386): the section, then the page
   * below it, the current page; or the section alone, then itself the current page.
   */
  const GLOBAL_TRAILS = [
    { url: '/system/swarm/services', section: 'System', page: 'Services' },
    { url: '/system/swarm/services/abc', section: 'System', page: 'Services', leaf: 'abc' },
    {
      url: '/system/swarm/nodes/n%201/containers',
      section: 'System',
      page: 'Nodes',
      leaf: 'n 1',
    },
    { url: '/system/swarm/configs/c1', section: 'System', page: 'Configs', leaf: 'c1' },
    { url: '/system/swarm/nodes', section: 'System', page: 'Nodes' },
    { url: '/system/swarm/configs', section: 'System', page: 'Configs' },
    { url: '/system/swarm/secrets', section: 'System', page: 'Secrets' },
    { url: '/system/targets', section: 'System', page: 'Targets' },
    // A terminal is opened from a node: Nodes stays current there, as in the sidebar.
    { url: '/system/terminals/7', section: 'System', page: 'Nodes', leaf: '7' },
    {
      url: '/mirror/repositories/docker-hub',
      section: 'Mirror',
      page: 'Caches',
      leaf: 'docker-hub',
    },
    { url: '/mirror/repositories', section: 'Mirror', page: 'Caches' },
    { url: '/mirror/upstreams', section: 'Mirror', page: 'OCI upstreams' },
    { url: '/orchestrator/processes/gc', section: 'Orchestrator', page: 'Garbage collection' },
    { url: '/orchestrator/processes/scan', section: 'Orchestrator', page: 'Manifest scan' },
    { url: '/orchestrator/processes/sbom-check', section: 'Orchestrator', page: 'SBOM check' },
    { url: '/idp/clients', section: 'IdP admin', page: 'Clients' },
    { url: '/idp/users', section: 'IdP admin', page: 'Users' },
    { url: '/idp/devices', section: 'IdP admin', page: 'Signed-in devices' },
    { url: '/idp', section: 'IdP admin' },
  ] as const;

  for (const global of GLOBAL_TRAILS) {
    it(`names the global section in the trail on ${global.url}`, async () => {
      await page.viewport(1280, 800);
      await render(global.url);
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      const steps = [
        global.section,
        ...('page' in global ? [global.page] : []),
        ...('leaf' in global ? [global.leaf] : []),
      ];
      const current = steps[steps.length - 1];
      await expect.element(breadcrumb).toMatchTextContent(`qits›${steps.join('›')}`);
      await expect.element(breadcrumb).not.toMatchTextContent('Projects');
      await expect
        .element(breadcrumb.getByText(current, { exact: true }).last())
        .toHaveAttribute('aria-current', 'page');
      // Every crumb before the current page is a link (qits-2533: the section's page, too).
      for (const step of steps.slice(0, -1)) {
        await expect
          .element(breadcrumb.getByRole('link', { name: step, exact: true }))
          .toBeVisible();
      }
      if (steps.length === 1) {
        await expect
          .element(breadcrumb.getByRole('link', { name: global.section, exact: true }))
          .not.toBeInTheDocument();
      }
    });
  }

  /**
   * A global section's page's crumb above a page below it (qits-2533): where it is a link, its
   * name, the page it leads to, its outcome.
   */
  const GLOBAL_PAGE_CRUMBS = [
    {
      from: '/system/swarm/services/abc',
      name: 'Services',
      to: '/system/swarm/services',
      outcome: 'systemServices',
    },
    {
      from: '/system/terminals/7',
      name: 'Nodes',
      to: '/system/swarm/nodes',
      outcome: 'systemNodes',
    },
    {
      from: '/system/swarm/configs/c1',
      name: 'Configs',
      to: '/system/swarm/configs',
      outcome: 'systemConfigs',
    },
    {
      from: '/mirror/repositories/docker-hub',
      name: 'Caches',
      to: '/mirror/repositories',
      outcome: 'mirrorCaches',
    },
  ] as const;

  for (const crumb of GLOBAL_PAGE_CRUMBS) {
    it(`follow-breadcrumb ${crumb.outcome}: the trail's ${crumb.name} opens its page`, async () => {
      await page.viewport(1280, 800);
      const { fixture } = await render(crumb.from);
      const link = page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: crumb.name, exact: true });
      expect(await follow(fixture, link)).toBe(crumb.to);
      expect(reached()).toEqual([`follow-breadcrumb:${crumb.outcome}`]);
    });
  }

  it('keeps Projects in the trail on a page outside every global section', async () => {
    await page.viewport(1280, 800);
    await render('/projects');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb).toMatchTextContent('qits›Projects');
    await expect
      .element(breadcrumb.getByText('Projects', { exact: true }).last())
      .toHaveAttribute('aria-current', 'page');
  });

  /** A top-bar menu: its button, its panel's name, its screenshots' stem and its reads on opening. */
  interface Menu {
    readonly button: string | RegExp;
    readonly panel: string;
    readonly shot: string;
    /** The recorded release requests the project opens with: what the release menu lists. */
    readonly requests?: string;
    /** Answers the reads its opening fires, as its own browser spec does. */
    readonly answer: (projectId: string) => Promise<void>;
  }

  /** The "…" of a work item's trail, shown only below 768px; it reads nothing. */
  const PATH: Menu = {
    button: /^Show the full path/,
    panel: 'Full path',
    shot: 'path',
    answer: async () => undefined,
  };

  /** The four menus at the right end: the recorded answers of their own browser specs. */
  const MENUS: readonly Menu[] = [
    {
      button: 'Version bumps',
      panel: 'Pending version bumps',
      shot: 'bumps',
      answer: async () => {
        http
          .expectOne(`/maintenance/api/bumps/pending?limit=${PENDING_BUMPS}`)
          .flush(await goldenMaster('pending bumps', 'listPendingBumps', 'qits-maintenance'));
        // No upstream pools below the bumps (refused): the bumps menu's own spec draws them.
        noPools(http.expectOne(UPSTREAM_POOLS_PATH));
      },
    },
    {
      button: 'Notifications',
      panel: 'Recent domain events',
      shot: 'notifications',
      answer: async () => {
        http
          .expectOne(`/events/api/events?limit=${RECENT_EVENTS}`)
          .flush(await goldenMaster('a few recent events', 'listEvents', 'qits-events'));
      },
    },
    {
      button: 'Agents',
      panel: "The project's agents",
      shot: 'agents',
      // Each opening reads the agents again; the first read (`renderProject`) was refused.
      answer: async (projectId) => {
        http
          .expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`)
          .flush(
            await goldenMaster(
              'a project with agents needing attention',
              'listAgents',
              'qits-workspaces',
            ),
          );
      },
    },
    {
      button: 'Release requests',
      panel: 'Pending release requests',
      shot: 'release',
      requests: 'a project with pending release requests',
      answer: async () => {
        http
          .expectOne('/system/api/targets')
          .flush(
            await goldenMaster('a connected target with leases', 'listTargets', 'qits-system'),
          );
        http
          .expectOne('/ci/api/runs/active')
          .flush(await goldenMaster('a commit with a run in flight', 'listActiveRuns', 'qits-ci'));
      },
    },
  ];

  /** A work item's page with `menu` opened from its button, and its reads answered. */
  async function openMenu(menu: Menu) {
    const rendered = await renderProject('/work/detail/qits-112', menu.requests);
    const { fixture, project } = rendered;
    const button = page.getByRole('button', { name: menu.button, exact: true });
    await userEvent.click(button);
    fixture.detectChanges();
    await settle();
    await menu.answer(project.id);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = page.getByRole('region', { name: menu.panel, exact: true });
    await expect.element(panel).toBeVisible();
    const header = (fixture.nativeElement as HTMLElement).querySelector('header')!;
    return { ...rendered, button: button.element(), panel: panel.element(), header };
  }

  for (const menu of [PATH, ...MENUS]) {
    it(`opens the ${menu.shot} menu as a sheet under the top bar on a phone`, async () => {
      await page.viewport(390, 844);
      const { layout, panel, header } = await openMenu(menu);
      // Full width, right below the bar: `position: fixed` resolves against the window, since
      // nothing above the panel (the sticky bar included) is transformed or filtered.
      const box = panel.getBoundingClientRect();
      expect(box.left).toBe(0);
      expect(box.right).toBe(window.innerWidth);
      expect(box.top).toBe(header.getBoundingClientRect().bottom);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      // No taller than the rest of the window, and scrolling within itself.
      const style = getComputedStyle(panel);
      expect(style.overflowY).toBe('auto');
      expect(style.maxHeight).toBe(`${window.innerHeight - 56}px`);
      await expect.element(layout).toMatchScreenshot(`menu-${menu.shot}-phone`, { kind: 'DATA' });
    });
  }

  for (const menu of MENUS) {
    it(`hangs the ${menu.shot} menu from its button’s right edge on a wide screen`, async () => {
      await page.viewport(1280, 800);
      const { layout, button, panel } = await openMenu(menu);
      const box = panel.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth);
      expect(box.width).toBe(320);
      expect(box.right).toBe(button.getBoundingClientRect().right);
      await expect.element(layout).toMatchScreenshot(`menu-${menu.shot}-desktop`, { kind: 'DATA' });
    });
  }

  it('shows no … on a wide screen', async () => {
    await page.viewport(1280, 800);
    await renderProject('/work/detail/qits-112');
    await expect
      .element(page.getByRole('button', { name: PATH.button, includeHidden: true }))
      .not.toBeVisible();
  });

  it('scrolls a panel taller than a short phone’s window within itself', async () => {
    await page.viewport(390, 300);
    const { panel } = await openMenu(MENUS.find((menu) => menu.shot === 'agents')!);
    expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it('pins the top bar, the page’s actions below it and the board’s headings below those', async () => {
    // 800px wide: the page scrolls in <main>, below the bar, and the window does not scroll.
    const { fixture } = await renderProject('/work/in-progress');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('header')!;
    const main = root.querySelector('main')!;
    const actions = root.querySelector<HTMLElement>('[data-page-actions]')!;
    const headings = root.querySelector<HTMLElement>('[data-board-headings]')!;
    main.scrollTop = 400;
    expect(main.scrollTop).toBe(400);
    expect(header.getBoundingClientRect().top).toBe(0);
    expect(header.getBoundingClientRect().height).toBe(56);
    // At the top of <main>, which starts right below the bar: not the bar's height further down.
    expect(Math.round(main.getBoundingClientRect().top)).toBe(56);
    expect(Math.round(actions.getBoundingClientRect().top)).toBe(56);
    await expect
      .poll(() => Math.round(headings.getBoundingClientRect().top))
      .toBe(Math.round(actions.getBoundingClientRect().bottom));
    // Nothing of the page shows above the bar: the bar is drawn over it.
    const atBar = document.elementFromPoint(400, 28);
    expect(header.contains(atBar)).toBe(true);
    expect(document.scrollingElement!.scrollTop).toBe(0);
    // No screenshot: an element screenshot scrolls the element into view, undoing the scroll.
    // The board's and the page layout's specs shoot the pinned states in a scroller instead.
  });

  /** The shell's scrolling parts on `/work/in-progress` (the tall page). */
  async function renderTall() {
    const { fixture } = await renderProject('/work/in-progress');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      root,
      main: root.querySelector('main')!,
      nav: root.querySelector<HTMLElement>('#layout-nav')!,
      actions: root.querySelector<HTMLElement>('[data-page-actions]')!,
    };
  }

  it('keeps the window still on a wide screen: the sidebar and the page scroll each on their own', async () => {
    // Short enough that the open project's sidebar overflows too.
    await page.viewport(1280, 300);
    try {
      const { main, nav, actions } = await renderTall();
      // The shell is the window's height; nothing is left for the window to scroll.
      expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight);
      expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
      expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight);
      window.scrollTo(0, 400);
      expect(document.scrollingElement!.scrollTop).toBe(0);

      main.scrollTop = 300;
      expect(main.scrollTop).toBe(300);
      expect(nav.scrollTop).toBe(0);
      expect(document.scrollingElement!.scrollTop).toBe(0);
      // The page's actions stay at the top of <main>, right below the bar.
      expect(Math.round(actions.getBoundingClientRect().top)).toBe(
        Math.round(main.getBoundingClientRect().top),
      );

      nav.scrollTop = 100;
      expect(nav.scrollTop).toBeGreaterThan(0);
      expect(main.scrollTop).toBe(300);
      expect(document.scrollingElement!.scrollTop).toBe(0);
    } finally {
      window.scrollTo(0, 0);
    }
  });

  it('scrolls the document on a phone, with the bar and the page’s actions pinned below it', async () => {
    await page.viewport(390, 600);
    try {
      const { root, main, actions } = await renderTall();
      expect(document.scrollingElement!.scrollHeight).toBeGreaterThan(window.innerHeight);
      window.scrollTo(0, 400);
      expect(document.scrollingElement!.scrollTop).toBe(400);
      // <main> does not scroll on its own below 768px: the document does.
      expect(main.scrollTop).toBe(0);
      expect(main.scrollHeight).toBe(main.clientHeight);
      expect(root.querySelector('header')!.getBoundingClientRect().top).toBe(0);
      // Pinned below the bar (`--app-pin-top` is the bar's height here), not behind it.
      expect(Math.round(actions.getBoundingClientRect().top)).toBe(56);
    } finally {
      window.scrollTo(0, 0);
    }
  });
});
