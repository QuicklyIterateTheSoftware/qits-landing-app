import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import { ProjectWork } from './project-work';
import { ProjectWorkArchive } from './project-work-archive';

/**
 * Screenshots of a project's Work page (board and backlog) and its Archive, answered with
 * qits-projects' golden masters: the project list as recorded, and "a project with refined work"
 * (3 REFINED, 1 REPORTED, 1 DONE) for its work.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('Project work (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/work', component: ProjectWork },
          { path: 'projects/:slug/work/archive', component: ProjectWorkArchive },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page at `section` of the recorded project, with the list and its work answered. */
  async function shown(section: 'work' | 'work/archive', answerWork = true) {
    const list = await commands.goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/${section}`);
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
      work.flush(await commands.goldenMaster('a project with refined work', 'listProjectEntities'));
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    return { element: page.elementLocator(element), work };
  }

  it('shows the board and the backlog', async () => {
    const { element } = await shown('work');
    await expect.element(element.getByRole('heading', { name: 'Board' })).toBeVisible();
    await expect.element(element).toHaveTextContent('Second refined ticket');
    await expect.element(element).toHaveTextContent('Reported ticket');
    await expect.element(element).not.toHaveTextContent('Done ticket');
    await expect.element(element).toMatchScreenshot('work');
  });

  it('shows the archive: the work in a final state', async () => {
    const { element } = await shown('work/archive');
    await expect.element(element).toHaveTextContent('Done ticket');
    await expect.element(element).not.toHaveTextContent('Reported ticket');
    await expect.element(element).toMatchScreenshot('archive');
  });

  it('shows that the work is loading', async () => {
    const { element, work } = await shown('work', false);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('work-loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });
});
