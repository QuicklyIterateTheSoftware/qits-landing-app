import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as maintenanceClient } from '../../../../../../api/maintenance/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { goldenMaster, maintenanceGoldenMaster } from '../../../../../../../testing/golden-masters';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import {
  bumpDuration,
  bumpRunIds,
  bumpStatusLabel,
  bumpStatusTone,
  MaintenanceBumpPage,
  releaseNotComing,
  releaseRequestRef,
} from './maintenance-bump.page';

/**
 * The bump page (qits-2332), its one read answered with qits-maintenance's recordings: "pending
 * bumps" (a GROUP bump of contract-frontend that SUCCEEDED, sent one change and was RELEASED, no
 * CI run), "a bump that changed nothing" (an entity-diagram automation bump, NOTHING_TO_DO, one
 * run, its message), "a failed bump" (a golden-recordings-maven automation bump, FAILED, two runs
 * and its failure) and "no such bump" (404). The open project is qits-projects' recorded one.
 */
const RELEASED = 'pending bumps';
const NOTHING = 'a bump that changed nothing';
const FAILED = 'a failed bump';
const MISSING = 'no such bump';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ template: 'stub' })
class Stub {}

describe('MaintenanceBumpPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const bumpOf = (state: string) => maintenanceGoldenMaster(state, 'getBump');

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/maintenance/bumps/:bumpId', component: MaintenanceBumpPage },
          { path: 'projects/:slug/releases/requests/:requestId', component: Stub },
          { path: 'projects/:slug/releases/ci/runs/:runId', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(maintenanceClient),
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /**
   * The page of the bump `id`, its read answered with `body` at `status` (`state`'s recording
   * unless given).
   */
  async function render(
    state: string,
    { id = bumpOf(state).id as string, body = bumpOf(state), status = 200 } = {},
  ) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/maintenance/bumps/${id}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    const read = http.expectOne(`/maintenance/api/bumps/${id}`);
    if (status === 200) read.flush(body);
    else read.flush(body, { status, statusText: 'Error' });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element, id };
  }

  /** The alerts shown: none inside a hidden element (`ui-load-failure` hidden keeps its own). */
  const alerts = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>('[role="alert"]')].filter(
      (alert) => !alert.closest('.hidden'),
    );

  const text = (element: HTMLElement, selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('shows a bump that sent a change and was released', async () => {
    const { element } = await render(RELEASED);
    const bump = bumpOf(RELEASED);
    expect(text(element, 'h2')).toBe(`${bump.group} · ${bump.repository}`);
    expect(text(element, '[data-status]')).toBe('succeeded');
    const facts = text(element, '[data-facts]');
    for (const fact of [bump.repository, bump.mode, bump.trigger, bump.branch, bump.configPath]) {
      expect(facts).toContain(fact);
    }
    expect(facts).toContain(bump.resultSha.slice(0, 7));
    const request = element.querySelector<HTMLAnchorElement>('[data-release-request] a')!;
    expect(request.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/requests/${bump.releaseRequestId}`,
    );
    expect(text(element, '[data-release-state]')).toContain('RELEASED');
    expect(element.querySelector('[data-not-coming]')).toBeNull();
    expect(text(element, '[data-runs]')).toBe('No CI run.');
    const rows = element.querySelectorAll('table[aria-label="Changes"] tbody tr');
    expect(rows).toHaveLength(1);
    const change = bump.changes[0];
    for (const value of [
      change.ecosystem,
      change.manifestPath,
      change.name,
      change.from,
      change.to,
    ]) {
      expect(rows[0].textContent).toContain(value);
    }
    expect(alerts(element)).toEqual([]);
    expect(element.querySelector('[data-failure]')).toBeNull();
  });

  it('shows a bump that changed nothing: its message plain, no changes, its run linked', async () => {
    const { element } = await render(NOTHING);
    const bump = bumpOf(NOTHING);
    expect(text(element, '[data-status]')).toBe('nothing to do');
    // The message is the normal sentence of an automation that had nothing to do: never an alert.
    expect(alerts(element)).toEqual([]);
    expect(text(element, '[data-no-changes]')).toBe(`This bump sent no changes. ${bump.message}`);
    expect(element.querySelectorAll('[data-message]')).toHaveLength(1);
    const runs = [...element.querySelectorAll<HTMLAnchorElement>('[data-runs] a')];
    expect(runs.map((a) => a.getAttribute('href'))).toEqual([
      `/projects/${project.slug}/releases/ci/runs/run-contract-1`,
    ]);
    expect(text(element, '[data-run-status]')).toBe('SUCCESS');
    // No release state recorded: none, and nothing flagged.
    expect(text(element, '[data-release-state]')).toBe('none');
    expect(element.querySelector('[data-not-coming]')).toBeNull();
  });

  it('shows a failed bump: its message as an alert, its failure and every run', async () => {
    const { element } = await render(FAILED);
    const bump = bumpOf(FAILED);
    expect(text(element, '[data-status]')).toBe('failed');
    const [alert] = alerts(element);
    expect(alert.textContent?.trim()).toBe(bump.message);
    const failure = element.querySelector<HTMLElement>('[data-failure]')!;
    expect(failure.textContent).toContain(bump.failure.image);
    expect(failure.querySelector('pre')!.textContent).toBe(bump.failure.excerpt);
    const facts = [...failure.querySelectorAll('dd')].map((dd) => dd.textContent?.trim());
    expect(facts).toEqual([
      String(bump.failure.stepIndex),
      bump.failure.image,
      String(bump.failure.exitCode),
    ]);
    const runs = [...element.querySelectorAll<HTMLAnchorElement>('[data-runs] a')];
    expect(runs.map((a) => a.textContent?.trim())).toEqual(bump.ciRunIds);
    // The message is the alert alone: the no-changes text does not repeat it.
    expect(text(element, '[data-no-changes]')).toBe('This bump sent no changes.');
  });

  it('says there is no such bump on a 404', async () => {
    const id = '00000000-0000-4000-8000-0000000000ff';
    const { element } = await render(MISSING, {
      id,
      body: maintenanceGoldenMaster(MISSING, 'getBump'),
      status: 404,
    });
    expect(text(element, '[data-missing]')).toBe(`No bump ${id}.`);
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
    expect(element.querySelector('[data-bump]')).toBeNull();
  });

  it('says a refusal needs a staff role on a 403, not an empty page', async () => {
    const { element } = await render(RELEASED, { body: null as never, status: 403 });
    const [alert] = alerts(element);
    expect(alert.textContent).toContain('Reading a bump needs a staff role');
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
    expect(element.querySelector('[data-missing]')).toBeNull();
  });

  it('offers Retry when the read fails otherwise', async () => {
    const { element } = await render(RELEASED, { body: null as never, status: 500 });
    expect(element.querySelector('ui-load-failure')?.className).not.toContain('hidden');
    expect(alerts(element).map((alert) => alert.textContent)).not.toContain(
      expect.stringContaining('staff role'),
    );
  });

  /** Sends a bump event and lets the debounce pass. */
  async function bumpEvent(harness: RouterTestingHarness) {
    vi.useFakeTimers();
    try {
      events.next({ name: 'BuildSuccessful', payload: '{}' } as DomainEvent);
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
  }

  it('reads a running bump again after a bump event', async () => {
    // A RUNNING bump, derived from "pending bumps"' recording: no state records one under way.
    const running = { ...bumpOf(RELEASED), status: 'RUNNING', finishedAt: null };
    const { harness, element, id } = await render(RELEASED, { body: running });
    expect(text(element, '[data-status]')).toBe('running');
    await bumpEvent(harness);
    http.expectOne(`/maintenance/api/bumps/${id}`).flush(bumpOf(RELEASED));
    await answered(harness);
    expect(text(element, '[data-status]')).toBe('succeeded');
    // Settled now: the next event reads nothing.
    await bumpEvent(harness);
    http.expectNone(`/maintenance/api/bumps/${id}`);
  });

  it('never reads a settled bump again on events', async () => {
    const { harness, id } = await render(FAILED);
    await bumpEvent(harness);
    http.expectNone(`/maintenance/api/bumps/${id}`);
  });
});

describe('the bump page’s helpers', () => {
  it('flags only REJECTED, FAILED and CONFLICTED as a release that is not coming', () => {
    for (const state of ['REJECTED', 'FAILED', 'CONFLICTED']) {
      expect(releaseNotComing(state)).toBe(true);
    }
    for (const state of ['REQUESTED', 'PENDING', 'RELEASED', 'SOMETHING_NEW', null, undefined]) {
      expect(releaseNotComing(state)).toBe(false);
    }
  });

  it('links a uuid request, explains the sentinels and says none for null', () => {
    const id = '00000000-0000-4000-8000-000000000002';
    expect(releaseRequestRef(id)).toEqual({ kind: 'request', id });
    expect(releaseRequestRef('converged')).toMatchObject({ kind: 'sentinel', word: 'converged' });
    expect(releaseRequestRef('refused')).toMatchObject({ kind: 'sentinel', word: 'refused' });
    expect(releaseRequestRef(null)).toEqual({ kind: 'none' });
    expect(releaseRequestRef('rr-12')).toEqual({
      kind: 'sentinel',
      word: 'rr-12',
      explanation: '',
    });
  });

  it('takes ciRunIds, else splits the comma-joined ciRunId', () => {
    expect(bumpRunIds({ ciRunIds: ['a', 'b'], ciRunId: 'a,b' })).toEqual(['a', 'b']);
    expect(bumpRunIds({ ciRunIds: [], ciRunId: 'a, b' })).toEqual(['a', 'b']);
    expect(bumpRunIds({ ciRunId: null as never })).toEqual([]);
  });

  it('renders any status as its word, with a tone for the known ones', () => {
    expect(bumpStatusLabel('SUPERSEDED')).toBe('superseded');
    expect(bumpStatusLabel('NOTHING_TO_DO')).toBe('nothing to do');
    expect(bumpStatusLabel('SOMETHING_NEW')).toBe('something new');
    expect(bumpStatusTone('SUPERSEDED')).toBe('neutral');
    expect(bumpStatusTone('SUCCEEDED')).toBe('ok');
    expect(bumpStatusTone('FAILED')).toBe('failed');
    expect(bumpStatusTone('RUNNING')).toBe('waiting');
  });

  it('gives the duration, or the time so far while under way', () => {
    const startedAt = '2026-01-01T00:00:00Z';
    expect(
      bumpDuration({ status: 'SUCCEEDED', startedAt, finishedAt: '2026-01-01T00:02:05Z' }),
    ).toBe('2m 5s');
    expect(bumpDuration({ status: 'RUNNING', startedAt }, Date.parse('2026-01-01T00:01:00Z'))).toBe(
      'running for 1m 0s',
    );
    expect(bumpDuration({ status: 'SUPERSEDED', startedAt })).toBeUndefined();
  });
});
