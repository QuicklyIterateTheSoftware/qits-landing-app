import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { commands, page } from 'vitest/browser';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import type { Project } from '../core/projects/projects.store';
import { ProjectCard } from './project-card';

/**
 * Screenshots of the project card in a real browser. qits-projects' golden masters are the
 * backend's answers, read on the Node side through the `goldenMaster` command.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectCard (screenshots)', () => {
  let http: HttpTestingController;
  let project: Project;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    // The same frozen projectId as the state "a project with 3 repositories".
    project = (await commands.goldenMaster('a project exists', 'getProject')).project;
  });

  afterEach(() => http.verify());

  /** The card in a fixed-width frame, with its repositories call requested but not answered. */
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
    const request = http.expectOne(`/projects/api/projects/${project.id}/repositories`);
    return { fixture, request };
  }

  async function answered(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the component count', async () => {
    const { fixture, request } = await render();
    request.flush(
      await commands.goldenMaster('a project with 3 repositories', 'listProjectRepositories'),
    );
    await answered(fixture);
    const card = page.elementLocator(fixture.nativeElement);
    await expect.element(card).toHaveTextContent('4 components');
    await expect.element(card).toMatchScreenshot('loaded');
  });

  it('shows that it is loading', async () => {
    const { fixture, request } = await render();
    const card = page.elementLocator(fixture.nativeElement);
    await expect.element(card).toHaveTextContent('Loading…');
    await expect.element(card).toMatchScreenshot('loading');
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
  });

  it('shows that the components are unavailable', async () => {
    const { fixture, request } = await render();
    // An error answer: the store reads no body from it (consumes nothing), only the status.
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered(fixture);
    const card = page.elementLocator(fixture.nativeElement);
    await expect.element(card).toHaveTextContent('Components unavailable');
    await expect.element(card).toMatchScreenshot('unavailable');
  });
});
