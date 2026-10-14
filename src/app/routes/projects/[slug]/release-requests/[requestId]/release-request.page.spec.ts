import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as ciClient } from '../../../../../api/ci/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { goldenMaster } from '../../../../../../testing/golden-masters';
import { ReleaseRequestPage } from './release-request.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The "not found" note: always rendered, hidden by class unless the project has no such one. */
const notFound = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('p')).find((p) =>
    p.textContent?.includes('has no release request'),
  );

/** The failure note with its Retry: always rendered, hidden by class unless the read failed. */
const failure = (element: HTMLElement) => element.querySelector('ui-load-failure') as HTMLElement;

/** The state whose recorded project answers the read of one of its requests. */
const STATE = 'a project with release requests in every state';

describe('ReleaseRequestPage', () => {
  let http: HttpTestingController;
  const projects = goldenMaster('a project exists', 'listProjects');
  const project = projects.entries[0].project;
  const recorded = goldenMaster(STATE, 'getProjectReleaseRequest');
  const request = recorded.request;

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

  /** The page at `/projects/<slug>/release-requests/<ref>`, its project's repositories answered. */
  async function render(ref: string) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/release-requests/${encodeURIComponent(ref)}`,
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
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await answered();
    return { element: harness.routeNativeElement as HTMLElement, answered };
  }

  /** The read of the one request, through its project, by the reference the URL names. */
  const read = (ref: string) =>
    http.expectOne(`/projects/api/projects/${project.id}/release-requests/${ref}`);

  it('reads a request by its logical id, alone, and names it so', async () => {
    expect(request.qualifiedId).toMatch(/-rr-\d+$/);
    const { element, answered } = await render(request.qualifiedId);
    read(request.qualifiedId).flush(recorded);
    await answered();
    expect(element.textContent).toContain(request.qualifiedId);
    expect(element.textContent).toContain(request.summary);
    expect(notFound(element)?.classList.contains('hidden')).toBe(true);
    expect(failure(element).classList.contains('hidden')).toBe(true);
    // The project's whole list is never read: the request's own answer names its repository.
    expect(http.match(`/projects/api/projects/${project.id}/release-requests`)).toHaveLength(0);
    // ...and the reads after it are addressed by that repository and the request's uuid.
    http.expectOne(
      `/projects/api/repositories/${request.repoId}/release-requests/${request.id}/commits`,
    );
  });

  it('reads a request by its uuid and names it by its logical id', async () => {
    const { element, answered } = await render(request.id);
    read(request.id).flush(recorded);
    await answered();
    expect(element.textContent).toContain(request.qualifiedId);
  });

  it('says so when the project has no such request, without claiming it is not open', async () => {
    const { element, answered } = await render('no-such-request');
    read('no-such-request').flush(null, { status: 404, statusText: 'Not Found' });
    await answered();
    const note = notFound(element)!;
    expect(note.classList.contains('hidden')).toBe(false);
    expect(note.textContent).toContain('no-such-request');
    expect(element.textContent).not.toContain('open or recently finalized');
    expect(failure(element).classList.contains('hidden')).toBe(true);
    expect(element.querySelector('ui-spinner')?.classList.contains('hidden')).toBe(true);
  });

  it('says the request could not be read, and reads it again on Retry', async () => {
    const { element, answered } = await render(request.qualifiedId);
    read(request.qualifiedId).flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    expect(failure(element).classList.contains('hidden')).toBe(false);
    expect(failure(element).textContent).toContain('This release request could not be read.');
    expect(notFound(element)?.classList.contains('hidden')).toBe(true);
    failure(element).querySelector('button')!.click();
    await answered();
    read(request.qualifiedId).flush(recorded);
    await answered();
    expect(failure(element).classList.contains('hidden')).toBe(true);
    expect(element.textContent).toContain(request.summary);
  });
});
