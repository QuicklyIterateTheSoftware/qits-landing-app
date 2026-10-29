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
import { ciGoldenMaster, goldenMaster } from '../../../../../../testing/golden-masters';
import { PlatformOrigins } from '$core/platform/platform-origins';
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

/** The texts of what the head names the request by: one per item (or source branch). */
const heading = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('h1 [data-item]')).map((item) =>
    item.textContent?.replace(/\s+/g, ' ').trim(),
  );

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
    // The recording (qits-projects before qits-1673) has no items: the head names the sources.
    expect(heading(element)).toEqual(
      request.sources.map((source: { name: string }) => source.name),
    );
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
    expect(heading(element)).toEqual(
      request.sources.map((source: { name: string }) => source.name),
    );
  });

  describe('what a request carries and who asked (qits-1673)', () => {
    /** The facts' "asked by" line. */
    const askedBy = (element: HTMLElement) =>
      element.querySelector('[data-participants]')?.textContent?.replace(/\s+/g, ' ').trim();

    it('names each item, its work item linked, and everyone who asked', async () => {
      // Derived from the recording: the items and participants qits-projects answers from
      // 2026.1028.230057 on, one item naming a work item and one a plain branch.
      const carrying = {
        request: {
          ...request,
          participants: ['agent@qits', 'dev'],
          items: [
            {
              source: 'ticket/qits-1673',
              label: 'ticket/qits-1673',
              workItem: { qualifiedId: 'qits-1673', title: 'Show items and participants' },
            },
            { source: 'bump/contract-service', label: 'bump/contract-service', workItem: null },
          ],
        },
      };
      const { element, answered } = await render(request.qualifiedId);
      read(request.qualifiedId).flush(carrying);
      await answered();
      const items = Array.from(element.querySelectorAll('h1 [data-item]'));
      expect(items).toHaveLength(2);
      const linked = items[0].querySelector('a[data-work-item]')!;
      expect(linked.textContent?.trim()).toBe('qits-1673');
      expect(linked.getAttribute('href')).toBe(`/projects/${project.slug}/work/detail/qits-1673`);
      expect(items[0].textContent).toContain('Show items and participants');
      expect(items[1].querySelector('[data-work-item]')).toBeNull();
      expect(items[1].textContent?.trim()).toBe('bump/contract-service');
      expect(askedBy(element)).toBe('asked by agent@qits, dev');
    });

    it('says nobody where the answer names no participants', async () => {
      const { element, answered } = await render(request.qualifiedId);
      read(request.qualifiedId).flush(recorded);
      await answered();
      expect(askedBy(element)).toBe('asked by —');
    });

    it('is a plain "Release request" when it names neither items nor sources', async () => {
      // Derived from the recording: no items, participants empty, no sources.
      const bare = { request: { ...request, items: [], participants: [], sources: [] } };
      const { element, answered } = await render(request.qualifiedId);
      read(request.qualifiedId).flush(bare);
      await answered();
      expect(element.querySelector('h1')?.textContent?.trim()).toBe('Release request');
      expect(askedBy(element)).toBe('asked by —');
    });
  });

  describe('the soft feature freeze (epic qits-1580)', () => {
    const FROZEN = 'a frozen release request with a queued next request';
    /** rr-2, queued behind rr-1, as its project answers it by rr-2's logical id. */
    const queued = goldenMaster(FROZEN, 'getProjectReleaseRequest');
    /** rr-1, frozen at 3 of 3 counted branches with rr-2 queued behind it: the same `{ request }`. */
    const frozen = goldenMaster(FROZEN, 'getReleaseRequest');

    const link = (element: HTMLElement, text: string) =>
      Array.from(element.querySelectorAll('a')).find((a) => a.textContent?.includes(text));

    it('says a queued request’s freeze and links the request it waits behind', async () => {
      const ref = queued.request.qualifiedId;
      const { element, answered } = await render(ref);
      read(ref).flush(queued);
      await answered();
      expect(element.textContent).toContain(
        'feature freeze: 1 of 3 counted branches · threshold from platform',
      );
      const behind = link(element, 'queued behind')!;
      expect(behind.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `queued behind ${frozen.request.qualifiedId}`,
      );
      expect(behind.getAttribute('href')).toBe(
        `/projects/${project.slug}/release-requests/${frozen.request.qualifiedId}`,
      );
      expect(link(element, 'next:')).toBeUndefined();
    });

    it('says a frozen request is frozen and links the request queued behind it', async () => {
      const ref = frozen.request.qualifiedId;
      const { element, answered } = await render(ref);
      read(ref).flush(frozen);
      await answered();
      expect(element.textContent).toContain(
        'feature freeze: 3 of 3 counted branches · frozen · threshold from platform',
      );
      const next = link(element, 'next:')!;
      expect(next.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `next: ${queued.request.qualifiedId}`,
      );
      expect(next.getAttribute('href')).toBe(
        `/projects/${project.slug}/release-requests/${queued.request.qualifiedId}`,
      );
      expect(link(element, 'queued behind')).toBeUndefined();
    });

    it('says the freeze is off, and which level switched it off', async () => {
      const ref = frozen.request.qualifiedId;
      const { element, answered } = await render(ref);
      // Derived from the frozen recording: a repository whose own threshold is 0.
      read(ref).flush({
        request: {
          ...frozen.request,
          featureFreeze: { features: 3, threshold: 0, frozen: false, source: 'REPOSITORY' },
        },
      });
      await answered();
      expect(element.textContent).toContain('feature freeze: off (repository)');
    });
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

  describe('upstream override (epic qits-897)', () => {
    /** What the service sends on a 403 from the override door: only a person may decide. */
    const ONLY_A_PERSON = 'Only a person may make this decision; an agent or a service may not.';

    /**
     * The recorded request awaiting approval, held before QA by one upstream request: the
     * upstream-in-flight gate inserted after its automations, as qits-projects records it in
     * 'a release request held by an upstream release' (from qits-914 on; the pinned golden masters
     * do not hold that state yet). `overridden` is the door's answer: the same check PASSED,
     * naming who overrode. Once the pin carries the state, read both bodies from it instead.
     */
    const held = (state: 'PENDING' | 'PASSED', checks?: readonly object[]) => {
      const body = goldenMaster('a release request awaiting approval', 'getReleaseRequest');
      const gates = body.request.qualityGates ?? [];
      const upstream = {
        kind: 'upstream-in-flight',
        label: 'Upstream releases',
        position: 'pre-run-qa',
        state,
        detail:
          state === 'PENDING'
            ? 'Waiting for upstream releases: contract-service-rr-1'
            : 'Overridden: contract-service-rr-1 (dev)',
        checks: checks ?? [
          {
            name: 'contract-service-rr-1',
            state,
            detail:
              (state === 'PASSED' ? 'Overridden by dev; ' : '') +
              'QA run 00000000-0000-4000-8000-000000000007 is RUNNING at cb97768559',
            runId: '00000000-0000-4000-8000-000000000007',
          },
        ],
        runId: null,
        link: null,
      };
      body.request.qualityGates = [gates[0], upstream, ...gates.slice(1)];
      return { request: { ...body.request, qualifiedId: request.qualifiedId } };
    };

    /** The page with `body` read. */
    async function shownWith(body: { request: { repoId: string; id: string } }) {
      const page = await render(request.qualifiedId);
      read(request.qualifiedId).flush(body);
      await page.answered();
      const { repoId, id } = body.request;
      const overrides = () =>
        http.match(
          `/projects/api/repositories/${repoId}/release-requests/${id}/upstream-overrides`,
        );
      const button = () =>
        Array.from(page.element.querySelectorAll('app-upstream-override button')).find((b) =>
          /override/i.test(b.textContent ?? ''),
        ) as HTMLButtonElement | undefined;
      /** The check's row of the upstream gate, by the upstream's qualified id. */
      const check = (name: string) =>
        Array.from(page.element.querySelectorAll('li li')).find(
          (li) => li.querySelector('span')?.textContent?.trim() === name,
        ) as HTMLElement | undefined;
      return { ...page, overrides, button, check };
    }

    /** Types a note, presses Override twice, and answers the override with `answer`. */
    async function override(
      shown: Awaited<ReturnType<typeof shownWith>>,
      answer: (call: ReturnType<typeof http.match>[number]) => void,
    ) {
      const input = shown.element.querySelector('app-upstream-override input') as HTMLInputElement;
      input.value = '  The service change is docs only.  ';
      input.dispatchEvent(new Event('input'));
      shown.button()!.click();
      await shown.answered();
      expect(shown.button()?.textContent?.trim()).toBe('Confirm override?');
      expect(shown.overrides()).toHaveLength(0);
      shown.button()!.click();
      await settle();
      const [call] = shown.overrides();
      expect(call.request.method).toBe('POST');
      expect(call.request.body).toEqual({
        upstreamRequestId: 'contract-service-rr-1',
        note: 'The service change is docs only.',
      });
      answer(call);
      await shown.answered();
    }

    it('offers Override on the PENDING check of the upstream-in-flight gate, and only there', async () => {
      const { element, check } = await shownWith(held('PENDING'));
      expect(element.querySelectorAll('app-upstream-override')).toHaveLength(1);
      expect(check('contract-service-rr-1')?.querySelector('app-upstream-override')).not.toBeNull();
      expect(check('Estate pins')?.querySelector('app-upstream-override')).toBeNull();
    });

    it('offers no Override on an overridden (PASSED) upstream check', async () => {
      const { element } = await shownWith(held('PASSED'));
      expect(element.textContent).toContain('Overridden by dev');
      expect(element.querySelector('app-upstream-override')).toBeNull();
    });

    it('offers no Override while the request is held by no upstream', async () => {
      const { element } = await shownWith(held('PASSED', []));
      expect(element.querySelector('app-upstream-override')).toBeNull();
    });

    it('posts the upstream and the note on the second press, and shows the check PASSED', async () => {
      const shown = await shownWith(held('PENDING'));
      await override(shown, (call) => call.flush(held('PASSED')));
      const row = shown.check('contract-service-rr-1')!;
      expect(row.textContent).toContain('Overridden by dev');
      expect(row.querySelector('app-upstream-override')).toBeNull();
    });

    it('shows the service’s sentence on a 403', async () => {
      const shown = await shownWith(held('PENDING'));
      await override(shown, (call) =>
        call.flush({ message: ONLY_A_PERSON }, { status: 403, statusText: 'Forbidden' }),
      );
      const alert = shown.element.querySelector('app-upstream-override [role="alert"]');
      expect(alert?.textContent?.trim()).toBe(ONLY_A_PERSON);
      expect(shown.button()?.textContent?.trim()).toBe('Override');
    });

    it('says the upstream is no longer building on a 409, and reads the request again', async () => {
      const shown = await shownWith(held('PENDING'));
      await override(shown, (call) =>
        call.flush({ message: 'The override is moot' }, { status: 409, statusText: 'Conflict' }),
      );
      // The upstream finished: the gate holds no one any more.
      read(request.qualifiedId).flush(held('PASSED', []));
      await shown.answered();
      expect(shown.element.querySelector('app-upstream-override')).toBeNull();
      expect(shown.element.textContent).toContain(
        'The upstream is no longer building (contract-service-rr-1).',
      );
    });
  });

  describe('active CI runs', () => {
    /** A request whose QA phase names a run qits-ci records as still running. */
    const awaiting = goldenMaster('a release request awaiting approval', 'getReleaseRequest');

    /** The page of the awaiting request, its repository's runs answered as `state` records them. */
    async function shownWithRuns(state: string) {
      const { element, answered } = await render(awaiting.request.qualifiedId);
      read(awaiting.request.qualifiedId).flush(awaiting);
      await answered();
      http
        .expectOne((r) => /^\/ci\/api\/runs(\?|$)/.test(r.url))
        .flush(ciGoldenMaster(state, 'listRuns'));
      await answered();
      return element;
    }

    it('links the request’s running CI run in the head', async () => {
      const element = await shownWithRuns('a repository with the runs of a release request');
      const qa = awaiting.request.pipeline.phases.find(
        (phase: { phase: string }) => phase.phase === 'QA',
      ).runId;
      const chips = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[data-active-run]'));
      expect(chips.map((a) => a.textContent?.trim())).toEqual(['CI running']);
      const ci = TestBed.inject(PlatformOrigins).page('ci');
      expect(ci).not.toBe('');
      expect(chips[0].getAttribute('href')).toBe(`${ci}/runs/${qa}`);
    });

    it('shows no chip while none of its runs is active', async () => {
      const element = await shownWithRuns('a green release run');
      expect(element.querySelectorAll('[data-active-run]')).toHaveLength(0);
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
