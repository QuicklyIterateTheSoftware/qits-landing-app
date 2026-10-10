import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as ciClient } from '../../../../../api/ci/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { ReleaseRequestPage } from './release-request.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of one release request's page. The open project is the recorded one ("a project
 * exists"); the request is found in the recorded list "a project with pending release requests",
 * or, for a loaded request, in "a project with release requests in every state", which lists the
 * request every detail state records.
 *
 * qits-ci's calls (the repository's runs, a run's reports) answer with an error unless a spec
 * answers the runs with qits-ci's recording ({@link CI_RUNS}).
 */

/** qits-ci's recorded runs of a repository: a release request's QA, release and automation runs. */
const CI_RUNS = 'a repository with the runs of a release request';

/** Every detail state records its request in this list. */
const EVERY_STATE = 'a project with release requests in every state';

/** The page's clock: two hours after the recordings' instants, so "2 hours ago" stays put. */
const NOW = new Date('2026-01-01T02:00:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ReleaseRequestPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/release-requests/:requestId',
            component: ReleaseRequestPage,
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(ciClient),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    vi.useRealTimers();
    // A run's reports are read again after an error, so one such call is always open.
    failCi();
    http.verify();
    await page.viewport(800, 600);
  });

  /** Answers every open call to qits-ci with an error; how many. */
  function failCi(): number {
    const calls = http.match((r) => r.url.startsWith('/ci/'));
    for (const call of calls) call.flush(null, { status: 500, statusText: 'Server Error' });
    return calls.length;
  }

  /**
   * The page of `state`'s recorded request on `tab`, with every read answered as `state` records
   * it: the request, its fold's commits, the CI verdicts on the fold (when there is one) and, once
   * released, what it published. qits-ci's runs answer with its recording when `ciRuns` is set,
   * else with an error, as its reports always do.
   */
  async function shown(state: string, tab?: string, width = 900, ciRuns = false) {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const recorded = await goldenMaster(state, 'getReleaseRequest');
    const { fixture, element, repoId, id } = await render(
      recorded.request.id,
      EVERY_STATE,
      width,
      tab,
    );
    const base = `/projects/api/repositories/${repoId}/release-requests/${id}`;
    http.expectOne(base).flush(recorded);
    await answered(fixture);
    http.expectOne(`${base}/commits`).flush(await goldenMaster(state, 'listReleaseRequestCommits'));
    if (recorded.request.mergedSha) {
      http
        .expectOne(
          `/projects/api/repositories/${repoId}/commits/${recorded.request.mergedSha}/builds`,
        )
        .flush(await goldenMaster(state, 'listCommitBuilds'));
    }
    if (recorded.request.version) {
      http
        .expectOne(`${base}/artifacts`)
        .flush(await goldenMaster(state, 'getReleaseRequestArtifacts'));
    }
    await answered(fixture);
    // The runs, then the reports of the runs the request names, each asked once the one before
    // has answered.
    if (ciRuns) {
      http
        .expectOne((r) => /^\/ci\/api\/runs(\?|$)/.test(r.url))
        .flush(await goldenMaster(CI_RUNS, 'listRuns', 'qits-ci'));
      await answered(fixture);
    }
    for (let round = 0; round < 3; round++) {
      failCi();
      await answered(fixture);
    }
    // Tall enough for the whole page, so the screenshot holds all of it.
    await page.viewport(width, 2400);
    return { fixture, element, view: page.elementLocator(element) };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    await settle();
  }

  /** The page for `requestId` (default: the first recorded request), with the lists answered. */
  async function render(
    requestId?: string,
    listState = 'a project with pending release requests',
    width = 900,
    tab?: string,
  ) {
    await page.viewport(width, 700);
    const projects = await goldenMaster('a project exists', 'listProjects');
    const project = projects.entries[0].project;
    const listed = await goldenMaster(listState, 'listProjectReleaseRequests');
    const id = requestId ?? listed.requests[0].id;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/release-requests/${encodeURIComponent(id)}` +
        (tab ? `?tab=${tab}` : ''),
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(projects);
    await navigated;
    await answered(harness.fixture);
    http.expectOne(`/projects/api/projects/${project.id}/release-requests`).flush(listed);
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await answered(harness.fixture);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = `${width}px`;
    const repoId = listed.requests.find((r: { id: string }) => r.id === id)?.repoId;
    return { fixture: harness.fixture, element, repoId, id };
  }

  it('marks the request as loading, then as failed to load', async () => {
    const { fixture, element, repoId, id } = await render();
    const request = http.expectOne(
      `/projects/api/repositories/${repoId}/release-requests/${encodeURIComponent(id)}`,
    );
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    // The runs fail too; the page says nothing of them while the request has not loaded.
    http
      .expectOne((r) => r.url.startsWith('/ci/api/runs'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });

  it('says so when the project lists no such request', async () => {
    const { element } = await render('no-such-request');
    const view = page.elementLocator(element);
    await expect.element(view).toHaveTextContent('has no open or recently finalized release');
    await expect.element(view).toMatchScreenshot('not-found');
  });

  it('draws a refolded request’s fold as a branch graph under its sources', async () => {
    const { element } = await shown('a refolded release request', 'commits');
    const graph = page.elementLocator(element).getByRole('region', {
      name: 'What this release folds in',
    });
    await expect.element(graph).toHaveTextContent('feature/export');
    await expect.element(graph).toMatchScreenshot('refolded-graph');
  });

  it('shows a pending request: head, facts and its lifecycle', async () => {
    const { view } = await shown('a release request awaiting approval');
    await expect.element(view).toHaveTextContent('Release the export across the suite');
    await expect.element(view).toHaveTextContent('asked by contract-seeder');
    await expect.element(view).toMatchScreenshot('pending');
  });

  it('offers Approve and Decline while a person must approve', async () => {
    const { view } = await shown('a release request awaiting approval');
    await expect.element(view.getByRole('button', { name: 'Approve release' })).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Decline release' })).toBeVisible();
  });

  it('counts the commits its fold brought in on the Commits tab', async () => {
    const { view } = await shown('a release request awaiting approval');
    const tabs = view.getByRole('navigation', { name: 'Release request views' });
    await expect.element(tabs.getByRole('link', { name: /Commits/ })).toHaveTextContent('3');
  });

  it('reads and counts the runs once the CI runs tab opens', async () => {
    const { view } = await shown('a release request awaiting approval', 'runs', 900, true);
    const tabs = view.getByRole('navigation', { name: 'Release request views' });
    // The request names its QA run, its CI verdicts and its two automations' runs; qits-ci's list
    // tells what its QA run is (the recorded release run, still running).
    await expect.element(tabs.getByRole('link', { name: /Builds/ })).toHaveTextContent(/\d/);
    const builds = view.getByRole('heading', { name: 'Builds' });
    await expect.element(builds).toBeVisible();
    await expect.element(view).toHaveTextContent('2026.101.120000');
    await expect.element(view).toHaveTextContent('running');
  });

  it('shows a released request with its version and what it published', async () => {
    const { view } = await shown('a released release request');
    await expect.element(view).toHaveTextContent('2026.101.100500');
    await expect.element(view.getByRole('heading', { name: 'What it published' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('released');
  });

  it('shows the paths a conflicted request could not fold', async () => {
    const recorded = await goldenMaster('a conflicted release request', 'getReleaseRequest');
    const { view } = await shown('a conflicted release request');
    await expect.element(view).toHaveTextContent(recorded.request.conflict.conflicts[0].path);
    await expect.element(view).toMatchScreenshot('conflicted');
  });
});
