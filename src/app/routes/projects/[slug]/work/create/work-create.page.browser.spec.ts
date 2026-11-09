import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of the work create form (epic qits-888) inside the shell (`openRoute`; the form sits
 * outside the work tabs), opened from "a project with ideas"' idea (its `getIdea`) as Create epic
 * and Create ticket open it.
 */
describe('WorkCreatePage (screenshots)', () => {
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
    // As wide as the form was, plus the sidebar.
    await page.viewport(1140, 900);
    return openRoute((project) => `/projects/${project.slug}/${path}`);
  }

  it.each(['EPIC', 'TICKET'])('is filled from an idea as a new %s', async (archetype) => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const query = new URLSearchParams({
      archetype,
      title: idea.title,
      description: idea.description,
      inspiredBy: idea.id,
    });
    const opened = await open(`work/create?${query}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    await expect.element(page.elementLocator(opened.page)).toMatchTextContent('Inspired by');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot(`from-idea-${archetype.toLowerCase()}`);
  });
});
