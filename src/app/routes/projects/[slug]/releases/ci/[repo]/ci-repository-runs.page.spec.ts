import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { filter, Subject } from 'rxjs';
import { client as ciClient } from '../../../../../../api/ci/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { ciGoldenMaster, goldenMaster } from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { CiRepositoryRunsPage } from './ci-repository-runs.page';

/**
 * A repository's CI page (qits-2320), its reads answered with qits-projects' "a project with 3
 * repositories" and qits-ci's "a repository of the project with a run history" (contract-service,
 * `…0005`: six runs, newest first) or "a repository of the project with no runs". Covers the name
 * resolution, the filters (status, branch, trigger, and values the page does not know), the rows'
 * details, the empty, unknown and filtered-to-nothing states and the build events that read the
 * runs again.
 */
const REPOSITORIES = 'a project with 3 repositories';
const HISTORY = 'a repository of the project with a run history';
const NONE = 'a repository of the project with no runs';
const SERVICE_ID = '00000000-0000-4000-8000-000000000005';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Whether a request is qits-ci's `listRuns`. */
const isRunsRead = (request: { url: string }) => /^\/ci\/api\/runs(\?|$)/.test(request.url);

describe('CiRepositoryRunsPage', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/releases/ci/:repo', component: CiRepositoryRunsPage },
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

  afterEach(() => http.verify());

  /** Lets the requests go out and the page draw. */
  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The page of `repo` at `query`, its repositories answered; the runs read is the caller's. */
  async function open(repo: string, query = '') {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/releases/ci/${repo}${query}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element };
  }

  /** contract-service's page at `query`, its runs answered from `runs`. */
  async function render(query = '', runs = HISTORY) {
    const opened = await open('contract-service', query);
    const read = http.expectOne(isRunsRead);
    read.flush(ciGoldenMaster(runs, 'listRuns'));
    await answered(opened.harness);
    return { ...opened, read };
  }

  /** The shown runs' ids, by their last two characters. */
  const shown = (element: HTMLElement) =>
    [...element.querySelectorAll('[data-run]')].map((row) =>
      row.getAttribute('data-qits-item')?.slice(-2),
    );
  const shownText = (element: HTMLElement, text: string) =>
    [...element.querySelectorAll('p')].find((p) => p.textContent?.includes(text));

  it('reads the named repository’s newest runs by its id', async () => {
    const { read } = await render();
    expect(read.request.params.get('repositoryId') ?? queryOf(read, 'repositoryId')).toBe(
      SERVICE_ID,
    );
    expect(read.request.params.get('limit') ?? queryOf(read, 'limit')).toBe('100');
  });

  it('lists the runs newest first, each with its status, branch, commit, trigger and duration', async () => {
    const { element } = await render();
    expect(element.querySelector('h1')?.textContent).toContain('contract-service');
    expect(shown(element)).toEqual(['06', '04', '07', '03', '02', '01']);
    const rows = [...element.querySelectorAll<HTMLElement>('[data-run]')];
    expect(rows[0].textContent).toContain('running');
    expect(rows[0].querySelector('[data-duration]')?.textContent?.trim()).toBe('running');
    expect(rows[0].querySelector('[data-trigger]')?.textContent).toContain('event');
    expect(rows[0].querySelector('[data-provenance]')?.textContent?.trim()).toBe(
      'SoftwareRelease · .config/qits/ci-event-build.yml',
    );
    // A run opens its page here (qits-2321).
    expect(rows[0].querySelector('[data-run-link]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/ci/runs/00000000-0000-4000-8000-000000000006`,
    );
    expect(rows[1].querySelector('[data-duration]')?.textContent?.trim()).toBe('0s');
    expect(rows[2].querySelector('[data-trigger]')?.textContent).toContain('push');
    expect(rows[2].querySelector('[data-provenance]')).toBeNull();
    expect(rows[5].querySelector('[data-branch]')?.textContent).toContain('feature/csv-export');
    expect(element.querySelector('[data-limit]')?.className).toContain('hidden');
  });

  it('says why a cancelled run was cancelled, and links the run that superseded it', async () => {
    const { element } = await render();
    const cancelled = element.querySelectorAll<HTMLElement>('[data-run]')[4];
    expect(cancelled.querySelector('[data-cancelled]')?.textContent).toContain('DEDUPED');
    expect(cancelled.querySelector('[data-superseded-by]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/ci/runs/00000000-0000-4000-8000-000000000003`,
    );
    expect(element.querySelectorAll('[data-cancelled]')).toHaveLength(1);
  });

  it('filters by ?status=', async () => {
    const { element } = await render('?status=FAILED');
    expect(shown(element)).toEqual(['03', '01']);
  });

  it('filters by ?branch=, a part of the branch in any case', async () => {
    const { element } = await render('?branch=CSV');
    expect(shown(element)).toEqual(['01']);
  });

  it('filters by ?trigger=', async () => {
    const { element } = await render('?trigger=push');
    expect(shown(element)).toEqual(['07']);
  });

  it('ignores a ?status= or ?trigger= the page does not know', async () => {
    const { element } = await render('?status=GREEN&trigger=cron');
    expect(shown(element)).toHaveLength(6);
  });

  it('says no run matches, with a link that clears the filters', async () => {
    const { element, harness } = await render('?status=TIMED_OUT&trigger=push');
    expect(shown(element)).toEqual([]);
    const note = shownText(element, 'No run matches.');
    expect(note?.className).toContain('block');
    note!.querySelector('a')!.click();
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project.slug}/releases/ci/contract-service`,
    );
    expect(shown(element)).toHaveLength(6);
  });

  it('writes the filters into the URL', async () => {
    const { element, harness } = await render();
    const [status, trigger] = element.querySelectorAll('select');
    status.value = 'SUCCESS';
    status.dispatchEvent(new Event('change'));
    await answered(harness);
    trigger.value = 'event';
    trigger.dispatchEvent(new Event('change'));
    await answered(harness);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${project.slug}/releases/ci/contract-service?status=SUCCESS&trigger=event`,
    );
    expect(shown(element)).toEqual(['04']);
  });

  it('says the repository has no runs yet', async () => {
    const { element } = await render('', NONE);
    expect(shown(element)).toEqual([]);
    expect(shownText(element, 'No CI runs for this repository yet.')?.className).toContain('block');
    expect(shownText(element, 'No run matches.')?.className).toContain('hidden');
    expect(element.querySelector('[role="search"]')?.className).toContain('hidden');
  });

  it('says the project has no repository of an unknown name, reads no runs, and links back', async () => {
    const { element } = await open('no-such-repository');
    http.expectNone(isRunsRead);
    const unknown = element.querySelector('[data-unknown]');
    expect(unknown?.textContent).toContain('No repository no-such-repository in this project.');
    expect(unknown?.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/ci`,
    );
    expect(element.querySelector('[data-back]')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/ci`,
    );
  });

  it('reads the runs again after a build of this repository only', async () => {
    const { harness, element } = await render();
    const build = (repoId: string) => ({
      name: 'BuildStatusChanged',
      payload: JSON.stringify({ repoId, runId: 'run-1' }),
    });
    vi.useFakeTimers();
    try {
      // contract-daemon, another repository of the project.
      events.next(build('00000000-0000-4000-8000-000000000003'));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    http.expectNone(isRunsRead);
    vi.useFakeTimers();
    try {
      events.next(build(SERVICE_ID));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await answered(harness);
    // The rows stay on show while the read is out.
    expect(shown(element)).toHaveLength(6);
    http.expectOne(isRunsRead).flush(ciGoldenMaster(HISTORY, 'listRuns'));
    http.expectNone(`/projects/api/projects/${project.id}/repositories`);
  });
});

/** A query parameter the generated client wrote into the URL itself. */
function queryOf(read: TestRequest, name: string): string | null {
  return new URL(read.request.urlWithParams, 'http://x').searchParams.get(name);
}
