import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { WorkArchivePage } from './work-archive.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's Archive, answered with qits-projects' golden masters: the project list
 * as recorded, and "a project with work in every status" (one epic and one ticket per status, DONE
 * and DROPPED included) or "a project with no work" for its work.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkArchivePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/archive', component: WorkArchivePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The Archive of the recorded project, with the list answered and its work requested. */
  async function shown() {
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/archive`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    // SelectedWork's effect asks for the work once the project is known; let it run.
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const work = http.expectOne(`/projects/api/projects/${project.id}/work`);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '760px';
    const answered = async () => {
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    return { element: page.elementLocator(element), work, answered };
  }

  it('shows the work in a final state', async () => {
    const { element, work, answered } = await shown();
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await answered();
    await expect.element(element.getByRole('heading', { level: 1 })).toMatchTextContent('Archive');
    await expect.element(element).toMatchTextContent('Done ticket');
    await expect.element(element).toMatchTextContent('Dropped epic');
    await expect.element(element).not.toMatchTextContent('Reported ticket');
    await expect.element(element).toMatchScreenshot('archive');
  });

  it('says so when nothing is archived', async () => {
    const { element, work, answered } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await answered();
    await expect.element(element).toMatchTextContent('Nothing here');
    await expect.element(element).toMatchScreenshot('empty');
  });

  it('shows that the work is loading', async () => {
    const { element, work } = await shown();
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });

  it('marks the work as failed to load', async () => {
    const { element, work, answered } = await shown();
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('error');
  });
});
