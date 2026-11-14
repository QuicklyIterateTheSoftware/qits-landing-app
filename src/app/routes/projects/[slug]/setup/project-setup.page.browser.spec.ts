import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

/**
 * Screenshots of a project's Setup page inside the shell (`openRoute`), which names the project
 * under its heading: answered with qits-projects' recorded project list and project ("a project
 * exists"; the page reads the project by the id the list gives its slug, qits-2146), failed, and
 * for a slug that list does not hold.
 */

describe('ProjectSetupPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page for `slug` (the recorded project's by default), with the project list requested,
   *  which is also the frame's own: left to `answer` to flush. */
  async function render(slug?: string) {
    const recorded = await goldenMaster('a project exists', 'listProjects');
    const opened = await openRoute((project) => `/projects/${slug ?? project.slug}/setup`, {
      projects: 'unanswered',
    });
    const list = http.expectOne('/projects/api/projects');
    const answer = async (
      body: object | null,
      options?: { status: number; statusText: string },
    ) => {
      list.flush(body, options);
      await opened.settled();
    };
    return { opened, recorded, list, answer };
  }

  it('names the project', async () => {
    const { opened, recorded, answer } = await render();
    await answer(recorded);
    // Then the page's own read of the project, by the id the list gives its slug (qits-2146).
    http
      .expectOne(`/projects/api/projects/${opened.project.id}`)
      .flush(await goldenMaster('a project exists', 'getProject'));
    await opened.settled();
    const element = page.elementLocator(opened.page);
    await expect.element(element.getByRole('heading', { name: 'Setup' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('shows that the project is loading', async () => {
    const { opened, list } = await render();
    const element = page.elementLocator(opened.page);
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });

  it('marks the page as failed to load when the projects could not be loaded', async () => {
    const { opened, answer } = await render();
    await answer(null, { status: 500, statusText: 'Server Error' });
    const element = page.elementLocator(opened.page);
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });

  it('marks the page as failed to load when no project has the slug', async () => {
    // qits-projects' recorded list; the URL names a slug that is not in it.
    const { opened, recorded, answer } = await render('unknown');
    await answer(recorded);
    const element = page.elementLocator(opened.page);
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unknown', { kind: 'ERROR' });
  });
});
