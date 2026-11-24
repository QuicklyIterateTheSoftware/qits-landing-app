import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a bump's old address (qits-2489) inside the shell: it reads qits-maintenance's
 * "a bump that changed nothing" (a bump of contract-service) and replaces itself with the bump's
 * page under that repository (`follow-moved-bump` `bump`). "no such bump" (a 404) says so and
 * links the Components (`components`).
 */
const BUMP_ID = '00000000-0000-4000-8000-000000000001';

describe('BumpRedirectPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 800);
    return openRoute((project) => `/projects/${project.slug}/maintenance/bumps/${BUMP_ID}`);
  }

  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const pending = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of pending) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = pending.length ? 0 : quiet + 1;
    }
  }

  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('follow-moved-bump bump: moves to the bump’s page under its repository', async () => {
    const opened = await open();
    http
      .expectOne(`/maintenance/api/bumps/${BUMP_ID}`)
      .flush(await goldenMaster('a bump that changed nothing', 'getBump', 'qits-maintenance'));
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/components/contract-service/bumps/${BUMP_ID}`,
    );
    expect(reached()).toEqual(['follow-moved-bump:bump']);
  });

  it('says an unknown bump has no page, and links the Components', async () => {
    const opened = await open();
    http
      .expectOne(`/maintenance/api/bumps/${BUMP_ID}`)
      .flush(await goldenMaster('no such bump', 'getBump', 'qits-maintenance'), {
        status: 404,
        statusText: 'Not Found',
      });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No bump ${BUMP_ID}, so it has no page here.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'NO_DATA' });
    await shootShellMenus(opened, 'unknown');
    await view.getByRole('link', { name: 'Components' }).click();
    await leftFor(opened);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/components`);
    expect(reached()).toEqual(['follow-moved-bump:components']);
  });
});
