import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ReleaseRequestsPage } from './release-requests.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of the Release Requests page, answered with qits-projects' recordings: "a project
 * with pending release requests" (one request in each of PENDING, RELEASED, READY, REJECTED,
 * CONFLICTED and FINALIZED) and "a project with no release requests". The open project is the
 * recorded one ("a project exists"), found by the URL's slug in the recorded project list.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseRequestsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/release-requests', component: ReleaseRequestsPage },
        ]),
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

  async function render() {
    // Tall enough for every row: a screenshot shows only what is in the viewport.
    await page.viewport(900, 1000);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/release-requests`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return {
      fixture: harness.fixture,
      element,
      request: http.expectOne(`/projects/api/projects/${project.id}/release-requests`),
    };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists every request with its state, gates and facts', async () => {
    const { fixture, element, request } = await render();
    request.flush(
      await goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    const view = page.elementLocator(element);
    expect(view.getByRole('listitem').elements()).toHaveLength(6);
    await expect.element(view).toHaveTextContent('Finalized release');
    await expect.element(view).toHaveTextContent('The sources cannot be folded.');
    await expect.element(view).toMatchScreenshot('requests');
  });

  it('says so when the project has none', async () => {
    const { fixture, element, request } = await render();
    request.flush(
      await goldenMaster('a project with no release requests', 'listProjectReleaseRequests'),
    );
    await answered(fixture);
    const view = page.elementLocator(element);
    await expect.element(view).toHaveTextContent('Nothing is open in this project');
    await expect.element(view).toMatchScreenshot('empty');
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { fixture, element, request } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
