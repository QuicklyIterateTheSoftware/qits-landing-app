import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Board } from '$ui/components/board/board';
import { BoardCard } from '$ui/components/board/board-card';
import { ShellLayout } from './shell.layout';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

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
 * recorded one ("a project exists"), named by the URL; its release requests (the lightning menu)
 * are the recorded "a project with no release requests". The event stream never connects.
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
          { path: 'projects/:slug/work/in-progress', component: TallPage },
          { path: 'projects/:slug/work/detail/:item', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
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
    await expect.element(layout).toHaveTextContent('Page content');
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

  /** The layout at `path` below the recorded project, which is open; its menus answered. */
  async function renderProject(path: string) {
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
      .flush(
        await goldenMaster('a project with no release requests', 'listProjectReleaseRequests'),
      );
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, project, layout: page.elementLocator(fixture.nativeElement) };
  }

  it('lists the open project’s sections and marks the current one', async () => {
    const { project, layout } = await renderProject('/work');
    const navigation = page.getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Work' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(navigation.getByRole('link', { name: 'Editor' })).toBeVisible();
    await expect
      .element(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toHaveTextContent(project.name);
    await expect.element(layout).toMatchScreenshot('project');
  });

  it('keeps Work current on a page of the work section, named in the breadcrumb', async () => {
    const { layout } = await renderProject('/work/acceptance');
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Work' }))
      .toHaveAttribute('aria-current', 'page');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Work' })).toBeVisible();
    await expect.element(breadcrumb).toHaveTextContent('Acceptance');
    await expect.element(layout).toMatchScreenshot('work-tab');
  });

  it('shows the whole breadcrumb trail of a work item on a wide screen', async () => {
    const { project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect.element(breadcrumb.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: project.name })).toBeVisible();
    await expect.element(breadcrumb.getByRole('button', { includeHidden: true })).not.toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-wide');
  });

  it('collapses a work item’s breadcrumbs to the first, … and the last two on a narrow screen', async () => {
    await page.viewport(400, 600);
    const { project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect
      .element(breadcrumb.getByRole('button', { name: `Show the full path: ${project.name}` }))
      .toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect
      .element(
        breadcrumb.getByRole('link', { name: project.name, exact: true, includeHidden: true }),
      )
      .not.toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: 'Work' })).toBeVisible();
    await expect.element(breadcrumb.getByRole('link', { name: 'qits-112' })).toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-narrow');
  });

  it('opens the whole trail from the … on a narrow screen until focus leaves it', async () => {
    await page.viewport(400, 600);
    const { project, layout } = await renderProject('/work/detail/qits-112');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    const name = breadcrumb.getByRole('link', {
      name: project.name,
      exact: true,
      includeHidden: true,
    });
    await userEvent.click(breadcrumb.getByRole('button', { name: /^Show the full path/ }));
    await expect.element(name).toBeVisible();
    await expect.element(layout).toMatchScreenshot('work-item-narrow-expanded');
    await userEvent.click(page.getByText('Page content'));
    await expect.element(name).not.toBeVisible();
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
