import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of one release request's page inside the shell (`openRoute`). The open project is the
 * recorded one ("a project exists"); the page reads the one request through it
 * (getProjectReleaseRequest), by the reference its URL names, and every read after it by the
 * repository that answer names.
 *
 * The specs about the read itself (loading, failure, Retry) answer it with qits-projects' own
 * recording of it ({@link EVERY_STATE}). qits-projects records that read in that one state only,
 * so the specs of a request in a given state (pending, refolded, released, conflicted) answer it
 * with that state's getReleaseRequest recording, as it is: the same `{ request }` shape, and pacted
 * per state for this reason (`release-request.store.pact.spec.ts`), with the state's commits,
 * verdicts and artifacts recorded beside it.
 *
 * A request carrying approval requirements ("a release request awaiting approval") is also read
 * for what the viewer may approve (getReleaseRequestApprovalEligibility), answered with that
 * state's recording: the recorded viewer may satisfy `manual-review`, so Approve and Decline show.
 *
 * qits-ci's calls (the repository's runs, a run's reports) answer with an error unless a spec
 * answers the runs with qits-ci's recording ({@link CI_RUNS}).
 */

/** The state whose recorded project answers the read of one of its requests. */
const EVERY_STATE = 'a project with release requests in every state';

/** qits-ci's recorded runs of a repository: a release request's QA, release and automation runs. */
const CI_RUNS = 'a repository with the runs of a release request';

/** The page's clock: two hours after the recordings' instants, so "2 hours ago" stays put. */
const NOW = new Date('2026-01-01T02:00:00Z');

describe('ReleaseRequestPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        // Where the head's active-run chips link to: a chip with no qits-ci page is no link.
        provideTestPlatformOrigins({}, { ci: 'https://ci.test' }),
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
  async function shown(state: string, tab?: string, width = 1140, ciRuns = false) {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    // The project's answer, from the state's own recording of the request (see above).
    const recorded = await goldenMaster(state, 'getReleaseRequest');
    const { id, repoId } = recorded.request;
    const { opened, read } = await render(id, width, tab);
    read.flush(recorded);
    await opened.settled();
    const base = `/projects/api/repositories/${repoId}/release-requests/${id}`;
    // A request whose fold carries approval requirements has the page read what the viewer may
    // approve (epic qits-1038); the state records that read beside the request.
    if (recorded.request.approvalRequirements?.length) {
      http
        .expectOne(`${base}/approval-eligibility`)
        .flush(await goldenMaster(state, 'getReleaseRequestApprovalEligibility'));
    }
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
    await opened.settled();
    // The runs, then the reports of the runs the request names, each asked once the one before
    // has answered.
    if (ciRuns) {
      http
        .expectOne((r) => /^\/ci\/api\/runs(\?|$)/.test(r.url))
        .flush(await goldenMaster(CI_RUNS, 'listRuns', 'qits-ci'));
      await opened.settled();
    }
    for (let round = 0; round < 3; round++) {
      failCi();
      await opened.settled();
    }
    // Tall enough for the whole page, so the screenshot holds all of it.
    await page.viewport(width, 2400);
    return { opened, element: opened.page, view: page.elementLocator(opened.page) };
  }

  /**
   * The page for `ref` (a uuid or a logical id) inside the shell, `width` wide (the page's 900px
   * plus the sidebar), with the project's repositories answered; `read` is its read of the
   * request, still open.
   */
  async function render(ref: string, width = 1140, tab?: string) {
    await page.viewport(width, 700);
    const opened = await openRoute(
      (project) =>
        `/projects/${project.slug}/release-requests/${encodeURIComponent(ref)}` +
        (tab ? `?tab=${tab}` : ''),
    );
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
      .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
    await opened.settled();
    const read = http.expectOne(
      `/projects/api/projects/${opened.project.id}/release-requests/${ref}`,
    );
    return { opened, element: opened.page, read };
  }

  it('marks the request as loading, then says it could not be read, with Retry', async () => {
    const recorded = await goldenMaster(EVERY_STATE, 'getProjectReleaseRequest');
    const { opened, element, read } = await render(recorded.request.qualifiedId);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loading');
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This release request could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('error');
  });

  it('reads the request again on Retry', async () => {
    const recorded = await goldenMaster(EVERY_STATE, 'getProjectReleaseRequest');
    const ref = recorded.request.qualifiedId;
    const { opened, element, read } = await render(ref);
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const view = page.elementLocator(element);
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.settled();
    http.expectOne((r) => r.url.endsWith(`/release-requests/${ref}`)).flush(recorded);
    await opened.settled();
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toMatchTextContent('bump/contract-service');
    expect(element.querySelector('ui-load-failure')?.classList.contains('hidden')).toBe(true);
    // The reads after it answer with errors: only the request is this spec's subject.
    for (let round = 0; round < 3; round++) {
      for (const call of http.match(() => true)) {
        call.flush(null, { status: 500, statusText: 'Server Error' });
      }
      await opened.settled();
    }
  });

  it('says so when the project has no such request', async () => {
    const { opened, element, read } = await render('no-such-request');
    read.flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(element);
    await expect
      .element(view)
      .toMatchTextContent('This project has no release request no-such-request.');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('not-found');
  });

  it('draws a refolded request’s fold as a branch graph under its sources', async () => {
    const { element } = await shown('a refolded release request', 'commits');
    const graph = page.elementLocator(element).getByRole('region', {
      name: 'What this release folds in',
    });
    await expect.element(graph).toMatchTextContent('feature/export');
    await expect.element(graph).toMatchScreenshot('refolded-graph');
  });

  it('shows a pending request: head, facts and its lifecycle', async () => {
    const { opened, view } = await shown('a release request awaiting approval');
    // The head names what the request carries (qits-1673): its items where the recording has
    // them, else its sources; `bump/contract-service` is among both. Who asked is its
    // participants, which a recording before qits-projects 2026.1028.230057 does not hold.
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toMatchTextContent('bump/contract-service');
    await expect.element(view).toMatchTextContent(/asked by /);
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('pending');
  });

  it('offers Approve and Decline while a person must approve', async () => {
    const { view } = await shown('a release request awaiting approval');
    // The requirement line, then both actions: the recorded viewer is eligible for it.
    await expect.element(view).toMatchTextContent('configured by manual-review');
    await expect.element(view.getByRole('button', { name: 'Approve release' })).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Decline release' })).toBeVisible();
  });

  it('counts the commits its fold brought in on the Commits tab', async () => {
    const { view } = await shown('a release request awaiting approval');
    const tabs = view.getByRole('navigation', { name: 'Release request views' });
    await expect.element(tabs.getByRole('link', { name: /Commits/ })).toMatchTextContent('3');
  });

  it('reads and counts the runs once the CI runs tab opens', async () => {
    const { view } = await shown('a release request awaiting approval', 'runs', 1140, true);
    const tabs = view.getByRole('navigation', { name: 'Release request views' });
    // The request names its QA run, its CI verdicts and its two automations' runs; qits-ci's list
    // tells what its QA run is (the recorded release run, still running).
    await expect.element(tabs.getByRole('link', { name: /Builds/ })).toMatchTextContent(/\d/);
    const builds = view.getByRole('heading', { name: 'Builds' });
    await expect.element(builds).toBeVisible();
    await expect.element(view).toMatchTextContent('2026.101.120000');
    await expect.element(view).toMatchTextContent('running');
    // The head links that running run.
    await expect.element(view.getByRole('link', { name: 'CI running' })).toBeVisible();
  });

  it('shows a released request with its version and what it published', async () => {
    const { opened, view } = await shown('a released release request');
    await expect.element(view).toMatchTextContent('2026.101.100500');
    await expect.element(view.getByRole('heading', { name: 'What it published' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('released');
  });

  it('shows the paths a conflicted request could not fold', async () => {
    const recorded = await goldenMaster('a conflicted release request', 'getReleaseRequest');
    const { opened, view } = await shown('a conflicted release request');
    await expect.element(view).toMatchTextContent(recorded.request.conflict.conflicts[0].path);
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('conflicted');
  });
});
