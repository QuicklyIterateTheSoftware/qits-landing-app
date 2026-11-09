import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../testing/browser/app-route';

/**
 * Screenshots of the start page inside the shell (`openRoute`), at `/projects`. The answers are
 * qits-projects' and qits-githost's golden masters, read on the Node side through the
 * `goldenMaster` command.
 */

describe('ProjectPickerPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page at `/projects`, with the project list requested, not answered: the frame's own. */
  async function render() {
    const opened = await openRoute('/projects', { projects: 'unanswered' });
    return { opened, list: http.expectOne('/projects/api/projects') };
  }

  it('shows that the projects are loading', async () => {
    const { opened, list } = await render();
    const picker = page.elementLocator(opened.page);
    await expect.element(picker.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loading');
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
  });

  it('shows one card per project', async () => {
    const { opened, list } = await render();
    const recorded = await goldenMaster('two projects exist', 'listProjects');
    list.flush(recorded);
    await opened.settled();
    const [first, second] = recorded.entries.map(
      (entry: { project: { id: string } }) => entry.project.id,
    );
    // "two projects exist" records the first project's repositories and work; the second's come
    // from the states that record a project with one repository and a project with no work.
    http
      .expectOne(`/projects/api/projects/${first}/repositories`)
      .flush(await goldenMaster('two projects exist', 'listProjectRepositories'));
    http
      .expectOne(`/projects/api/projects/${second}/repositories`)
      .flush(await goldenMaster('a project with one repository', 'listProjectRepositories'));
    http
      .expectOne(`/projects/api/projects/${first}/work`)
      .flush(await goldenMaster('two projects exist', 'listProjectWork'));
    http
      .expectOne(`/projects/api/projects/${second}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    // The cards stay collapsed, so no lines are requested.
    http.expectNone('/githost/api/loc');
    await opened.settled();
    const cards = page.elementLocator(opened.page).getByRole('listitem');
    await expect.element(cards.nth(0)).toMatchTextContent('qits');
    await expect.element(cards.nth(0)).toMatchTextContent('Work 2');
    await expect.element(cards.nth(0)).toMatchTextContent('Components 3');
    await expect.element(cards.nth(1)).toMatchTextContent('telemetry');
    await expect.element(cards.nth(1)).toMatchTextContent('Work 0');
    await expect.element(cards.nth(1)).toMatchTextContent('Components 2');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loaded');
  });

  it('says so when there are no projects', async () => {
    const { opened, list } = await render();
    list.flush(await goldenMaster('no projects exist', 'listProjects'));
    await opened.settled();
    const picker = page.elementLocator(opened.page);
    await expect.element(picker).toMatchTextContent('There are no projects yet.');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('empty');
  });

  it('marks the list as failed to load when the projects could not be loaded', async () => {
    const { opened, list } = await render();
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    const picker = page.elementLocator(opened.page);
    await expect.element(picker.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('error');
  });
});
