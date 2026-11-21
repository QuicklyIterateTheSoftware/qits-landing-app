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

/**
 * Screenshots of a bump's page inside the shell (`openRoute`, qits-2332), at the recorded
 * project's slug (qits-projects' "a project exists"), its one read (`getBump`) answered from
 * qits-maintenance's golden masters: "pending bumps" (…0005, a GROUP bump of contract-frontend
 * that SUCCEEDED, sent one change and was RELEASED), "a bump that changed nothing" (…0001, an
 * entity-diagram automation bump with nothing to do, its sentence and one run), "a failed bump"
 * (…0001, a golden-recordings-maven automation bump that FAILED, its failure and two runs) and "no
 * such bump" (404). A refusal is a 403 with no body, as the service answers a credential without
 * a staff role.
 */
const RELEASED = 'pending bumps';
const NOTHING = 'a bump that changed nothing';
const FAILED = 'a failed bump';
const MISSING = 'no such bump';

/** The bump each state recorded (`releasedBumpId` in "pending bumps", `bumpId` in the others). */
const RELEASED_ID = '00000000-0000-4000-8000-000000000005';
const AUTOMATION_ID = '00000000-0000-4000-8000-000000000001';

describe('MaintenanceBumpPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The bump's page, its read still open; tall enough for every section. */
  async function open(id: string) {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/maintenance/bumps/${id}`,
    );
    return { opened, read: () => http.expectOne(`/maintenance/api/bumps/${id}`) };
  }

  /** The page of the bump `state` recorded, answered. */
  async function render(state: string, id: string) {
    const { opened, read } = await open(id);
    read().flush(await goldenMaster(state, 'getBump', 'qits-maintenance'));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('shows a bump that sent a change and was released', async () => {
    const { opened, view } = await render(RELEASED, RELEASED_ID);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('dependencies · contract-frontend');
    await expect.element(view.getByText('succeeded', { exact: true })).toBeVisible();
    await expect
      .element(view.getByRole('table', { name: 'Changes' }))
      .toMatchTextContent(/@qits\/ui-components/);
    await expect
      .element(view.getByRole('link', { name: '00000000-0000-4000-8000-000000000008' }))
      .toBeVisible();
    await expect.element(view.getByText('RELEASED', { exact: true })).toBeVisible();
    expect(opened.page.querySelector('[data-not-coming]')).toBeNull();
    // The sidebar keeps Maintenance open below it.
    await expect
      .element(
        page.getByRole('navigation', { name: 'qits' }).getByRole('link', { name: 'Maintenance' }),
      )
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('released', { kind: 'DATA' });
    await shootShellMenus(opened, 'released');
  });

  it('shows a bump that changed nothing: its sentence plain, no changes, its run', async () => {
    const { opened, view } = await render(NOTHING, AUTOMATION_ID);
    await expect.element(view.getByText('This bump sent no changes.')).toBeVisible();
    await expect.element(view.getByText(/unchanged: the run passed/)).toBeVisible();
    expect(
      [...opened.page.querySelectorAll('[role="alert"]')].filter((a) => !a.closest('.hidden')),
    ).toEqual([]);
    await expect.element(view.getByRole('link', { name: 'run-contract-1' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('changed-nothing', { kind: 'NO_DATA' });
  });

  it('shows a failed bump: its message as an alert, its failure and both runs', async () => {
    const { opened, view } = await render(FAILED, AUTOMATION_ID);
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(/^the golden recordings \(maven\) run ended FAILED/);
    await expect.element(view.getByText(/GoldenMasterRecordingTest/)).toBeVisible();
    await expect.element(view.getByRole('link', { name: 'run-contract-1' })).toBeVisible();
    await expect.element(view.getByRole('link', { name: 'run-contract-2' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('failed', { kind: 'ERROR' });
  });

  it('says there is no such bump', async () => {
    const { opened, read } = await open(AUTOMATION_ID);
    read().flush(await goldenMaster(MISSING, 'getBump', 'qits-maintenance'), {
      status: 404,
      statusText: 'Not Found',
    });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No bump ${AUTOMATION_ID}.`);
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs a staff role', async () => {
    const { opened, read } = await open(RELEASED_ID);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read().flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert').first())
      .toMatchTextContent('Reading a bump needs a staff role');
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('opens the release request the bump belongs to', async () => {
    const { opened, view } = await render(RELEASED, RELEASED_ID);
    await view.getByRole('link', { name: '00000000-0000-4000-8000-000000000008' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/releases/requests/00000000-0000-4000-8000-000000000008`,
    );
  });

  it('opens the bump’s repository on its maintenance page', async () => {
    const { opened, view } = await render(RELEASED, RELEASED_ID);
    await view.getByRole('link', { name: 'contract-frontend' }).first().click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/maintenance/repositories/contract-frontend`,
    );
  });

  it('opens a run of the bump on its page', async () => {
    const { opened, view } = await render(FAILED, AUTOMATION_ID);
    await view.getByRole('link', { name: 'run-contract-2' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/releases/ci/runs/run-contract-2`,
    );
  });
});
