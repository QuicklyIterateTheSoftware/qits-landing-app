import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';

/** qits-ci's page origin (configuration, not data): nothing on the page links it any more. */
const CI = 'https://ci.example.test';

/**
 * Screenshots of the project's CI page inside the shell (`openRoute`, qits-2314), answered with
 * qits-projects' "a project with 3 repositories" (the wrapper, contract-daemon, contract-frontend,
 * contract-service) and qits-ci's "a project whose repositories have runs", whose summaries name
 * the same repository ids: the wrapper's newest run FAILED on main, contract-daemon's SUCCESS,
 * contract-frontend's FAILED on `feature/csv-export` (its newest on main SUCCESS), and
 * contract-service RUNNING, the one active run. The open project is the recorded one ("a project
 * exists"), found by the URL's slug in the recorded project list.
 *
 * The page with no run at all ("No CI runs for this project yet") is qits-ci's "runs only of
 * repositories outside the project": its summaries and its one active run are all of repositories
 * the project does not hold, so the join leaves every row without a run. ("no runs recorded" answers
 * empty lists, which the pact cannot bind against the provider's shared database, so it is not
 * pacted and the golden-master guard refuses it here.)
 */
const REPOSITORIES = 'a project with 3 repositories';
const RUNS = 'a project whose repositories have runs';
const OUTSIDE = 'runs only of repositories outside the project';

describe('CiRunsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAppRoute(), provideTestPlatformOrigins({}, { ci: CI })],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project at `query`, its three reads still open. */
  async function open(query = '') {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/ci${query}`);
    return {
      opened,
      repositories: () =>
        http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
      summaries: () => http.expectOne('/ci/api/repositories/summary'),
      active: () => http.expectOne('/ci/api/runs/active'),
    };
  }

  /** The page at `query`, every read answered from the recordings, qits-ci's in `runs`. */
  async function render(query = '', runs = RUNS) {
    const reads = await open(query);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await reads.opened.settled();
    reads.summaries().flush(await goldenMaster(runs, 'listRepositorySummaries', 'qits-ci'));
    reads.active().flush(await goldenMaster(runs, 'listActiveRuns', 'qits-ci'));
    await reads.opened.settled();
    return reads.opened;
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's. Answers in rounds,
   * until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  /** The repositories the page lists, in its order. */
  const listed = (opened: OpenedRoute) =>
    [...opened.page.querySelectorAll('[data-ci-row] > a:first-child')].map((a) =>
      a.textContent?.trim(),
    );

  it('lists each repository with its newest runs, and the run in flight above them', async () => {
    const opened = await render();
    const view = page.elementLocator(opened.page);
    // Every run was queued at the same recorded instant, so qits-projects' order stays.
    expect(listed(opened)).toEqual([
      'contract-00000001-contract-00000001',
      'contract-daemon',
      'contract-frontend',
      'contract-service',
    ]);
    const running = view.getByRole('region', { name: 'Running now' });
    await expect.element(running).toMatchTextContent('contract-service');
    await expect.element(running).toMatchTextContent('running');
    const frontend = opened.page.querySelectorAll('[data-ci-row]')[2];
    expect(frontend.textContent).toContain('feature/csv-export');
    expect(frontend.querySelector('[data-main-run]')?.textContent).toContain('success');
    // A repository's name opens its CI page here (qits-2320), the wrapper's like every other; a
    // run opens its page here (qits-2321).
    const [wrapper, daemon] = opened.page.querySelectorAll<HTMLAnchorElement>(
      '[data-ci-row] > a:first-child',
    );
    expect(daemon.getAttribute('href')).toBe(`/projects/${opened.project.slug}/ci/contract-daemon`);
    expect(wrapper.getAttribute('href')).toBe(
      `/projects/${opened.project.slug}/ci/contract-00000001-contract-00000001`,
    );
    expect(opened.page.querySelector('[data-active-run] a')?.getAttribute('href')).toBe(
      `/projects/${opened.project.slug}/ci/runs/00000000-0000-4000-8000-00000000000c`,
    );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('runs', { kind: 'DATA' });
    await shootShellMenus(opened, 'runs');
  });

  it('keeps the repositories whose newest run is in ?status=', async () => {
    const opened = await render('?status=FAILED');
    expect(listed(opened)).toEqual(['contract-00000001-contract-00000001', 'contract-frontend']);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered', { kind: 'DATA' });
  });

  it('open-ci-repository repository: a repository’s name opens its CI page', async () => {
    const opened = await render();
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-daemon', exact: true })
      .click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci/contract-daemon`);
  });

  it('writes the repository filter into the URL as it is typed', async () => {
    const opened = await render();
    const field = page.elementLocator(opened.page).getByRole('searchbox', {
      name: 'Filter by repository',
    });
    await userEvent.fill(field, 'FRONT');
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci?repository=FRONT`);
    expect(listed(opened)).toEqual(['contract-frontend']);
  });

  it('says when no repository matches, and clears the filters', async () => {
    const opened = await render('?repository=nothing-like-it');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No repository matches.');
    expect(listed(opened)).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-match', { kind: 'DATA' });
    await view.getByRole('link', { name: 'Clear filters' }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci`);
    expect(listed(opened)).toHaveLength(4);
  });

  it('says the project has no runs when every run is of a repository outside it', async () => {
    const opened = await render('', OUTSIDE);
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No CI runs for this project yet.');
    expect(listed(opened)).toHaveLength(4);
    for (const row of opened.page.querySelectorAll('[data-ci-row]')) {
      expect(row.textContent).toContain('No runs yet');
    }
    // The one active run is of a repository outside the project: Running now stays hidden.
    const running = opened.page.querySelector<HTMLElement>(
      'section[aria-labelledby="ci-running-now"]',
    );
    expect(running?.className).toContain('hidden');
    expect(running?.getClientRects()).toHaveLength(0);
    expect(opened.page.querySelectorAll('[data-active-run]')).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const reads = await open();
    const { opened } = reads;
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await opened.settled();
    reads.summaries().flush(null, { status: 500, statusText: 'Server Error' });
    reads.active().flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This project’s CI runs could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
