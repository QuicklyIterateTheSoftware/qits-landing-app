import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { ProjectWorkspacesPage } from './project-workspaces.page';
import { goldenMaster } from '../../../../../testing/browser/golden-master';

/**
 * Screenshots of a project's Workspaces page. The project is qits-projects' recorded one ("a
 * project exists", slug `contract-00000001`) and its wrapper the one "a project with repositories
 * in components" names. The slots and agents are qits-workspaces' "a project with workspace slots
 * hosting agents", answered to the page's read by that wrapper's id (the two providers' frozen ids
 * are unrelated): its agents work on `contract-00000001-…` items, so they are the project's. One
 * slot on runner `localhost`; the bug ticket's agent holds it and waits on a release request, the
 * epic's yielded it, the improvement ticket's is queued.
 *
 * The clock is pinned four minutes after the recordings' instants, so the wait reads "4m ago". The
 * event stream never connects.
 */

const WORKSPACES = 'a project with workspace slots hosting agents';
const REPOSITORIES = 'a project with repositories in components';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('ProjectWorkspacesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/workspaces', component: ProjectWorkspacesPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  async function render() {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/workspaces`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project };
  }

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  it('lists the project’s agents, with what each waits on, and its slots', async () => {
    const { harness, element, project } = await render();
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    await answered(harness);
    const wrapper = repositories.wrapper.repositoryId;
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces'));
    http
      .expectOne('/workspaces/api/agents')
      .flush(await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('heading', { name: 'Agents' })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-10' }))
      .toHaveAttribute('href', `/projects/${project.slug}/work/detail/contract-00000001-10/agent`);
    await expect
      .element(view)
      .toMatchTextContent(
        'waiting on release-request 00000000-0000-4000-8000-0000000000c1 · 4m ago',
      );
    await expect.element(view).toMatchTextContent('queued — no free slot yet');
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: /ws-contract/ }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/1`);
    await expect.element(view).toMatchTextContent('on runner localhost');
    await expect.element(view).toMatchScreenshot('slots-and-agents');
  });

  it('marks the page as loading, then as failed to load', async () => {
    const { harness, element, project } = await render();
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('loading');
    http
      .expectOne(`/projects/api/projects/${project.id}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
