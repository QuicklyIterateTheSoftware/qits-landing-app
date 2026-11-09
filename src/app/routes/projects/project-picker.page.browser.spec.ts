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

  // Skipped: no recorded state holds this list, and the guard refuses a hand-made one. qits-projects'
  // states "two projects exist" and "no projects exist" (release request e9451cf1) replace it.
  it.skip('shows one card per project', async () => {
    const { opened, list } = await render();
    // qits-projects' recorded list, plus a second project derived from its one project (another
    // id, name and slug), so the grid shows two cards. No recording holds two projects.
    const recorded = await goldenMaster('a project exists', 'listProjects');
    const project = recorded.entries[0].project;
    const other = {
      ...project,
      id: '00000000-0000-4000-8000-0000000000ff',
      name: 'Other',
      slug: 'other',
    };
    // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- waits for qits-projects states (release request e9451cf1)
    list.flush({ ...recorded, entries: [...recorded.entries, { project: other }] });
    await opened.settled();
    const repositories = await goldenMaster(
      'a project with 3 repositories',
      'listProjectRepositories',
    );
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    http
      .expectOne(`/projects/api/projects/${other.id}/repositories`)
      // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- waits for qits-projects states (release request e9451cf1)
      .flush({ ...repositories, entries: repositories.entries.slice(0, 1) });
    http
      .expectOne(`/projects/api/projects/${project.id}/work`)
      .flush(await goldenMaster('a project with refined work', 'listProjectWork'));
    http
      .expectOne(`/projects/api/projects/${other.id}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    // The cards stay collapsed, so no lines are requested.
    http.expectNone('/githost/api/loc');
    await opened.settled();
    const picker = page.elementLocator(opened.page);
    await expect.element(picker).toMatchTextContent('Work 3');
    await expect.element(picker).toMatchTextContent('Components 1');
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('loaded');
  });

  // Skipped: no recorded state holds this list, and the guard refuses a hand-made one. qits-projects'
  // states "two projects exist" and "no projects exist" (release request e9451cf1) replace it.
  it.skip('says so when there are no projects', async () => {
    const { opened, list } = await render();
    // qits-projects' recorded list with its one entry removed. No recording is empty.
    const recorded = await goldenMaster('a project exists', 'listProjects');
    // eslint-disable-next-line qits/browser-spec-data-from-golden-masters -- waits for qits-projects states (release request e9451cf1)
    list.flush({ ...recorded, entries: [] });
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
