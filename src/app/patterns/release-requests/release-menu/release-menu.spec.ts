import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { SelectedProject } from '$core/projects/selected-project';
import { goldenMaster } from '../../../../testing/golden-masters';
import { Subject } from 'rxjs';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import {
  gateTone,
  laterGates,
  phases,
  preRunSteps,
  ReleaseMenu,
  REFRESH_DEBOUNCE_MS,
  requestTone,
  WAITING_FOR_PRE_RUN,
} from './release-menu';

/** qits-projects' recorded list with a request in every state (qits-1133: pre-run, automations). */
const EVERY_STATE = () =>
  goldenMaster<{ requests: ReleaseRequestEntry[] }>(
    'a project with release requests in every state',
    'listProjectReleaseRequests',
  );

/**
 * The one recorded request whose automations include a kind that does not apply (Screenshot
 * baselines, NOT_APPLICABLE with its reason) beside a RUNNING one (Estate pins). The list it comes
 * from is the repository's, a different call, but the request carries the same fields.
 */
const WITH_NOT_APPLICABLE = () =>
  goldenMaster<{ requests: ReleaseRequestEntry[] }>(
    'a release request with an automation that does not apply',
    'listRepositoryReleaseRequests',
  ).requests[0];

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
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
        {
          provide: SelectedProject,
          useValue: { project, slug: signal(recorded.slug), url: signal('') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

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

  it('fetches the requests as soon as a project is open, and shows their count', async () => {
    const { fixture, button, panel } = render();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.classList.contains('hidden')).toBe(true);
    await settle();
    http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(EVERY_STATE());
    await settle();
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('6');

    button.click(); // opens, from what the store holds
    fixture.detectChanges();
    await settle();
    http.expectNone(`/projects/api/projects/${recorded.id}/release-requests`);
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.querySelectorAll('li')).toHaveLength(6);
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
    http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(EVERY_STATE());
    await settle();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button')?.textContent?.trim(),
    ).toBe('6');
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

  it('lists P1 Pre-run before P2 Test, the cog and the later gates, for each pending request', async () => {
    const { fixture, button, panel } = render();
    await settle();
    http.expectOne(`/projects/api/projects/${recorded.id}/release-requests`).flush(EVERY_STATE());
    await settle();
    fixture.detectChanges();
    button.click();
    fixture.detectChanges();
    // Seven recorded, one FINALIZED.
    const items = [...panel.querySelectorAll('li')];
    expect(items).toHaveLength(6);
    // The first: its pre-run PENDING, so Test waits although an earlier fold's CI passed.
    const first = items[0].textContent!.replace(/\s+/g, ' ');
    expect(first).toContain('contract-suite-app');
    expect(first.indexOf('P1 Pre-run · PENDING')).toBeGreaterThan(-1);
    expect(first.indexOf(`P2 Test · ${WAITING_FOR_PRE_RUN}`)).toBeGreaterThan(
      first.indexOf('P1 Pre-run · PENDING'),
    );
    expect(first).toContain('Approval · PENDING');
    expect(first).not.toContain('CI build');
    const cog = items[0].querySelector('[role="img"]')!;
    expect(cog.textContent?.trim()).toBe('4');
    expect(cog.getAttribute('title')).toBe(
      [
        'Merge',
        'Estate pins · FRESH',
        'Screenshot baselines · FRESH',
        'Entity diagram · PENDING (Run in flight)',
      ].join('\n'),
    );
    // The second: pre-run PASSED, so Test reads its CI build; no automations listed, the merge only.
    const second = items[1].textContent!.replace(/\s+/g, ' ');
    expect(second).toContain('P1 Pre-run · PASSED');
    expect(second).toContain('P2 Test · PASSED');
    expect(items[1].querySelector('[role="img"]')?.textContent?.trim()).toBe('1');
  });

  it('reads Test from the CI gate once the pre-run passed or was waived, and waits before', () => {
    const [pending, ready, , conflicted] = EVERY_STATE().requests;
    expect(phases(pending)).toEqual([
      { name: 'P1 Pre-run', state: 'PENDING', tone: 'waiting' },
      { name: 'P2 Test', state: WAITING_FOR_PRE_RUN, tone: 'neutral' },
    ]);
    expect(phases(ready)[1]).toEqual({ name: 'P2 Test', state: 'PASSED', tone: 'ok' });
    expect(phases(conflicted)[1].state).toBe(WAITING_FOR_PRE_RUN);
    // Derived: the pre-run waived, and a FAILED one.
    expect(phases({ ...pending, preRun: { state: 'WAIVED' } })).toEqual([
      { name: 'P1 Pre-run', state: 'WAIVED', tone: 'ok' },
      { name: 'P2 Test', state: 'PASSED', tone: 'ok' },
    ]);
    expect(phases({ ...pending, preRun: { state: 'FAILED' } })).toEqual([
      { name: 'P1 Pre-run', state: 'FAILED', tone: 'failed' },
      { name: 'P2 Test', state: WAITING_FOR_PRE_RUN, tone: 'neutral' },
    ]);
    // Derived: a row older than the pre-run carries none; its QA never waited on one.
    expect(phases({ ...ready, preRun: undefined })).toEqual([
      { name: 'P1 Pre-run', state: 'NONE', tone: 'neutral' },
      { name: 'P2 Test', state: 'PASSED', tone: 'ok' },
    ]);
  });

  it('shows the gates past the two phases, by label', () => {
    const released = EVERY_STATE().requests.find((request) => request.state === 'RELEASED')!;
    expect(laterGates(released).map((gate) => gate.label)).toEqual([
      'Publish run',
      'Deployment not rolled back',
    ]);
  });

  it('counts the merge and the applicable automation kinds, never a NOT_APPLICABLE one', () => {
    const request = WITH_NOT_APPLICABLE();
    expect(preRunSteps(request)).toEqual({
      count: 2,
      title: [
        'Merge',
        'Estate pins · RUNNING',
        'Screenshot baselines · not applicable (the fold carries no package.json)',
      ].join('\n'),
    });
  });

  it('counts a WAITING kind and shows it waiting', () => {
    // Derived: no recorded list holds a WAITING kind (a derived automation waiting on its sources),
    // so the NOT_APPLICABLE recording gains one, as qits-maintenance sends it (qits-1133).
    const request = WITH_NOT_APPLICABLE();
    request.automations = [
      ...(request.automations ?? []),
      {
        kind: 'entity-diagram',
        label: 'Entity diagram',
        state: 'WAITING',
        detail: 'waiting for Estate pins',
      },
    ];
    const steps = preRunSteps(request);
    expect(steps.count).toBe(3);
    expect(steps.title.split('\n')).toContain('Entity diagram · WAITING (waiting for Estate pins)');
    expect(gateTone('WAITING')).toBe('waiting');
  });

  it('counts the merge alone while no automation is listed', () => {
    expect(preRunSteps({ ...WITH_NOT_APPLICABLE(), automations: undefined })).toEqual({
      count: 1,
      title: 'Merge',
    });
  });

  it('colours gates and requests by how they stand', () => {
    expect(['PASSED', 'PENDING', 'FAILED', 'UNKNOWN'].map(gateTone)).toEqual([
      'ok',
      'waiting',
      'failed',
      'neutral',
    ]);
    expect(
      ['WAIVED', 'FRESH', 'COMMITTED', 'RUNNING', 'REQUESTED', 'NOT_APPLICABLE'].map(gateTone),
    ).toEqual(['ok', 'ok', 'ok', 'waiting', 'waiting', 'neutral']);
    expect(['READY', 'RELEASED', 'PENDING', 'CONFLICTED', 'REJECTED'].map(requestTone)).toEqual([
      'ok',
      'ok',
      'waiting',
      'failed',
      'failed',
    ]);
  });
});
