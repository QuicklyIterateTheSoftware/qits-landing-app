import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { workLink } from '$core/work/work-briefs';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { openRoute, provideAppRoute, type OpenedRoute } from '../../../testing/browser/app-route';
import { shootShellMenus } from '../../../testing/browser/shell-menus';

const ADMIN = 'a toggle is declared, asked by an admin';
const RETIRING = 'a toggle has an open removal ticket, asked by an admin';
const TOGGLES = 'qits-toggles';
const LIST = '/toggles/api/toggles';

/**
 * Screenshots of the Toggles section's list (qits-2704) inside the shell (`openRoute`), with no
 * project open, its one read (`getToggles`) answered with qits-toggles' recording "a toggle is
 * declared, asked by an admin" (the smoke toggle, its one STATIC rule, never used by a deployed pact,
 * no removal ticket), or with "a toggle has an open removal ticket, asked by an admin" (qits-2726:
 * last used at the frozen instant, its removal ticket `qits-1` a link to the item). A read still open
 * (`loading`) and a 500 (`unavailable`) are statuses only. No recording holds an empty list, so the
 * empty sentence is the plain spec's.
 *
 * The page offers no create control: a toggle exists by its declaration in qits-toggles-service's
 * code.
 */
describe('TogglesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    // The app's own work link (`open-work-ref:opened`, `app.config.ts`' `provideWorkReferences()`),
    // so the removal ticket links to the item's page.
    TestBed.configureTestingModule({ providers: [provideAppRoute(), workLink] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  async function open(): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    return openRoute('/toggles');
  }

  async function answer(opened: OpenedRoute, state = ADMIN) {
    http.expectOne(LIST).flush(await goldenMaster(state, 'getToggles', TOGGLES));
    await opened.settled();
  }

  it('lists the declared toggles with their rules in brief, and creates none', async () => {
    const opened = await open();
    await answer(opened);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'Toggles', exact: true })).toBeVisible();
    await expect.element(view).toMatchTextContent('1 declared toggle');
    const table = view.getByRole('table', { name: 'Toggles' });
    await expect.element(table.getByRole('link', { name: 'toggles-smoke' })).toBeVisible();
    await expect.element(table).toMatchTextContent('else off');
    await expect.element(table).toMatchTextContent('never by a deployed pact');
    expect(table.getByRole('link', { name: 'qits-1' }).elements()).toHaveLength(0);
    expect(view.getByRole('button', { name: /new|create|add/i }).elements()).toHaveLength(0);
    // The root sidebar's Toggles is current on its page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'Toggles', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('toggles', { kind: 'DATA' });
    await shootShellMenus(opened, 'toggles');
  });

  it('shows when a deployed pact last used a toggle, and links its removal ticket', async () => {
    const opened = await open();
    await answer(opened, RETIRING);
    const table = page.elementLocator(opened.page).getByRole('table', { name: 'Toggles' });
    await expect.element(table).toMatchTextContent('1 Jan 2026 00:00:00Z');
    await expect
      .element(table.getByRole('link', { name: 'qits-1' }))
      .toHaveAttribute('href', '/projects/qits/work/detail/qits-1');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('removal-ticket', { kind: 'DATA' });
  });

  it('marks the page as loading, then says the toggles cannot be read, with Retry', async () => {
    const opened = await open();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(LIST).flush(null, { status: 500, statusText: 'Internal Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The toggles cannot be read right now.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answer(opened);
    await expect.element(view.getByRole('table', { name: 'Toggles' })).toBeVisible();
  });
});
