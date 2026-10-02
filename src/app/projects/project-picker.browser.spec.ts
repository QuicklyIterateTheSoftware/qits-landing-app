import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { commands, page } from 'vitest/browser';
import { client as githostClient } from '../api/githost/client.gen';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import { ProjectPicker } from './project-picker';

/**
 * Screenshots of the start page in a real browser. The answers are qits-projects' and
 * qits-githost's golden masters, read on the Node side through the `goldenMaster` command.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectPicker (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page at the test viewport's width, with the project list requested, not answered. */
  async function render() {
    const fixture = TestBed.createComponent(ProjectPicker);
    fixture.detectChanges();
    await settle();
    return { fixture, list: http.expectOne('/projects/api/projects') };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows that the projects are loading', async () => {
    const { fixture, list } = await render();
    const picker = page.elementLocator(fixture.nativeElement);
    await expect.element(picker.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(picker).toMatchScreenshot('loading');
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('shows one card per project', async () => {
    const { fixture, list } = await render();
    // qits-projects' recorded list, plus a second project derived from its one project (another
    // id, name and slug), so the grid shows two cards. No recording holds two projects.
    const recorded = await commands.goldenMaster('a project exists', 'listProjects');
    const project = recorded.entries[0].project;
    const other = {
      ...project,
      id: '00000000-0000-4000-8000-0000000000ff',
      name: 'Other',
      slug: 'other',
    };
    list.flush({ ...recorded, entries: [...recorded.entries, { project: other }] });
    await settle();
    TestBed.tick();
    await settle();
    const repositories = await commands.goldenMaster(
      'a project with 3 repositories',
      'listProjectRepositories',
    );
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    http
      .expectOne(`/projects/api/projects/${other.id}/repositories`)
      .flush({ ...repositories, entries: repositories.entries.slice(0, 1) });
    http
      .expectOne(`/projects/api/projects/${project.id}/entities`)
      .flush(await commands.goldenMaster('a project with refined work', 'listProjectEntities'));
    http
      .expectOne(`/projects/api/projects/${other.id}/entities`)
      .flush(await commands.goldenMaster('a project with no work', 'listProjectEntities'));
    // The cards stay collapsed, so no lines are requested.
    http.expectNone('/githost/api/loc');
    await answered(fixture);
    const picker = page.elementLocator(fixture.nativeElement);
    await expect.element(picker).toHaveTextContent('Work 3');
    await expect.element(picker).toHaveTextContent('Components 1');
    await expect.element(picker).toMatchScreenshot('loaded');
  });

  it('says so when there are no projects', async () => {
    const { fixture, list } = await render();
    // qits-projects' recorded list with its one entry removed. No recording is empty.
    const recorded = await commands.goldenMaster('a project exists', 'listProjects');
    list.flush({ ...recorded, entries: [] });
    await answered(fixture);
    const picker = page.elementLocator(fixture.nativeElement);
    await expect.element(picker).toHaveTextContent('There are no projects yet.');
    await expect.element(picker).toMatchScreenshot('empty');
  });

  it('marks the list as failed to load when the projects could not be loaded', async () => {
    const { fixture, list } = await render();
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const picker = page.elementLocator(fixture.nativeElement);
    await expect.element(picker.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(picker).toMatchScreenshot('error');
  });
});
