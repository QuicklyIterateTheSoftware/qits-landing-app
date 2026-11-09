import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of a project's Archive inside the shell and the work tabs (`openRoute`), answered
 * with qits-projects' golden masters: the project list as recorded, and "a project with work in
 * every status" (one epic and one ticket per status, DONE and DROPPED included) or "a project with
 * no work" for its work.
 */

describe('WorkArchivePage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // As wide as the page was plus the sidebar, and tall enough for the whole Archive.
    await page.viewport(1040, 1000);
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  /** The Archive of the recorded project, with its work requested. */
  async function shown() {
    const opened = await openRoute((project) => `/projects/${project.slug}/work/archive`);
    const work = http.expectOne(`/projects/api/projects/${opened.project.id}/work`);
    return { opened, work, element: page.elementLocator(opened.page) };
  }

  it('shows the work in a final state', async () => {
    const { opened, work, element } = await shown();
    work.flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
    await opened.settled();
    await expect.element(element.getByRole('heading', { level: 1 })).toMatchTextContent('Archive');
    await expect.element(element).toMatchTextContent('Done ticket');
    await expect.element(element).toMatchTextContent('Dropped epic');
    await expect.element(element).not.toMatchTextContent('Reported ticket');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('archive');
  });

  it('says so when nothing is archived', async () => {
    const { opened, work, element } = await shown();
    work.flush(await goldenMaster('a project with no work', 'listProjectWork'));
    await opened.settled();
    await expect.element(element).toMatchTextContent('Nothing here');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('empty');
  });

  it('shows that the work is loading', async () => {
    const { opened, work, element } = await shown();
    await expect.element(element.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });

  it('marks the work as failed to load', async () => {
    const { opened, work, element } = await shown();
    work.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(element.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('error');
  });
});
