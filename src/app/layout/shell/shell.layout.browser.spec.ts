import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { client as eventsClient } from '../../api/events/client.gen';
import { client as systemClient } from '../../api/system/client.gen';
import { client as ciClient } from '../../api/ci/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { RECENT_EVENTS } from '$core/events/events.consumes';
import { PENDING_BUMPS } from '$core/maintenance/maintenance.consumes';
import { UPSTREAM_POOLS_URL } from '$patterns/maintenance/bumps-menu/bumps-menu';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Board } from '$ui/components/board/board';
import { BoardCard } from '$ui/components/board/board-card';
import { ShellLayout } from './shell.layout';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { upstreamPoolsGoldenMaster } from '../../../testing/browser/upstream-pools';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** No upstream pools below the bumps: the bumps menu's own spec draws them. */
const NO_POOLS = upstreamPoolsGoldenMaster([]);

/** A page with fixed text, so the screenshots show the layout and nothing that loads. */
@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

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
    { label: 'Left', body: 'bg-ocean-deep-300', header: 'bg-ocean-deep-400 text-ocean-deep-950' },
    { label: 'Right', body: 'bg-mint-leaf-300', header: 'bg-mint-leaf-400 text-mint-leaf-950' },
  ];
  readonly cards = Array.from({ length: 12 }, (_, i) => i + 1);
}

/**
 * Screenshots of the layout in a real browser: the wide sidebar, and the narrow burger closed and
 * open, with no project open; and the sidebar of an open project. The open project is qits-projects'
 * recorded one ("a project exists"), named by the URL; its release requests (the lightning menu and
 * the sidebar's Release Requests entry) are the recorded "a project with no release requests", or
 * "a project with pending release requests" where a case says so. The event stream never connects.
 * Each top-bar menu is also opened on a phone and on a wide screen, its reads answered with the
 * golden masters its own browser spec uses, to show where its panel lies.
 */
describe('ShellLayout (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: TestPage },
          { path: 'projects/:slug/work', component: TestPage },
          { path: 'projects/:slug/work/acceptance', component: TestPage },
          { path: 'projects/:slug/work/refinement', component: TestPage },
          { path: 'projects/:slug/work/in-progress', component: TallPage },
          { path: 'projects/:slug/work/detail/:item', component: TestPage },
          { path: 'projects/:slug/release-requests', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(maintenanceClient),
        provideHeyApiClient(eventsClient),
        provideHeyApiClient(systemClient),
        provideHeyApiClient(ciClient),
        provideTestPlatformOrigins(),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The layout at the root, with no project open; the project list (the store's) answered. */
  async function render() {
    const fixture = TestBed.createComponent(ShellLayout);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    await settle();
    http
      .expectOne('/projects/api/projects')
      .flush(await goldenMaster('a project exists', 'listProjects'));
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, layout: page.elementLocator(fixture.nativeElement) };
  }

  it('shows the sidebar beside the page on a wide screen', async () => {
    const { layout } = await render();
    await expect.element(layout).toMatchTextContent('Page content');
    await expect.element(layout).toMatchScreenshot('wide');
  });

  it('hides the sidebar behind the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { layout } = await render();
    await expect.element(layout).toMatchScreenshot('narrow');
  });

  it('opens the sidebar from the burger on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { fixture, layout } = await render();
    await userEvent.click(page.getByRole('button', { name: 'Navigation' }));
    fixture.detectChanges();
    await expect.element(page.getByRole('navigation', { name: 'qits' })).toBeVisible();
    // At the root the navigation is empty: the "qits" brand leads home.
    expect(
      page.getByRole('navigation', { name: 'qits' }).getByRole('link').elements(),
    ).toHaveLength(0);
    await expect.element(layout).toMatchScreenshot('narrow-open');
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
    http
      .expectOne(`/projects/api/projects/${project.id}/release-requests`)
      .flush(await goldenMaster(requests, 'listProjectReleaseRequests'));
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
    await expect.element(navigation.getByRole('link', { name: 'Repositories' })).toBeVisible();
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(project.name);
    await expect.element(layout).toMatchScreenshot('project');
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
    await expect.element(layout).toMatchScreenshot('work-tab');
  });

  it('lists Refinement first below Work, no Campaigns or Milestones, and marks it when open', async () => {
    await renderProject('/work/refinement');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    const refinement = navigation.getByRole('link', { name: 'Refinement' });
    await expect.element(refinement).toBeVisible();
    await expect.element(refinement).toHaveAttribute('aria-current', 'page');
    // First of the work section's pages, right below Work (epic qits-1899: no Campaigns).
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((a) => a.textContent?.trim());
    expect(labels.slice(labels.indexOf('Work'), labels.indexOf('Work') + 3)).toEqual([
      'Work',
      'Refinement',
      'Schedule',
    ]);
    expect(labels).not.toContain('Campaigns');
    expect(labels).not.toContain('Milestones');
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent('Refinement');
  });

  it('shows the newest release request below Release Requests, between Work and Repositories', async () => {
    const { project, layout } = await renderProject(
      '/release-requests',
      'a project with pending release requests',
    );
    const navigation = page.getByRole('navigation', { name: 'qits' });
    const entry = navigation.getByRole('link', { name: /^Release Requests/ });
    await expect.element(entry).toHaveAttribute('aria-current', 'page');
    // Recorded: every request changed at the same instant, so the first listed is the newest.
    await expect.element(entry).toMatchTextContent('contract-service');
    await expect.element(entry).toMatchTextContent('pending');
    const labels = navigation
      .getByRole('link')
      .elements()
      .map((a) => a.firstChild?.textContent?.trim());
    expect(labels).toEqual([
      'Work',
      'Ideas',
      'Agents',
      'Release Requests',
      'Desk',
      'Repositories',
      'Observability',
      'Events',
    ]);
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toMatchTextContent(`${project.name}›Release Requests`);
    await expect.element(layout).toMatchScreenshot('release-requests');
  });

  it('shows no line below Release Requests for a project without any', async () => {
    await renderProject('/work');
    const entry = page
      .getByRole('navigation', { name: 'qits' })
      .getByRole('link', { name: 'Release Requests' });
    await expect.element(entry).toMatchTextContent(/^Release Requests$/);
  });

  it('shows the whole breadcrumb trail of a work item on a wide screen', async () => {
    const { project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: project.name })).toBeVisible();
    await expect.element(breadcrumb.getByRole('button', { includeHidden: true })).not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-wide');
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
    const visible = [...trail.querySelectorAll<HTMLElement>('a')].filter(
      (link) => link.getBoundingClientRect().width > 0,
    );
    expect(visible.map((link) => link.textContent?.trim())).toEqual(['Work', 'qits-112']);
    await expect
      .element(page.getByRole('region', { name: 'Full path', includeHidden: true }))
      .not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-narrow');
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
    await expect.element(layout).toMatchScreenshot('work-item-narrow-expanded');

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
        http.expectOne(UPSTREAM_POOLS_URL).flush(NO_POOLS);
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
      await expect.element(layout).toMatchScreenshot(`menu-${menu.shot}-phone`);
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
      await expect.element(layout).toMatchScreenshot(`menu-${menu.shot}-desktop`);
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
    const { fixture } = await renderProject('/work/in-progress');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('header')!;
    const actions = root.querySelector<HTMLElement>('[data-page-actions]')!;
    const headings = root.querySelector<HTMLElement>('[data-board-headings]')!;
    try {
      window.scrollTo(0, 400);
      expect(header.getBoundingClientRect().top).toBe(0);
      expect(header.getBoundingClientRect().height).toBe(56);
      expect(Math.round(actions.getBoundingClientRect().top)).toBe(56);
      await expect
        .poll(() => Math.round(headings.getBoundingClientRect().top))
        .toBe(Math.round(actions.getBoundingClientRect().bottom));
      // Nothing of the page shows above the bar: the bar is drawn over it.
      const atBar = document.elementFromPoint(400, 28);
      expect(header.contains(atBar)).toBe(true);
      // No screenshot: an element screenshot scrolls the element into view, undoing the scroll.
      // The board's and the page layout's specs shoot the pinned states in a scroller instead.
    } finally {
      window.scrollTo(0, 0);
    }
  });
});
