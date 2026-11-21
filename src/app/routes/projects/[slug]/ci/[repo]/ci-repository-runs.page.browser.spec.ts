import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';

/** qits-ci's page origin (configuration, not data): nothing on the page links it any more. */
const CI = 'https://ci.example.test';

/**
 * Screenshots of a repository's CI page inside the shell (`openRoute`, qits-2320), answered with
 * qits-projects' "a project with 3 repositories" and qits-ci's "a repository of the project with a
 * run history": contract-service's six runs, newest first: RUNNING, SUCCESS and SUCCESS (a push)
 * on main, FAILED on main, CANCELLED (deduped, superseded by that FAILED run) and FAILED on
 * `feature/csv-export`. "a repository of the project with no runs" answers the empty page. The open
 * project is the recorded one ("a project exists"), found by the URL's slug in the recorded
 * project list.
 */
const REPOSITORIES = 'a project with 3 repositories';
const HISTORY = 'a repository of the project with a run history';
const NONE = 'a repository of the project with no runs';

/** Whether a request is qits-ci's `listRuns`. */
const isRunsRead = (request: { url: string }) => /^\/ci\/api\/runs(\?|$)/.test(request.url);

describe('CiRepositoryRunsPage (screenshots)', () => {
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

  /** The page of `repo` at `query`, its reads still open. */
  async function open(query = '', repo = 'contract-service') {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/ci/${repo}${query}`);
    return {
      opened,
      repositories: () =>
        http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
      runs: () => http.expectOne(isRunsRead),
    };
  }

  /** contract-service's page at `query`, every read answered from the recordings. */
  async function render(query = '', runs = HISTORY) {
    const reads = await open(query);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await reads.opened.settled();
    reads.runs().flush(await goldenMaster(runs, 'listRuns', 'qits-ci'));
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

  /** How many runs the page lists. */
  const listed = (opened: OpenedRoute) => opened.page.querySelectorAll('[data-run]').length;

  it('lists the repository’s runs newest first, the one in flight first', async () => {
    const opened = await render();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('contract-service');
    expect(listed(opened)).toBe(6);
    const rows = opened.page.querySelectorAll<HTMLElement>('[data-run]');
    expect(rows[0].querySelector('[data-duration]')?.textContent?.trim()).toBe('running');
    expect(rows[4].querySelector('[data-superseded-by]')?.getAttribute('href')).toBe(
      `/projects/${opened.project.slug}/ci/runs/00000000-0000-4000-8000-000000000003`,
    );
    expect(rows[5].textContent).toContain('feature/csv-export');
    // The sidebar's CI entry stays current below it.
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'CI' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(view.getByRole('link', { name: '← CI' }))
      .not.toHaveAttribute('aria-current');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('runs', { kind: 'DATA' });
    await shootShellMenus(opened, 'runs');
  });

  it('keeps the runs in ?status=', async () => {
    const opened = await render('?status=FAILED');
    expect(listed(opened)).toBe(2);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered', { kind: 'DATA' });
  });

  it('writes the branch filter into the URL as it is typed', async () => {
    const opened = await render();
    const field = page.elementLocator(opened.page).getByRole('searchbox', {
      name: 'Filter by branch',
    });
    await userEvent.fill(field, 'CSV');
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ci/contract-service?branch=CSV`,
    );
    expect(listed(opened)).toBe(1);
  });

  it('says when no run matches, and clears the filters', async () => {
    const opened = await render('?branch=nothing-like-it');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No run matches.');
    expect(listed(opened)).toBe(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-match', { kind: 'DATA' });
    await view.getByRole('link', { name: 'Clear filters' }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci/contract-service`);
    expect(listed(opened)).toBe(6);
  });

  it('says the repository has no runs yet', async () => {
    const opened = await render('', NONE);
    await expect
      .element(page.elementLocator(opened.page))
      .toMatchTextContent('No CI runs for this repository yet.');
    expect(listed(opened)).toBe(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('says the project has no repository of an unknown name, and reads no runs', async () => {
    const reads = await open('', 'no-such-repository');
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await reads.opened.settled();
    http.expectNone(isRunsRead);
    const view = page.elementLocator(reads.opened.page);
    await expect
      .element(view)
      .toMatchTextContent('No repository no-such-repository in this project.');
    await expect.element(view.getByRole('link', { name: 'Back to CI' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'Back to CI' }))
      .not.toHaveAttribute('aria-current');
    await expect
      .element(page.elementLocator(reads.opened.frame))
      .toMatchScreenshot('unknown-repository', { kind: 'NO_DATA' });
  });

  it('leave-ci-repository ci: “← CI” opens the project’s CI page', async () => {
    const opened = await render();
    await page.elementLocator(opened.page).getByRole('link', { name: '← CI' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci`);
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
    reads.runs().flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This repository’s CI runs could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
