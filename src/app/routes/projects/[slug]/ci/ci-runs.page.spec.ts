import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as ciClient } from '../../../../api/ci/client.gen';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { ciGoldenMaster, goldenMaster } from '../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { CiRunsPage } from './ci-runs.page';

/**
 * The project's CI page (qits-2314), its three reads answered with qits-projects' "a project with
 * 3 repositories" and qits-ci's "a project whose repositories have runs" (the same repository ids)
 * or "no runs recorded", which the screenshots cannot show (it is not pacted: see the browser
 * spec). Covers the join, the order, both filters, the empty and filtered-to-nothing messages and
 * the build events that read the runs again.
 */
const REPOSITORIES = 'a project with 3 repositories';
const RUNS = 'a project whose repositories have runs';
const NONE = 'no runs recorded';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('CiRunsPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/ci', component: CiRunsPage }]),
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

  afterEach(() => http.verify());

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The page at `query`, every read answered: the runs in `runs`. */
  async function render(runs = RUNS, query = '') {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/ci${query}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    http
      .expectOne('/ci/api/repositories/summary')
      .flush(ciGoldenMaster(runs, 'listRepositorySummaries'));
    http.expectOne('/ci/api/runs/active').flush(ciGoldenMaster(runs, 'listActiveRuns'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element };
  }

  const names = (element: HTMLElement) =>
    [...element.querySelectorAll('[data-ci-row] > a:first-child')].map((a) =>
      a.textContent?.trim(),
    );
  const shownText = (element: HTMLElement, text: string) =>
    [...element.querySelectorAll('p')].find((p) => p.textContent?.includes(text));

  it('joins the project’s repositories to their newest runs, and shows the run in flight', async () => {
    const { element } = await render();
    expect(names(element)).toEqual([
      'contract-00000001-contract-00000001',
      'contract-daemon',
      'contract-frontend',
      'contract-service',
    ]);
    const rows = element.querySelectorAll('[data-ci-row]');
    expect(rows[2].querySelector('[data-last-run]')?.textContent).toContain('failed');
    expect(rows[2].querySelector('[data-last-run]')?.textContent).toContain('feature/csv-export');
    expect(rows[2].querySelector('[data-main-run]')?.textContent).toContain('success');
    expect(rows[2].querySelector('[data-last-run]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/ci/runs/00000000-0000-4000-8000-000000000009`,
    );
    expect(rows[2].querySelector('a')?.getAttribute('href')).toBe(
      `https://ci.example.test/${project.slug}/contract-frontend/contract-frontend`,
    );
    const running = element.querySelectorAll('[data-active-run]');
    expect(running).toHaveLength(1);
    expect(running[0].textContent).toContain('contract-service');
    expect(running[0].closest('section')?.className).toContain('block');
    expect(shownText(element, 'No CI runs')?.className).toContain('hidden');
    expect(shownText(element, 'No repository matches')?.className).toContain('hidden');
  });

  it('says the project has no runs, lists every repository with "No runs yet", and hides Running now', async () => {
    const { element } = await render(NONE);
    expect(names(element)).toHaveLength(4);
    for (const row of element.querySelectorAll('[data-ci-row]')) {
      expect(row.textContent).toContain('No runs yet');
    }
    expect(shownText(element, 'No CI runs for this project yet.')?.className).toContain('block');
    expect(element.querySelector('[role="search"]')?.className).toContain('hidden');
    expect(element.querySelector('section[aria-labelledby="ci-running-now"]')?.className).toContain(
      'hidden',
    );
  });

  it('filters by ?repository= (any case) and ?status= together', async () => {
    const { element } = await render(RUNS, '?repository=CONTRACT-&status=FAILED');
    expect(names(element)).toEqual(['contract-00000001-contract-00000001', 'contract-frontend']);
  });

  it('ignores a ?status= that names no run status', async () => {
    const { element } = await render(RUNS, '?status=GREEN');
    expect(names(element)).toHaveLength(4);
  });

  it('says no repository matches, with a link that clears the filters', async () => {
    const { element, harness } = await render(RUNS, '?status=TIMED_OUT');
    expect(names(element)).toEqual([]);
    const note = shownText(element, 'No repository matches.');
    expect(note?.className).toContain('block');
    note!.querySelector('a')!.click();
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ci`);
    expect(names(element)).toHaveLength(4);
  });

  it('writes the status filter into the URL', async () => {
    const { element, harness } = await render();
    const select = element.querySelector('select')!;
    select.value = 'SUCCESS';
    select.dispatchEvent(new Event('change'));
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(`/projects/${project.slug}/ci?status=SUCCESS`);
    expect(names(element)).toEqual(['contract-daemon']);
  });

  it('reads the runs again after a build of one of the project’s repositories only', async () => {
    const { harness } = await render();
    const build = (repoId: string) => ({
      name: 'BuildStatusChanged',
      payload: JSON.stringify({ repoId, runId: 'run-1' }),
    });
    vi.useFakeTimers();
    try {
      events.next(build('another-repository'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    http.expectNone('/ci/api/repositories/summary');
    http.expectNone('/ci/api/runs/active');
    vi.useFakeTimers();
    try {
      events.next(build('00000000-0000-4000-8000-000000000004'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    http
      .expectOne('/ci/api/repositories/summary')
      .flush(ciGoldenMaster(RUNS, 'listRepositorySummaries'));
    http.expectOne('/ci/api/runs/active').flush(ciGoldenMaster(RUNS, 'listActiveRuns'));
    http.expectNone(`/projects/api/projects/${project.id}/repositories`);
  });
});
