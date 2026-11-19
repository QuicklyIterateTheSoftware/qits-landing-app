import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as ciClient } from '../../../../../../api/ci/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import {
  ciGoldenMaster,
  ciGoldenMasters,
  goldenMaster,
} from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { RUNNING_RUN_POLL_MS } from '$core/events/poll-while';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { CiRunPage } from './ci-run.page';

/**
 * The run page (qits-2321), its reads answered with qits-projects' "a project with 3
 * repositories" and qits-ci's runs of contract-service (…0005, one of those repositories):
 * "a finished run of the project" (FAILED, its third step exit 137 with an OOM kill, its first
 * step's output cut to its tail, coloured output), "a running run of the project" (a finished step
 * and the live one) and "a queued run of the project". qits-ci's "a running run" is of a repository
 * outside the project (…0001), so its page is the not-found state; so is "no run with the given id"
 * (404). Covers the default open step, `?step=`, the join, the events and the poll, Cancel and Run
 * again.
 */
const REPOSITORIES = 'a project with 3 repositories';
const FINISHED = 'a finished run of the project';
const RUNNING = 'a running run of the project';
const QUEUED = 'a queued run of the project';
const OUTSIDE = 'a running run';
const NO_RUN = 'no run with the given id';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ template: 'CI' })
class CiStub {}

describe('CiRunPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  let visibility: DocumentVisibilityState;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const runIdOf = (state: string) => ciGoldenMaster<{ id: string }>(state, 'getRun').id;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/ci/runs/:runId', component: CiRunPage },
          { path: 'projects/:slug/ci', component: CiStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(ciClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.example.test' }),
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
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** Answers the run's reports and the report the page reads in full (none recorded: 404). */
  function answerReports(runId: string) {
    const reports = ciGoldenMaster(FINISHED, 'listRunReports');
    http.expectOne(`/ci/api/runs/${runId}/reports`).flush(reports);
    return reports;
  }

  /** The page of the run `state` recorded, at `query`, every read answered. */
  async function render(state: string, query = '', runId = runIdOf(state)) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ci/runs/${runId}${query}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    const read = http.expectOne(`/ci/api/runs/${runId}`);
    if (state === NO_RUN) {
      read.flush(ciGoldenMaster(NO_RUN, 'getRun'), { status: 404, statusText: 'Not Found' });
    } else {
      read.flush(ciGoldenMaster(state, 'getRun'));
    }
    await answered(harness);
    if (state === FINISHED) {
      const reports = answerReports(runId);
      await answered(harness);
      http
        .expectOne(`/ci/api/runs/${runId}/reports/${reports.reports[0].id}`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      await answered(harness);
    }
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element, runId };
  }

  const row = (element: HTMLElement, key: string) =>
    element.querySelector<HTMLElement>(`[data-step="${key}"]`)!;
  const expanded = (element: HTMLElement, key: string) =>
    row(element, key).querySelector('button')!.getAttribute('aria-expanded');
  const button = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  it('shows a finished run with its facts, and opens its failed step on arrival', async () => {
    const { element } = await render(FINISHED);
    const run = element.querySelector('[data-run]')!;
    expect(run.querySelector('[data-repository]')?.textContent?.trim()).toBe('contract-service');
    expect(run.querySelector('[data-repository]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/ci?repository=contract-service`,
    );
    expect(run.querySelector('[data-branch]')?.textContent).toContain(
      'release/contract-service-rr-7',
    );
    const facts = run.querySelector('[data-facts]')!.textContent!;
    expect(facts).toContain('ReleaseRequestChanged · .config/qits/release.yml');
    expect(facts).toContain('java-service 2026.1101.1');
    expect(facts).toContain('00000000-0000-4000-8000-000000000007');
    expect(facts).toContain('00000000-0000-4000-8000-000000000001');
    expect(facts).toContain('2026.1101.120000');
    expect(facts).toContain('automatic');
    const request = run.querySelector('[data-release-request] a');
    expect(request?.textContent?.trim()).toBe('contract-service-rr-7');
    expect(request?.getAttribute('href')).toBe(
      `/projects/${project.slug}/release-requests/00000000-0000-4000-8000-000000000003`,
    );
    expect(run.querySelector('[data-retry-of]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/ci/runs/00000000-0000-4000-8000-000000000002`,
    );
    expect(expanded(element, '0')).toBe('false');
    expect(expanded(element, '1')).toBe('false');
    expect(expanded(element, '2')).toBe('true');
    expect(row(element, '2').querySelector('[data-exit-code]')?.textContent).toContain('exit 137');
    expect(row(element, '2').querySelector('[data-oom]')?.textContent).toContain(
      'killed by OOM (LEASE)',
    );
    // The failed step's output keeps its colour: "FAIL" bold and red, as text.
    const spans = [...row(element, '2').querySelectorAll('[data-output] span')];
    const fail = spans.find((span) => span.textContent === 'FAIL');
    expect([...(fail?.classList ?? [])].sort()).toEqual(['font-semibold', 'text-danger']);
    expect(row(element, '2').querySelector('[data-output]')?.textContent).not.toContain('\u001b');
    expect(button(element, 'Run again')).toBeTruthy();
    expect(button(element, 'Cancel')).toBeUndefined();
  });

  it('opens the steps ?step= names, says a cut output is its tail, and writes toggles back', async () => {
    const { element, harness, runId } = await render(FINISHED, '?step=0');
    expect(expanded(element, '0')).toBe('true');
    expect(expanded(element, '2')).toBe('false');
    expect(row(element, '0').querySelector('[data-truncated]')?.textContent).toContain(
      'Showing the last 64 KiB of this step’s output.',
    );
    expect(row(element, '0').querySelector('[data-output]')?.textContent).not.toContain(
      'output truncated',
    );
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    row(element, '1').querySelector('button')!.click();
    await answered(harness);
    expect(router.url).toBe(`/projects/${project.slug}/ci/runs/${runId}?step=0&step=1`);
    expect(navigate.mock.calls.at(-1)?.[1]?.replaceUrl).toBe(true);
    expect(expanded(element, '1')).toBe('true');
    row(element, '0').querySelector('button')!.click();
    await answered(harness);
    row(element, '1').querySelector('button')!.click();
    await answered(harness);
    // Every row closed: an empty `step`, so the failed step does not open again by default.
    expect(router.url).toBe(`/projects/${project.slug}/ci/runs/${runId}?step=`);
    expect(expanded(element, '2')).toBe('false');
  });

  it('opens the live step of a running run, with Cancel behind a confirm step', async () => {
    const { element, harness, runId } = await render(RUNNING);
    expect(expanded(element, 'live')).toBe('true');
    expect(expanded(element, '0')).toBe('false');
    const live = row(element, 'live').querySelector('[data-output]')!;
    expect(live.textContent).toContain('pushing qits/contract-service:2026.1001.1');
    expect(element.querySelector('[data-facts]')?.textContent).toContain('any moment now');
    expect(button(element, 'Run again')).toBeUndefined();
    button(element, 'Cancel')!.click();
    await answered(harness);
    http.expectNone(`/ci/api/runs/${runId}/cancel`);
    button(element, 'Confirm cancel?')!.click();
    await answered(harness);
    const cancel = http.expectOne(`/ci/api/runs/${runId}/cancel`);
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({ reason: 'Cancelled from the run page' });
    cancel.flush(null, { status: 202, statusText: 'Accepted' });
    await answered(harness);
    http.expectOne(`/ci/api/runs/${runId}`).flush(ciGoldenMaster(RUNNING, 'getRun'));
    await answered(harness);
    expect(element.querySelector('[data-cancel-asked]')?.textContent).toContain('Cancel asked');
  });

  it('says why a cancel was refused', async () => {
    const { element, harness, runId } = await render(RUNNING);
    button(element, 'Cancel')!.click();
    await answered(harness);
    button(element, 'Confirm cancel?')!.click();
    await answered(harness);
    http
      .expectOne(`/ci/api/runs/${runId}/cancel`)
      .flush({ message: 'finished' }, { status: 409, statusText: 'Conflict' });
    await answered(harness);
    http.expectOne(`/ci/api/runs/${runId}`).flush(ciGoldenMaster(RUNNING, 'getRun'));
    await answered(harness);
    expect(element.querySelector('[data-refusal]')?.textContent).toContain(
      'This run had already finished, so there was nothing to stop.',
    );
  });

  it('says a queued run waits for a CI slot, with its place and expected start', async () => {
    const { element } = await render(QUEUED);
    expect(element.querySelector('[data-waiting]')?.textContent).toContain(
      'Waiting for a CI slot: #2 in the queue.',
    );
    expect(element.querySelector('[data-expected-start]')?.textContent).toContain('in about 4 min');
    expect(element.querySelector('[data-step]')).toBeNull();
    expect(button(element, 'Cancel')).toBeTruthy();
  });

  it('says a run of a repository outside the project is not in this project', async () => {
    const { element, runId } = await render(OUTSIDE);
    expect(element.querySelector('[data-missing]')?.textContent).toContain(
      `No run ${runId} in this project.`,
    );
    expect(element.querySelector('[data-missing] a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/ci`,
    );
    expect(element.querySelector('[data-run]')).toBeNull();
  });

  it('says a run qits-ci does not have is not in this project', async () => {
    const runId = ciGoldenMasters.operation(NO_RUN, 'getRun').params['runId'];
    const { element } = await render(NO_RUN, '', runId);
    expect(element.querySelector('[data-missing]')?.textContent).toContain(
      `No run ${runId} in this project.`,
    );
    expect(element.querySelector('ui-load-failure')?.className).toContain('hidden');
  });

  it('reads the run again after a build event of this run only', async () => {
    const { harness, runId } = await render(QUEUED);
    const build = (id: string) => ({
      name: 'BuildStatusChanged',
      payload: JSON.stringify({ repoId: '00000000-0000-4000-8000-000000000005', runId: id }),
    });
    vi.useFakeTimers();
    try {
      events.next(build('another-run'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    http.expectNone(`/ci/api/runs/${runId}`);
    vi.useFakeTimers();
    try {
      events.next(build(runId));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    http.expectOne(`/ci/api/runs/${runId}`).flush(ciGoldenMaster(QUEUED, 'getRun'));
    await answered(harness);
  });

  it('polls a running run every 10 s while the document is visible, and nothing else', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { harness, runId } = await render(RUNNING);
    vi.advanceTimersByTime(RUNNING_RUN_POLL_MS);
    await answered(harness);
    http.expectOne(`/ci/api/runs/${runId}`).flush(ciGoldenMaster(RUNNING, 'getRun'));
    await answered(harness);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
    vi.advanceTimersByTime(3 * RUNNING_RUN_POLL_MS);
    await answered(harness);
    http.expectNone(`/ci/api/runs/${runId}`);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
    vi.advanceTimersByTime(RUNNING_RUN_POLL_MS);
    await answered(harness);
    // The run is read finished (the finished recording, under the running run's id): no more polls.
    http
      .expectOne(`/ci/api/runs/${runId}`)
      .flush({ ...ciGoldenMaster<object>(FINISHED, 'getRun'), id: runId });
    await answered(harness);
    answerReports(runId);
    await answered(harness);
    http
      .match(() => true)
      .forEach((request) => request.flush(null, { status: 404, statusText: '' }));
    vi.advanceTimersByTime(3 * RUNNING_RUN_POLL_MS);
    await answered(harness);
    http.expectNone(`/ci/api/runs/${runId}`);
  });

  it('never polls a finished or queued run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { harness, runId } = await render(QUEUED);
    vi.advanceTimersByTime(3 * RUNNING_RUN_POLL_MS);
    await answered(harness);
    http.expectNone(`/ci/api/runs/${runId}`);
  });

  it('opens the new run after Run again', async () => {
    const { element, harness, runId } = await render(FINISHED);
    button(element, 'Run again')!.click();
    await answered(harness);
    const retry = http.expectOne(`/ci/api/runs/${runId}/retry`);
    expect(retry.request.method).toBe('POST');
    const answer = ciGoldenMaster<{ runId: string }>(FINISHED, 'retryRun');
    retry.flush(answer, { status: 202, statusText: 'Accepted' });
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ci/runs/${answer.runId}`);
    http
      .expectOne(`/ci/api/runs/${answer.runId}`)
      .flush(ciGoldenMaster(NO_RUN, 'getRun'), { status: 404, statusText: 'Not Found' });
    await answered(harness);
  });

  it('says why Run again was refused', async () => {
    const { element, harness, runId } = await render(FINISHED);
    button(element, 'Run again')!.click();
    await answered(harness);
    http.expectOne(`/ci/api/runs/${runId}/retry`).flush(null, { status: 403, statusText: '' });
    await answered(harness);
    expect(element.querySelector('[data-refusal]')?.textContent).toContain(
      'You may not run this pipeline again (403).',
    );
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ci/runs/${runId}`);
  });
});
