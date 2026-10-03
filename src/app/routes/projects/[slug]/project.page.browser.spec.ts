import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { ProjectPage } from './project.page';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's page, which names the project: answered with qits-projects' recorded
 * project list ("a project exists"), failed, and for a slug that list does not hold.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug', component: ProjectPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page for `slug` (the recorded project's by default), with the project list requested. */
  async function render(slug?: string) {
    const recorded = await goldenMaster('a project exists', 'listProjects');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${slug ?? recorded.entries[0].project.slug}`,
    );
    await settle();
    const list = http.expectOne('/projects/api/projects');
    const answer = async (
      body: object | null,
      options?: { status: number; statusText: string },
    ) => {
      list.flush(body, options);
      await navigated;
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    return { harness, navigated, recorded, list, answer };
  }

  /** The routed page. */
  function view(harness: RouterTestingHarness) {
    return page.elementLocator(harness.routeNativeElement as HTMLElement);
  }

  it('names the project', async () => {
    const { harness, recorded, answer } = await render();
    await answer(recorded);
    const element = view(harness);
    await expect.element(element.getByRole('heading', { name: 'Contract project' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('loaded');
  });

  it('shows that the project is loading', async () => {
    const { harness, navigated, list } = await render();
    // The page is routed before the list answers; the list stays open for the screenshot.
    await navigated;
    harness.fixture.detectChanges();
    const element = view(harness);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('loading');
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
  });

  it('marks the page as failed to load when the projects could not be loaded', async () => {
    const { harness, answer } = await render();
    await answer(null, { status: 500, statusText: 'Server Error' });
    const element = view(harness);
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('error');
  });

  it('marks the page as failed to load when no project has the slug', async () => {
    // qits-projects' recorded list; the URL names a slug that is not in it.
    const { harness, recorded, answer } = await render('unknown');
    await answer(recorded);
    const element = view(harness);
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(element).toMatchScreenshot('unknown');
  });
});
