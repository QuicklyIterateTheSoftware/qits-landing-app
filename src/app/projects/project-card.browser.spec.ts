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
    // Room below the card for the expand button, which sits half outside it.
    (fixture.nativeElement as HTMLElement).style.paddingBottom = '1.25rem';
    fixture.detectChanges();
    await settle();
    // In the browser the store loads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await commands.goldenMaster('a project exists', 'listProjects'));
    await settle();
    TestBed.tick();
    const work = http.expectOne(`/projects/api/projects/${project.id}/entities`);
    const repositories = http.expectOne(`/projects/api/projects/${project.id}/repositories`);
    const lines = http.expectOne('/githost/api/loc');
    return { fixture, work, repositories, lines };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the card's expandable section (the languages table). */
  async function expand(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await page.getByRole('button', { name: 'Show more' }).click();
    await answered(fixture);
  }

  /**
   * The card, opened, with its work and repositories as recorded and its lines answered by `state`'s
   * recording. Work is "a project with refined work" (3 REFINED) unless `workState` says otherwise.
   */
  async function shown(state: string, workState = 'a project with refined work', open = true) {
    const { fixture, work, repositories, lines } = await render();
    work.flush(await commands.goldenMaster(workState, 'listProjectEntities'));
    repositories.flush(
      await commands.goldenMaster('a project with 3 repositories', 'listProjectRepositories'),
    );
    lines.flush(await locFor(state));
    await answered(fixture);
    if (open) await expand(fixture);
    return page.elementLocator(fixture.nativeElement);
  }

  it('starts collapsed, with a button to show the languages', async () => {
    const card = await shown('a repository with counted lines', undefined, false);
    await expect.element(card.getByRole('button', { name: 'Show more' })).toBeVisible();
    await expect
      .element(card.getByRole('button', { name: 'Show more' }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect.element(card).toMatchScreenshot('collapsed');
  });

  it('shows the component count and the lines of counted repositories', async () => {
    const card = await shown('a repository with counted lines');
    await expect.element(card).toHaveTextContent('Work 3');
    await expect.element(card).toHaveTextContent('Components 4');
    await expect.element(card).toHaveTextContent('Java');
    await expect.element(card).toMatchScreenshot('loaded');
  });

  it('shows the counted repositories of a list where some were never counted', async () => {
    const card = await shown('two repositories, one counted');
    await expect.element(card).toHaveTextContent('Java');
    await expect.element(card).not.toHaveTextContent('Counting lines');
    await expect.element(card).toMatchScreenshot('lines-partial');
  });

  it('shows the older count of a repository whose tip is not counted yet', async () => {
    const card = await shown('a repository counted at an older commit');
    await expect.element(card).toHaveTextContent('Java');
    await expect.element(card).toMatchScreenshot('lines-stale');
  });

  it('shows that lines are being counted when none is counted yet', async () => {
    const card = await shown('a repository not counted yet');
    await expect.element(card.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(card).toMatchScreenshot('lines-counting');
  });

  it('shows no lines for repositories without a commit, and no work', async () => {
    const card = await shown('a repository with no commit', 'a project with no work');
    await expect.element(card).toHaveTextContent('Work 0');
    await expect.element(card).toHaveTextContent('No lines yet');
    await expect.element(card).toMatchScreenshot('lines-empty');
  });

  it('shows that it is loading', async () => {
    const { fixture, work, repositories, lines } = await render();
    await expand(fixture);
    const card = page.elementLocator(fixture.nativeElement);
    // One spinner each on the work tile, the components tile and the languages table.
    expect(card.getByRole('img', { name: 'Loading' }).elements()).toHaveLength(3);
    await expect.element(card).toMatchScreenshot('loading');
    work.flush(null, { status: 500, statusText: 'Server Error' });
    repositories.flush(null, { status: 500, statusText: 'Server Error' });
    lines.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('marks the work, components and lines as failed to load', async () => {
    const { fixture, work, repositories, lines } = await render();
    // Error answers: the stores read no body from them (they consume nothing), only the status.
    work.flush(null, { status: 500, statusText: 'Server Error' });
    repositories.flush(null, { status: 500, statusText: 'Server Error' });
    lines.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    await expand(fixture);
    const card = page.elementLocator(fixture.nativeElement);
    // One error icon each on the work tile, the components tile and the languages table.
    expect(card.getByRole('img', { name: 'Failed to load' }).elements()).toHaveLength(3);
    await expect.element(card).not.toHaveTextContent(/unavailable/i);
    await expect.element(card).toMatchScreenshot('unavailable');
  });
});
