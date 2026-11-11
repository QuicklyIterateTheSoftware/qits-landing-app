import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { commands, page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the Repositories page inside the shell (`openRoute`), answered with qits-projects'
 * recording of "a project with repositories in components": the wrapper on top,
 * `components/billing` and `components/contract` below, and every backup state. The open project is
 * the recorded one ("a project exists"), found by the URL's slug in the recorded project list.
 */

const STATE = 'a project with repositories in components';

describe('ProjectRepositoriesPage (screenshots)', () => {
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

  async function render() {
    // Tall enough for the whole tree: a screenshot shows only what is in the viewport.
    await page.viewport(1140, 1200);
    const opened = await openRoute((project) => `/projects/${project.slug}/repositories`);
    return {
      opened,
      request: http.expectOne(`/projects/api/projects/${opened.project.id}/repositories`),
    };
  }

  it('lays the repositories out like the wrapper, with every backup state', async () => {
    const { opened, request } = await render();
    request.flush(await goldenMaster(STATE, 'listProjectRepositories'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: 'components/' })).toBeVisible();
    await expect.element(view.getByRole('heading', { name: 'contract/' })).toBeVisible();
    await expect.element(view).toMatchTextContent('Succeeded');
    await expect.element(view).toMatchTextContent('Auth needed');
    await expect.element(view).toMatchTextContent('No twin');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('tree', { kind: 'DATA' });
  });

  it('shows a card’s clone URL, backup URL and main branch when opened', async () => {
    const { opened, request } = await render();
    request.flush(await goldenMaster(STATE, 'listProjectRepositories'));
    await opened.settled();
    await page
      .elementLocator(opened.page)
      .getByRole('button', { name: 'Show more' })
      .first()
      .click();
    // The pointer stays on the button after the click; its hover colour would vary the screenshot.
    await commands.parkPointer();
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('https://githost.example.test/git/');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('opened', { kind: 'DATA' });
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { opened, request } = await render();
    const view = page.elementLocator(opened.page);
    const frame = page.elementLocator(opened.frame);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('loading', { kind: 'PENDING' });
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(frame).toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
