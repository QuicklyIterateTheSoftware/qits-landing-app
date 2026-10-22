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

  describe('approval requirements (epic qits-1038)', () => {
    /** The recorded request awaiting a person's approval, with `approvalRequirements` as given. */
    const awaiting = (approvalRequirements?: readonly object[]) => {
      const body = goldenMaster('a release request awaiting approval', 'getReleaseRequest');
      if (approvalRequirements) body.request.approvalRequirements = approvalRequirements;
      return { request: { ...body.request, qualifiedId: request.qualifiedId } };
    };

    const MANUAL_REVIEW = {
      id: 'manual-review',
      reason: 'The repository asks a person to review every release',
      admits: ['person'],
      excludesAuthors: false,
      detail: null,
      satisfied: false,
      satisfiedBy: null,
    };

    const SCREENSHOTS = {
      id: 'automation:screenshot-baselines',
      reason: 'Screenshot baselines changed',
      admits: ['agent', 'person'],
      excludesAuthors: false,
      detail: 'src/app/__screenshots__/home.png',
      satisfied: true,
      satisfiedBy: { approver: 'agent-7', roles: ['agent'], at: '2026-01-01T00:00:00Z' },
    };

    const CONTRACT = {
      id: 'contract:shop',
      reason: 'The published contract changed',
      admits: ['person', 'agent@shop'],
      excludesAuthors: true,
      satisfied: false,
    };

    const buttons = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('app-release-approval button')).map((b) =>
        b.textContent?.trim(),
      );

    /** The page with `body` read, and the eligibility read it made (if any). */
    async function shownWith(body: object) {
      const page = await render(request.qualifiedId);
      read(request.qualifiedId).flush(body);
      await page.answered();
      const { repoId, id } = (body as { request: { repoId: string; id: string } }).request;
      const eligibility = () =>
        http.match(
          `/projects/api/repositories/${repoId}/release-requests/${id}/approval-eligibility`,
        );
      return { ...page, eligibility };
    }

    it('draws one line per requirement: reason, roles, detail, satisfied by or open', async () => {
      const { element, eligibility, answered } = await shownWith(
        awaiting([MANUAL_REVIEW, SCREENSHOTS, CONTRACT]),
      );
      eligibility()[0].flush({
        eligibility: { viewer: 'dana', heldRoles: ['person'], eligibleRequirementIds: [] },
      });
      await answered();
      const lines = Array.from(element.querySelectorAll('[data-requirement]'));
      expect(lines.map((line) => line.getAttribute('data-requirement'))).toEqual([
        'manual-review',
        'automation:screenshot-baselines',
        'contract:shop',
      ]);
      const [manual, screenshots, contract] = lines.map((line) => line.textContent ?? '');
      expect(manual).toContain('The repository asks a person to review every release');
      expect(manual).toContain('May be approved by a person');
      expect(manual).toContain('Open');
      expect(manual).not.toContain('authors');
      expect(screenshots).toContain('an agent of this project or a person');
      expect(screenshots).toContain('src/app/__screenshots__/home.png');
      expect(screenshots).toContain('Satisfied by agent-7');
      expect(screenshots).toContain('(agent)');
      expect(contract).toContain('a person or an agent of shop');
      expect(contract).toContain('not the request’s authors');
    });

    it('offers Approve and Decline when the viewer may satisfy an open requirement', async () => {
      const { element, eligibility, answered } = await shownWith(awaiting([MANUAL_REVIEW]));
      eligibility()[0].flush({ eligibility: { eligibleRequirementIds: ['manual-review'] } });
      await answered();
      expect(buttons(element)).toEqual(['Approve release', 'Decline release']);
    });

    it('offers Decline alone when every requirement the viewer may satisfy is satisfied', async () => {
      const { element, eligibility, answered } = await shownWith(
        awaiting([MANUAL_REVIEW, SCREENSHOTS]),
      );
      eligibility()[0].flush({
        eligibility: { eligibleRequirementIds: ['automation:screenshot-baselines'] },
      });
      await answered();
      expect(buttons(element)).toEqual(['Decline release']);
    });

    it('offers neither, and says why, when the viewer may satisfy none', async () => {
      const { element, eligibility, answered } = await shownWith(awaiting([CONTRACT]));
      eligibility()[0].flush({
        eligibility: { viewer: 'agent-1', heldRoles: ['agent'], eligibleRequirementIds: [] },
      });
      await answered();
      expect(buttons(element)).toEqual([]);
      expect(element.querySelector('app-release-approval')?.textContent).toContain(
        'You hold none of the roles',
      );
    });

    it('offers both, as before, when the eligibility read fails (an older service)', async () => {
      const { element, eligibility, answered } = await shownWith(awaiting([MANUAL_REVIEW]));
      eligibility()[0].flush(null, { status: 404, statusText: 'Not Found' });
      await answered();
      expect(buttons(element)).toEqual(['Approve release', 'Decline release']);
    });

    it('reads the ids under `eligibility`, never at the top of the answer', async () => {
      // The door wraps its answer: a flat body names no eligibility, so it is drawn as before
      // rather than as "you hold none of the roles".
      const { element, eligibility, answered } = await shownWith(awaiting([MANUAL_REVIEW]));
      eligibility()[0].flush({ eligibleRequirementIds: [] });
      await answered();
      expect(buttons(element)).toEqual(['Approve release', 'Decline release']);
      expect(element.querySelector('app-release-approval')?.textContent).not.toContain(
        'You hold none of the roles',
      );
    });

    it('draws the approval as before, reading no eligibility, without requirements', async () => {
      // Built with an explicit empty list rather than the bare recording: the recording itself
      // carries `approvalRequirements` from qits-projects 2026.1022.75745 on, so relying on it
      // lacking the field would make this test track the pin rather than the "no requirements"
      // case it means to cover.
      const { element, eligibility } = await shownWith(awaiting([]));
      expect(eligibility()).toHaveLength(0);
      expect(element.querySelector('[data-requirement]')).toBeNull();
      expect(buttons(element)).toEqual(['Approve release', 'Decline release']);
    });
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
