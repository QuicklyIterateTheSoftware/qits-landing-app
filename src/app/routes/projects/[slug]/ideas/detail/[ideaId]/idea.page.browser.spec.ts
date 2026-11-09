import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of an idea's page (epic qits-888) inside the shell (`openRoute`), answered with "a
 * project with ideas"' `getIdea`: a queued idea that enables another and inspired an epic. The
 * open project is "a project exists"'.
 */
describe('IdeaPage (screenshots)', () => {
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

  it('shows the idea, what it enables and the work it inspired', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Cache the build dependencies');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('idea');
  });

  it('asks for a reason before it archives', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Archive', exact: true }).click();
    await opened.settled();
    await expect.element(view.getByRole('textbox', { name: 'Reason' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('archiving');
  });
});
