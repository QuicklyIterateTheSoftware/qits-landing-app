import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of an idea's edit (epic qits-888) inside the shell (`openRoute`): the form filled
 * with "a project with ideas"' `getIdea` (two paragraphs), the enabling choice from that state's
 * list.
 */
describe('IdeaEditPage (screenshots)', () => {
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

  it('fills the form with the idea and counts its description', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}/edit`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('2/3 paragraphs');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('form', { kind: 'DATA' });
  });
});
