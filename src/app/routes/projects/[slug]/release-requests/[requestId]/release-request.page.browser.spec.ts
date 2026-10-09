import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as ciClient } from '../../../../../api/ci/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { ReleaseRequestPage } from './release-request.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of one release request's page. The open project is the recorded one ("a project
 * exists"); the request is found in the recorded list "a project with pending release requests".
 *
 * TODO(qits-112): the loaded page (pending, awaiting approval, released, conflicted, obsolete)
 * waits for qits-projects-service's provider states for one release request (branch
 * `external/rr-detail-states`); see the skipped cases below.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseRequestPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/release-requests/:requestId',
            component: ReleaseRequestPage,
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(ciClient),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
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

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    await settle();
  }

  /** The page for `requestId` (default: the first recorded request), with the lists answered. */
  async function render(requestId?: string) {
    await page.viewport(900, 700);
    const projects = await goldenMaster('a project exists', 'listProjects');
    const project = projects.entries[0].project;
    const listed = await goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    );
    const id = requestId ?? listed.requests[0].id;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/release-requests/${encodeURIComponent(id)}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(projects);
    await navigated;
    await answered(harness.fixture);
    http.expectOne(`/projects/api/projects/${project.id}/release-requests`).flush(listed);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await answered(harness.fixture);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    const repoId = listed.requests.find((r: { id: string }) => r.id === id)?.repoId;
    return { fixture: harness.fixture, element, repoId, id };
  }

  it('marks the request as loading, then as failed to load', async () => {
    const { fixture, element, repoId, id } = await render();
    const request = http.expectOne(
      `/projects/api/repositories/${repoId}/release-requests/${encodeURIComponent(id)}`,
    );
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    // TODO(qits-112): qits-ci has no golden masters yet, so the runs read is answered with an error.
    http
      .expectOne((r) => r.url.startsWith('/ci/api/runs'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });

  it('says so when the project lists no such request', async () => {
    const { element } = await render('no-such-request');
    const view = page.elementLocator(element);
    await expect.element(view).toHaveTextContent('has no open or recently finalized release');
    await expect.element(view).toMatchScreenshot('not-found');
  });

  // TODO(qits-112): waits for the provider state "a pending release request" (getReleaseRequest,
  // the commits and the CI verdicts of its fold).
  it.skip('shows a pending request: head, sources, facts, pipeline and the commits', () => {});

  // TODO(qits-112): waits for "a release request awaiting approval".
  it.skip('offers Approve and Decline while a person must approve', () => {});

  // TODO(qits-112): waits for "a released release request" (and its artifacts).
  it.skip('shows a released request with its version and what it published', () => {});

  // TODO(qits-112): waits for "a conflicted release request".
  it.skip('shows the paths a conflicted request could not fold', () => {});
});
