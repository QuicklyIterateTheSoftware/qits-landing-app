import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';

/** qits-ci's page origin (configuration, not data): nothing on the page links it any more. */
const CI = 'https://ci.example.test';

/**
 * Screenshots of a CI run's page inside the shell (`openRoute`, qits-2321), answered with
 * qits-projects' "a project with 3 repositories" and qits-ci's runs of contract-service (…0005,
 * one of those repositories): "a finished run of the project" (FAILED: a truncated build, coloured
 * unit tests, integration tests killed by OOM with exit 137; one test-results report), "a running
 * run of the project" (a finished build and the live step) and "a queued run of the project"
 * (second in the queue). qits-ci records no payload for the finished run's report, so its full read
 * is refused (404: an error answer is only a status) and the report shows its highlights. The open
 * project is the recorded one ("a project exists"), found by the URL's slug in the recorded project
 * list.
 *
 * A run qits-ci does not have ("no run with the given id", 404) is the not-found state, reached as
 * a person reaches it: from the finished run's "Re-run of", whose run no recording holds.
 */
const REPOSITORIES = 'a project with 3 repositories';
const FINISHED = 'a finished run of the project';
const RUNNING = 'a running run of the project';
const QUEUED = 'a queued run of the project';
const NO_RUN = 'no run with the given id';

/** The run ids the recordings name (each state's `runId`, …0006 in all three). */
const RUN_ID = '00000000-0000-4000-8000-000000000006';
/** The run the finished run re-runs (its `retryOfRunId`), which no recording holds. */
const RETRY_OF = '00000000-0000-4000-8000-000000000002';

describe('CiRunPage (screenshots)', () => {
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

  /** The run's page at `query`, its reads still open. */
  async function open(query = '', runId = RUN_ID) {
    await page.viewport(1140, 900);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/ci/runs/${runId}${query}`,
    );
    return {
      opened,
      repositories: () =>
        http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
      run: (id = runId) => http.expectOne(`/ci/api/runs/${id}`),
    };
  }

  /** The run's page at `query`, every read answered from the recordings of `state`. */
  async function render(state: string, query = '') {
    const reads = await open(query);
    reads.repositories().flush(await goldenMaster(REPOSITORIES, 'listProjectRepositories'));
    reads.run().flush(await goldenMaster(state, 'getRun', 'qits-ci'));
    await reads.opened.settled();
    if (state === FINISHED) await answerReports(reads.opened);
    return reads.opened;
  }

  /** The finished run's reports, and its report's full read refused (none recorded). */
  async function answerReports(opened: OpenedRoute) {
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/reports`)
      .flush(await goldenMaster(FINISHED, 'listRunReports', 'qits-ci'));
    await opened.settled();
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/reports/00000000-0000-4000-8000-000000000004`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
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

  const step = (opened: OpenedRoute, key: string) =>
    opened.page.querySelector<HTMLElement>(`[data-step="${key}"]`)!;
  const expanded = (opened: OpenedRoute, key: string) =>
    step(opened, key).querySelector('button')!.getAttribute('aria-expanded');

  it('shows a finished run: its facts, its failed step open in colour, the cut build and its reports', async () => {
    const opened = await render(FINISHED);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('CI run');
    expect(expanded(opened, '2')).toBe('true');
    expect(expanded(opened, '0')).toBe('false');
    expect(step(opened, '2').textContent).toContain('killed by OOM (LEASE)');
    const fail = [...step(opened, '2').querySelectorAll('[data-output] span')].find(
      (span) => span.textContent === 'FAIL',
    );
    expect(fail?.classList.contains('text-danger')).toBe(true);
    // The sidebar's CI entry stays current below it.
    await expect
      .element(page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'CI' }))
      .toHaveAttribute('aria-current', 'page');
    // Open the cut build too: its note says only the tail is shown.
    await view.getByRole('button', { name: /^0\s*build/ }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ci/runs/${RUN_ID}?step=0&step=2`,
    );
    await expect
      .element(view.getByText('Showing the last 64 KiB of this step’s output.'))
      .toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect.element(view).toMatchTextContent('128 tests, none failed');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('finished', { kind: 'DATA' });
    await shootShellMenus(opened, 'finished');
  });

  it('shows a running run with its live step open, and Cancel asked once confirmed', async () => {
    const opened = await render(RUNNING);
    const view = page.elementLocator(opened.page);
    expect(expanded(opened, 'live')).toBe('true');
    await expect
      .element(page.elementLocator(step(opened, 'live')))
      .toMatchTextContent('pushed layer 3 of 7');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('running', { kind: 'DATA' });
    await view.getByRole('button', { name: 'Cancel' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Confirm cancel?' }).click();
    await opened.settled();
    // qits-ci takes a cancel with an empty 202 (its recording's body is none). The golden-master
    // guard lets only an empty 204 through, which the page reads the same way: taken.
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/cancel`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await opened.settled();
    http
      .expectOne(`/ci/api/runs/${RUN_ID}`)
      .flush(await goldenMaster(RUNNING, 'getRun', 'qits-ci'));
    await opened.settled();
    await expect.element(view.getByRole('status')).toMatchTextContent('Cancel asked');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('cancel-asked', { kind: 'DATA' });
  });

  it('says why a cancel was refused', async () => {
    const opened = await render(RUNNING);
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Cancel' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Confirm cancel?' }).click();
    await opened.settled();
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/cancel`)
      .flush(null, { status: 409, statusText: 'Conflict' });
    await opened.settled();
    http
      .expectOne(`/ci/api/runs/${RUN_ID}`)
      .flush(await goldenMaster(RUNNING, 'getRun', 'qits-ci'));
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This run had already finished, so there was nothing to stop.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('cancel-refused', { kind: 'ERROR' });
  });

  it('says a queued run waits for a CI slot, with its place and expected start', async () => {
    const opened = await render(QUEUED);
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Waiting for a CI slot: #2 in the queue.');
    await expect.element(view).toMatchTextContent('in about 4 min');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('queued', { kind: 'DATA' });
  });

  it('opens the run a finished run re-runs, which is not in this project, and goes back to CI', async () => {
    const opened = await render(FINISHED);
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: RETRY_OF.slice(0, 8) }).click();
    await opened.settled();
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci/runs/${RETRY_OF}`);
    http
      .expectOne(`/ci/api/runs/${RETRY_OF}`)
      .flush(await goldenMaster(NO_RUN, 'getRun', 'qits-ci'), {
        status: 404,
        statusText: 'Not Found',
      });
    await opened.settled();
    await expect.element(view).toMatchTextContent(`No run ${RETRY_OF} in this project.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
    await view.getByRole('link', { name: 'Back to CI' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci`);
  });

  it('opens the new run after Run again', async () => {
    const opened = await render(FINISHED);
    await page.elementLocator(opened.page).getByRole('button', { name: 'Run again' }).click();
    await opened.settled();
    const retried = await goldenMaster<{ runId: string }>(FINISHED, 'retryRun', 'qits-ci');
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/retry`)
      .flush(retried, { status: 202, statusText: 'Accepted' });
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ci/runs/${retried.runId}`,
    );
  });

  it('says why Run again was refused', async () => {
    const opened = await render(FINISHED);
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Run again' }).click();
    await opened.settled();
    http
      .expectOne(`/ci/api/runs/${RUN_ID}/retry`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('You may not run this pipeline again (403).');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('retry-refused', { kind: 'ERROR' });
  });

  it('opens the run’s repository’s CI page', async () => {
    const opened = await render(QUEUED);
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-service', exact: true })
      .click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci/contract-service`);
  });

  it('goes back to the project’s CI page from “← CI”', async () => {
    const opened = await render(QUEUED);
    await page.elementLocator(opened.page).getByRole('link', { name: '← CI' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ci`);
  });

  it('opens the release request the run is for', async () => {
    const opened = await render(QUEUED);
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'contract-service-rr-7' })
      .click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/release-requests/00000000-0000-4000-8000-000000000004`,
    );
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
    reads.run().flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This CI run could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
