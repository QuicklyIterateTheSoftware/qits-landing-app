import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { commands, page } from 'vitest/browser';
import { client as githostClient } from '../api/githost/client.gen';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import type { Project } from '../core/projects/projects.store';
import { ProjectCard } from './project-card';

/**
 * Screenshots of the project card in a real browser. qits-projects' and qits-githost's golden
 * masters are the backends' answers, read on the Node side through the `goldenMaster` command.
 *
 * The lines of code come from qits-githost's recordings, put under the ids of the project's
 * recorded repositories: the two providers' frozen ids are unrelated, so each case says which
 * recorded githost entry stands for which repository.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

interface LocList {
  entries: { repositoryId: string }[];
}

describe('ProjectCard (screenshots)', () => {
  let http: HttpTestingController;
  let project: Project;
  let repositoryIds: string[];

  beforeEach(async () => {
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
    // The same frozen projectId as the state "a project with 3 repositories".
    project = (await commands.goldenMaster('a project exists', 'getProject')).project;
    const repositories = await commands.goldenMaster(
      'a project with 3 repositories',
      'listProjectRepositories',
    );
    repositoryIds = repositories.entries.map(
      (e: { repository: { id: string } }) => e.repository.id,
    );
  });

  afterEach(() => http.verify());

  /** qits-githost's recording for `state`, its entries put under the project's first repositories. */
  async function locFor(state: string): Promise<LocList> {
    const loc: LocList = await commands.goldenMaster(state, 'listLoc', 'qits-githost');
    loc.entries.forEach((entry, i) => (entry.repositoryId = repositoryIds[i]));
    return loc;
  }

  /** The card in a fixed-width frame, with its repositories and lines requested, not answered. */
  async function render() {
    const fixture = TestBed.createComponent(ProjectCard);
    fixture.componentRef.setInput('project', project);
    (fixture.nativeElement as HTMLElement).style.width = '320px';
    fixture.detectChanges();
    await settle();
    // In the browser the store loads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await commands.goldenMaster('a project exists', 'listProjects'));
    await settle();
    TestBed.tick();
    const repositories = http.expectOne(`/projects/api/projects/${project.id}/repositories`);
    const lines = http.expectOne('/githost/api/loc');
    return { fixture, repositories, lines };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The card with its repositories as recorded and its lines answered by `state`'s recording. */
  async function shown(state: string) {
    const { fixture, repositories, lines } = await render();
    repositories.flush(
      await commands.goldenMaster('a project with 3 repositories', 'listProjectRepositories'),
    );
    lines.flush(await locFor(state));
    await answered(fixture);
    return page.elementLocator(fixture.nativeElement);
  }

  it('shows the component count and the lines of counted repositories', async () => {
    const card = await shown('a repository with counted lines');
    await expect.element(card).toHaveTextContent('4 components');
    await expect.element(card).toHaveTextContent('8 lines, 3 in tests');
    await expect.element(card).toMatchScreenshot('loaded');
  });

  it('shows a partial total while some repositories are not counted yet', async () => {
    const card = await shown('two repositories, one counted');
    await expect.element(card).toHaveTextContent('at least 8 lines, 3 in tests');
    await expect.element(card).toMatchScreenshot('lines-partial');
  });

  it('shows that lines are being counted when none is counted yet', async () => {
    const card = await shown('a repository not counted yet');
    await expect.element(card).toHaveTextContent('Counting lines…');
    await expect.element(card).toMatchScreenshot('lines-counting');
  });

  it('shows no lines for repositories without a commit', async () => {
    const card = await shown('a repository with no commit');
    await expect.element(card).toHaveTextContent('0 lines, 0 in tests');
    await expect.element(card).toMatchScreenshot('lines-empty');
  });

  it('shows that it is loading', async () => {
    const { fixture, repositories, lines } = await render();
    const card = page.elementLocator(fixture.nativeElement);
    await expect.element(card).toHaveTextContent('Loading…');
    await expect.element(card).toMatchScreenshot('loading');
    repositories.flush(null, { status: 500, statusText: 'Server Error' });
    lines.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('shows that the components and lines are unavailable', async () => {
    const { fixture, repositories, lines } = await render();
    // Error answers: the stores read no body from them (they consume nothing), only the status.
    repositories.flush(null, { status: 500, statusText: 'Server Error' });
    lines.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const card = page.elementLocator(fixture.nativeElement);
    await expect.element(card).toHaveTextContent('Components unavailable');
    await expect.element(card).toHaveTextContent('Lines unavailable');
    await expect.element(card).toMatchScreenshot('unavailable');
  });
});
