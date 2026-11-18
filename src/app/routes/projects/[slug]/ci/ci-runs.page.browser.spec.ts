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

/** qits-ci's page origin, so the rows and runs link to its pages (configuration, not data). */
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
 * The page with no run at all ("No CI runs for this project yet") has no screenshot: qits-ci's
 * "no runs recorded" answers empty lists, which the pact would bind as exactly empty while the
 * provider verifies against a shared database, so that state is not pacted and the golden-master
 * guard refuses it here. The plain spec (`ci-runs.page.spec.ts`) shows that state.
 */
const REPOSITORIES = 'a project with 3 repositories';
const RUNS = 'a project whose repositories have runs';

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

  /** The page at `query`, every read answered from the recordings. */
  async function render(query = '') {
    const reads = await open(query);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    await reads.opened.settled();
    reads.summaries().flush(await goldenMaster(RUNS, 'listRepositorySummaries', 'qits-ci'));
    reads.active().flush(await goldenMaster(RUNS, 'listActiveRuns', 'qits-ci'));
    await reads.opened.settled();
    return reads.opened;
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
    // The links lead to qits-ci's pages: a repository by its component, the wrapper by its id.
    const [wrapper, daemon] = opened.page.querySelectorAll<HTMLAnchorElement>(
      '[data-ci-row] > a:first-child',
    );
    expect(daemon.getAttribute('href')).toBe(
      `${CI}/${opened.project.slug}/contract-daemon/contract-daemon`,
    );
    expect(wrapper.getAttribute('href')).toBe(`${CI}/?repo=00000000-0000-4000-8000-000000000002`);
    expect(opened.page.querySelector('[data-active-run] a')?.getAttribute('href')).toBe(
      `${CI}/runs/00000000-0000-4000-8000-00000000000c`,
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
