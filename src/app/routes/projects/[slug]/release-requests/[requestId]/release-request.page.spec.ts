import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as ciClient } from '../../../../../api/ci/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { ReleaseRequestPage } from './release-request.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The "not found" note: always rendered, hidden by class while the list names the request. */
const notFound = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('p')).find((p) =>
    p.textContent?.includes('has no open or recently finalized'),
  );

/** Every detail state records its request in this list. */
const EVERY_STATE = 'a project with release requests in every state';

/** The recorded request this spec opens. */
const STATE = 'a release request awaiting approval';

describe('ReleaseRequestPage', () => {
  let http: HttpTestingController;
  const projects = goldenMaster('a project exists', 'listProjects');
  const project = projects.entries[0].project;
  const listed = goldenMaster(EVERY_STATE, 'listProjectReleaseRequests');
  const recorded = goldenMaster(STATE, 'getReleaseRequest');
  const entry: ReleaseRequestEntry = listed.requests.find(
    (r: ReleaseRequestEntry) => r.id === recorded.request.id,
  );

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/release-requests/:requestId', component: ReleaseRequestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(ciClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    // The reads after the request (commits, builds, artifacts, runs, reports): answer each with
    // an error until none is left.
    for (let round = 0; round < 5; round++) {
      for (const call of http.match(() => true)) {
        call.flush(null, { status: 500, statusText: 'Server Error' });
      }
      await settle();
    }
    http.verify();
  });

  /** The page at `/projects/<slug>/release-requests/<id>`, with the project's lists answered. */
  async function render(id: string) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/release-requests/${encodeURIComponent(id)}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(projects);
    await navigated;
    const answered = async () => {
      await settle();
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
      await settle();
    };
    await answered();
    http.expectOne(`/projects/api/projects/${project.id}/release-requests`).flush(listed);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await answered();
    return { element: harness.routeNativeElement as HTMLElement, answered };
  }

  /** Answers the read of the request, which the page addresses by its uuid. */
  async function answerRequest(answered: () => Promise<void>) {
    http
      .expectOne(`/projects/api/repositories/${entry.repoId}/release-requests/${entry.id}`)
      .flush(recorded);
    await answered();
  }

  it('finds a request by its logical id and names it so', async () => {
    expect(entry.qualifiedId).toMatch(/-rr-\d+$/);
    const { element, answered } = await render(entry.qualifiedId!);
    await answerRequest(answered);
    expect(element.textContent).toContain(entry.qualifiedId);
    expect(notFound(element)?.classList.contains('hidden')).toBe(true);
  });

  it('finds a request by its uuid and names it by its logical id', async () => {
    const { element, answered } = await render(entry.id!);
    await answerRequest(answered);
    expect(element.textContent).toContain(entry.qualifiedId);
  });

  it('says so when the project lists no such request', async () => {
    const { element } = await render('no-such-request');
    expect(notFound(element)?.classList.contains('hidden')).toBe(false);
  });
});
