import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of the Ideas page (epic qits-888) inside the shell (`openRoute`), answered with
 * qits-projects' recordings: "a project with ideas"' list (a queued and a planned idea). The open
 * project is "a project exists"'. Both ideas are rankable (qits-1791), so each row has a drag
 * handle on its bottom-right corner; an archived or DONE idea's missing handle is the unit spec's,
 * as no recorded list holds one.
 */
describe('ProjectIdeasPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page at `path` below the recorded project ("a project exists"). */
  async function open(path: string) {
    await page.viewport(1140, 900);
    return openRoute((project) => `/projects/${project.slug}/${path}`);
  }

  /** The list read: the generated client writes its query into the URL. */
  const listRead = () =>
    http.expectOne((req) => req.urlWithParams.startsWith('/projects/api/ideas?'));

  it('lists the ideas with their status', async () => {
    const opened = await open('ideas');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Share the build cache');
    // Both recorded ideas are rankable (QUEUED, PLANNED, neither archived): each has a handle.
    await expect.element(view.getByRole('button', { name: 'Move Faster builds' })).toBeVisible();
    await expect
      .element(view.getByRole('button', { name: 'Move Share the build cache' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('list', { kind: 'DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open('ideas');
    const read = listRead();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
