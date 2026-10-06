import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { WorkInProgressPage } from './work-in-progress.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's In Progress page (the board), answered with qits-projects' golden
 * masters: the project list as recorded, and "a project with work in every status" (one epic and
 * one ticket per status, DROPPED included) or "an epic with features and tasks" for its work.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkInProgressPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // Tall enough for the whole board: a screenshot shows only the viewport.
    await page.viewport(800, 1600);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/in-progress', component: WorkInProgressPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with the list and its work answered. */
  async function shown(answerWork = true, workState = 'a project with work in every status') {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/in-progress`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const work = http.expectOne(`/projects/api/projects/${project.id}/entities`);
    if (answerWork) {
      work.flush(await goldenMaster(workState, 'listProjectEntities'));
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    return { element: page.elementLocator(element), work, project };
  }

  it('shows the work being worked on, and nothing before or after it', async () => {
    const { element, project } = await shown();
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toHaveTextContent('In Progress');
    await expect.element(element).toHaveTextContent('Ready for dev ticket');
    await expect.element(element).toHaveTextContent('Implementing epic');
    await expect.element(element).toHaveTextContent('Implemented epic');
    await expect.element(element).toHaveTextContent('Verifying ticket');
    await expect.element(element).not.toHaveTextContent('Reported ticket');
    // Refined work waits on the Schedule tab.
    await expect.element(element).not.toHaveTextContent('Refined ticket');
    await expect.element(element).not.toHaveTextContent('Verified ticket');
    await expect.element(element).not.toHaveTextContent('Done ticket');
    // Every card leads to its item's page, below work/detail. The Workspace links are hidden: this
    // page alone loads no open workspaces (the layout does).
    const hrefs = [...element.element().querySelectorAll('a[href]')]
      .filter((a) => !a.closest('app-workspace-link'))
      .map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(`/projects/${project.slug}/work/detail/`);
    await expect.element(element).toMatchScreenshot('board');
  });

  it('nests an epic’s features and tasks in its lane', async () => {
    const { element } = await shown(true, 'an epic with features and tasks');
    await expect.element(element).toHaveTextContent('Nested epic');
    await expect.element(element).toHaveTextContent('Shipped feature');
    await expect.element(element).toHaveTextContent('Open task');
    await expect.element(element).toMatchScreenshot('nested');
  });

  it('shows that the work is loading', async () => {
    const { element, work } = await shown(false);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
