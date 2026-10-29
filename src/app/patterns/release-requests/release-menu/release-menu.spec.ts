import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as systemClient } from '../../../api/system/client.gen';
import { client as ciClient } from '../../../api/ci/client.gen';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { SelectedProject } from '$core/projects/selected-project';
import {
  ciGoldenMaster,
  goldenMaster,
  systemGoldenMaster,
} from '../../../../testing/golden-masters';
import { Subject } from 'rxjs';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { isPendingRelease, type ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { attentionOf } from '$core/release-requests/release-lifecycle';
import { ReleaseMenu, REFRESH_DEBOUNCE_MS } from './release-menu';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseMenu', () => {
  let http: HttpTestingController;
  /** What a fake `DomainEvents` hands the menu. */
  let events: Subject<DomainEvent>;
  const project = signal<{ id: string; name: string; slug: string } | undefined>(undefined);
  const recorded = goldenMaster('a project exists', 'getProject').project;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    project.set(recorded);
    TestBed.configureTestingModule({
      providers: [
        // A server platform: the store does not load the project list by itself.
        { provide: PLATFORM_ID, useValue: 'server' },
        // A clicked request link goes nowhere, but goes somewhere the router knows.
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(systemClient),
        provideHeyApiClient(ciClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.example' }),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
        {
          provide: SelectedProject,
          useValue: { project, slug: signal(recorded.slug), url: signal('') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Opening the menu also reads qits-system's targets, for the runners and slots line. */
  const TARGETS = '/system/api/targets';
  /** ...and qits-ci's active runs, for the chips under each request. */
  const ACTIVE = '/ci/api/runs/active';

  // The tests below that open the menu are about the requests: their targets read is refused, which
  // hides the line (its own spec is `runner-slots.spec.ts`).
  afterEach(async () => {
    await settle();
    for (const read of http.match((r) => r.url === TARGETS || r.url === ACTIVE))
      read.flush(null, { status: 403, statusText: 'Forbidden' });
    http.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(ReleaseMenu);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    const panel = element.querySelector<HTMLElement>('#release-menu')!;
    return { fixture, element, button, panel };
  }

  it('is hidden while no project is open, and fetches nothing', async () => {
    project.set(undefined);
    const { element } = render();
    expect(element.classList.contains('hidden')).toBe(true);
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
  });

  it('fetches the requests as soon as a project is open, and counts those needing a person', async () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'));
    await settle();
    fixture.detectChanges();
    // The recorded REJECTED (a red build) and CONFLICTED requests need a person; with none it
    // would count all five pending ones.
    expect(button.textContent?.trim()).toBe('2');

    button.click(); // opens, from what the store holds
    fixture.detectChanges();
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.querySelectorAll('li')).toHaveLength(5);
  });

  it('lists the requests needing a person first, each linking to its page there', async () => {
    const { fixture, button, panel } = render();
    await settle();
    const answer = goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    ) as { requests: ReleaseRequestEntry[] };
    http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(answer);
    await settle();
    button.click();
    fixture.detectChanges();
    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('li a'));
    const pending = answer.requests.filter(isPendingRelease);
    const needs = pending.filter((r) => attentionOf(r).length > 0);
    const rest = pending.filter((r) => attentionOf(r).length === 0);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      ...needs.map(
        (r) =>
          `/projects/${recorded.slug}/release-requests/${r.qualifiedId}#${attentionOf(r)[0].anchor}`,
      ),
      ...rest.map((r) => `/projects/${recorded.slug}/release-requests/${r.qualifiedId}`),
    ]);
    expect(needs.length).toBe(2);
    // Each row is named by its logical id (`<repository>-rr-<n>`).
    expect(links.map((a) => a.querySelector('span')?.textContent?.trim())).toEqual(
      [...needs, ...rest].map((r) => r.qualifiedId),
    );
    expect(links[0].textContent).toMatch(/-rr-\d+/);

    links[0].click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('fetches again, once, after a burst of events about the open project', async () => {
    const { fixture } = render();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await settle();
    vi.useFakeTimers();
    const ofThisProject = JSON.stringify({ projectId: recorded.id });
    events.next({ id: '1', name: 'ReleaseRequestChanged', payload: ofThisProject });
    events.next({ id: '2', name: 'BuildSuccessful', payload: ofThisProject });
    events.next({ id: '3', name: 'BuildFailed', payload: JSON.stringify({ projectId: 'other' }) });
    // A deployment names no project; with nothing RELEASED waiting for one, it is ignored.
    events.next({ id: '4', name: 'DeploymentActive', payload: '{"applicationName":"x"}' });
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with pending release requests', 'listProjectReleaseRequests'));
    await settle();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button')?.textContent?.trim(),
    ).toBe('2');
  });

  it('closes on Escape, returning the focus to its button, and on a click outside', async () => {
    const { fixture, button, panel } = render();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    button.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(button);

    button.click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('reads the targets on opening and shows the runners and slots line above the list', async () => {
    const { fixture, button, panel } = render();
    await settle();
    http
      .expectOne(`/projects/api/projects/${recorded.id}/release-requests`)
      .flush(goldenMaster('a project with no release requests', 'listProjectReleaseRequests'));
    await settle();
    expect(panel.querySelector('app-runner-slots')?.textContent?.trim()).toBe('');
    button.click();
    fixture.detectChanges();
    await settle();
    http
      .expectOne(TARGETS)
      .flush(systemGoldenMaster('a connected target with leases', 'listTargets'));
    await settle();
    fixture.detectChanges();
    const line = panel.querySelector('app-runner-slots')!;
    expect(line.nextElementSibling?.tagName).toBe('UI-SPINNER');
    expect(line.textContent).toContain('runners: 1');
    expect(line.textContent).toContain('slots:');
  });

  describe('active CI runs', () => {
    const requests = goldenMaster(
      'a project with pending release requests',
      'listProjectReleaseRequests',
    ) as { requests: ReleaseRequestEntry[] };
    const recordedActive = ciGoldenMaster('a commit with a run in flight', 'listActiveRuns') as {
      runs: { id: string; status: string; branch: string; releaseRequestId: string | null }[];
    };

    async function opened() {
      const rendered = render();
      await settle();
      http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(requests);
      await settle();
      rendered.button.click();
      rendered.fixture.detectChanges();
      await settle();
      return { ...rendered, active: http.expectOne(ACTIVE) };
    }

    it('links the active runs under the request they belong to', async () => {
      const { fixture, panel, active } = await opened();
      // qits-ci's recorded run in flight names no request (two providers, unrelated ids), so it is
      // put under the first pending request; a queued copy of it runs that request's automation.
      const target = requests.requests.find(isPendingRelease)!;
      const [run] = recordedActive.runs;
      active.flush({
        runs: [
          { ...run, releaseRequestId: target.id },
          {
            ...run,
            id: `${run.id}-auto`,
            status: 'QUEUED',
            branch: `maintenance/automations/screenshot-baselines/${target.id}`,
          },
        ],
      });
      await settle();
      fixture.detectChanges();
      const chips = Array.from(panel.querySelectorAll<HTMLAnchorElement>('a[data-active-run]'));
      expect(chips.map((a) => a.textContent?.trim())).toEqual(['CI running', 'Automation queued']);
      expect(chips[0].getAttribute('href')).toBe(`https://ci.example/runs/${run.id}`);
      const row = chips[0].closest('li')!;
      expect(row.querySelector('a span')?.textContent?.trim()).toBe(target.qualifiedId);
      expect(panel.querySelectorAll('li a[data-active-run]').length).toBe(2);
    });

    it('shows no chip while no run of a pending request is active', async () => {
      const { fixture, panel, active } = await opened();
      active.flush(recordedActive);
      await settle();
      fixture.detectChanges();
      expect(panel.querySelectorAll('[data-active-run]')).toHaveLength(0);
    });

    it('reads the active runs again after a build event of a pending request’s repository', async () => {
      const { fixture, panel, active } = await opened();
      active.flush(recordedActive);
      await settle();
      const target = requests.requests.find(isPendingRelease)!;
      vi.useFakeTimers();
      events.next({
        id: '1',
        name: 'BuildStatusChanged',
        payload: JSON.stringify({ repoId: 'other' }),
      });
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
      http.expectNone(ACTIVE);
      vi.useFakeTimers();
      events.next({
        id: '2',
        name: 'BuildStatusChanged',
        payload: JSON.stringify({ repoId: target.repoId }),
      });
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
      // Derived as above: the recorded run, put under the first pending request.
      const [run] = recordedActive.runs;
      http.expectOne(ACTIVE).flush({ runs: [{ ...run, releaseRequestId: target.id }] });
      await settle();
      fixture.detectChanges();
      expect(panel.querySelector('[data-active-run]')?.textContent?.trim()).toBe('CI running');
      // A build event may also move the requests; that read is not this test's subject.
      for (const read of http.match(`/projects/api/projects/${recorded.id}/release-requests`))
        read.flush(requests);
    });
  });
});
