import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ProjectWorkPage } from './project-work.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's Work page (Acceptance, the board and the backlog), answered with
 * qits-projects' golden masters: the project list as recorded, and "a project with work in every
 * status" (one epic and one ticket per status, DROPPED included) for its work.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('Project work (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // Tall enough for Acceptance, the board and the backlog: a screenshot shows only the viewport.
    await page.viewport(800, 2400);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work', component: ProjectWorkPage }]),
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

  /** The Work page of the recorded project, with the list and its work answered. */
  async function shown(answerWork = true, workState = 'a project with work in every status') {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work`);
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
    return { element: page.elementLocator(element), work };
  }

  it('shows Acceptance above the board, and the backlog below it', async () => {
    const { element } = await shown();
    const headings = element.getByRole('heading', { level: 2 });
    await expect.element(headings.first()).toHaveTextContent('Acceptance');
    expect(headings.elements().map((h) => h.textContent?.trim())).toEqual([
      'Acceptance',
      'Board',
      'Backlog',
    ]);
    const acceptance = element.getByRole('region', { name: 'Acceptance' });
    await expect.element(acceptance).toHaveTextContent('Verified epic');
    await expect.element(acceptance).toHaveTextContent('Verified ticket');
    await expect.element(acceptance).not.toHaveTextContent('Verifying ticket');
    const board = element.getByRole('region', { name: 'Board' });
    await expect.element(board).toHaveTextContent('Refined ticket');
    await expect.element(board).toHaveTextContent('Implementing epic');
    await expect.element(board).toHaveTextContent('Implemented epic');
    await expect.element(board).toHaveTextContent('Verifying ticket');
    await expect.element(board).not.toHaveTextContent('Verified ticket');
    await expect.element(element).toHaveTextContent('Reported ticket');
    await expect.element(element).not.toHaveTextContent('Done ticket');
    await expect.element(element).toMatchScreenshot('work');
  });

  it('nests an epic’s features and tasks in its lane', async () => {
    const { element } = await shown(true, 'an epic with features and tasks');
    await expect.element(element).toHaveTextContent('Nested epic');
    await expect.element(element).toHaveTextContent('Shipped feature');
    await expect.element(element).toHaveTextContent('Open task');
    // Nothing verified: Acceptance says so, as the Backlog does.
    await expect
      .element(element.getByRole('region', { name: 'Acceptance' }))
      .toHaveTextContent('Nothing here');
    await expect.element(element).toMatchScreenshot('work-nested');
  });

  it('shows that the work is loading', async () => {
    const { element, work } = await shown(false);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('work-loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
