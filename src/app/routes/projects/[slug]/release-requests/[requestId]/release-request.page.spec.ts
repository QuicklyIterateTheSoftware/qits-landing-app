import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as ciClient } from '../../../../../api/ci/client.gen';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS, type EventSourceLike } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
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

/** A stand-in for the browser's `EventSource`, so a spec can push frames. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  constructor(readonly url: string) {}
  close(): void {
    this.readyState = 2;
  }
  push(name: string, payload: object): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ name, payload: JSON.stringify(payload) }),
      }),
    );
  }
}

describe('ReleaseRequestPage', () => {
  let http: HttpTestingController;
  let sources: FakeSource[];
  const projects = goldenMaster('a project exists', 'listProjects');
  const project = projects.entries[0].project;
  const recorded = goldenMaster(STATE, 'getProjectReleaseRequest');
  const request = recorded.request;

  beforeEach(() => {
    sources = [];
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
          useValue: (url: string) => {
            const source = new FakeSource(url);
            sources.push(source);
            return source;
          },
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

  describe('staleness (qits-1270)', () => {
    /** The page with its request read, and the live stream it opened. */
    async function shown() {
      const page = await render(request.qualifiedId);
      read(request.qualifiedId).flush(recorded);
      await page.answered();
      // The stream opens once its subscriptions have settled.
      await new Promise((resolve) => setTimeout(resolve, REOPEN_DEBOUNCE_MS + 50));
      const source = sources.filter((s) => s.readyState !== 2).at(-1)!;
      return { ...page, source };
    }

    /** Lets a burst's debounce pass, then the generated client's awaits. */
    async function after(push: () => void) {
      vi.useFakeTimers();
      push();
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
    }

    afterEach(() => vi.useRealTimers());

    it('subscribes to the release request events on the one stream', async () => {
      const { source } = await shown();
      expect(decodeURIComponent(source.url)).toContain('ReleaseRequestStateChanged');
    });

    it('reads the request again after an event that names it', async () => {
      const { source, answered } = await shown();
      await after(() =>
        source.push('ReleaseRequestStateChanged', {
          projectId: project.id,
          releaseRequestId: request.id,
          previousState: 'RELEASED',
          state: 'FINALIZED',
        }),
      );
      read(request.qualifiedId).flush(recorded);
      await answered();
    });

    it('reads nothing after an event about another request of the project', async () => {
      const { source } = await shown();
      await after(() =>
        source.push('ReleaseRequestStateChanged', {
          projectId: project.id,
          releaseRequestId: 'another-request',
          state: 'FINALIZED',
        }),
      );
      expect(
        http.match(`/projects/api/projects/${project.id}/release-requests/${request.qualifiedId}`),
      ).toHaveLength(0);
    });
  });
});
