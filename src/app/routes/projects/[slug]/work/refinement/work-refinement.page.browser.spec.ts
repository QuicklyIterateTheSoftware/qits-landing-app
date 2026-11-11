import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of a project's Refinement page (the backlog) inside the shell and the work tabs
 * (`openRoute`), answered with qits-projects' golden masters: the project list as recorded, and "a
 * project with work in every status" (one epic and one ticket per status) or "a project with no
 * work" for its work.
 */

describe('WorkRefinementPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1040, 600);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The page of the recorded project, with its work requested. */
  async function shown() {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/refinement`);
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    return { opened, work, element: page.elementLocator(opened.page) };
  }

  it('shows the work not refined yet', async () => {
    const { opened, work, element } = await shown();
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    await expect
      .element(element.getByRole('heading', { level: 1 }))
      .toMatchTextContent('Refinement');
    await expect.element(element).toMatchTextContent('Reported epic');
    await expect.element(element).toMatchTextContent('Reported ticket');
    await expect.element(element).not.toMatchTextContent('Refined ticket');
    await expect.element(element).not.toMatchTextContent('Done ticket');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('backlog', { kind: 'DATA' });
  });

  it('says so when nothing waits for refinement', async () => {
    const { opened, work, element } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await opened.settled();
    await expect.element(element).toMatchTextContent('Nothing here');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('shows that the work is loading', async () => {
    const { opened, work, element } = await shown();
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });
});
