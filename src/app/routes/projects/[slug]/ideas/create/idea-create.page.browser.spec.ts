import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of the new idea form (epic qits-888) inside the shell (`openRoute`): the enabling
 * choice from "a project with ideas"' list, and a refusal answered with that state's recorded 400
 * (a title of three sentences).
 */
describe('IdeaCreatePage (screenshots)', () => {
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

  it('shows the form with its counts, and the service’s refusal', async () => {
    const opened = await open('ideas/create');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('0/3 paragraphs');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('form');
    await view
      .getByRole('textbox', { name: 'Title' })
      .fill('Faster builds. Fewer waits. Less cost');
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.settled();
    http
      .expectOne('/projects/api/ideas')
      .flush(await goldenMaster(IDEAS, 'createIdea'), { status: 400, statusText: 'Bad Request' });
    await opened.settled();
    await expect.element(view.getByRole('alert')).toMatchTextContent('at most one');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('refused');
  });
});
