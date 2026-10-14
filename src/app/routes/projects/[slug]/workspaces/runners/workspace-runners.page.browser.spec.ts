import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WorkspaceRunnersPage } from './workspace-runners.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of the Runners page. The project is qits-projects' recorded one ("a project
 * exists") and its wrapper the one "a project with repositories in components" names; the
 * project's slots are qits-workspaces' "a project with workspace slots hosting agents", answered to
 * the page's read by that wrapper's id (the two providers' frozen ids are unrelated): one slot, on
 * runner `localhost`.
 *
 * The runners are qits-workspaces' runner states, all of the same runner `localhost`: "a runner in
 * service" (connected, healthy, signed in to Claude, with its login commands), and "an
 * unregistered runner", whose Run health check is refused as that state refuses it (409
 * `RUNNER_UNAVAILABLE`). Register sends "no runners"' create, and the one-time install line shows.
 *
 * The clock is pinned four minutes after the recordings' instants, and the 5 s poll never fires.
 * The event stream never connects.
 */

const IN_SERVICE = 'a runner in service';
const UNREGISTERED = 'an unregistered runner';
const NO_RUNNERS = 'no runners';
const WORKSPACES = 'a project with workspace slots hosting agents';
const REPOSITORIES = 'a project with repositories in components';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkspaceRunnersPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/workspaces/runners', component: WorkspaceRunnersPage },
          { path: 'projects/:slug/workspaces/:slotId', children: [] },
        ]),
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

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  /** Opens the page, answering the project, its wrapper and its slots; the runners are `state`'s. */
  async function render(state: string) {
    await page.viewport(900, 1100);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/workspaces/runners`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    const repositories = await goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${project.id}/repositories`).flush(repositories);
    await answered(harness);
    const wrapper = repositories.wrapper.repositoryId as string;
    await answerSlots(wrapper);
    await answerRunners(harness, state);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project, wrapper };
  }

  /** Answers the project's slots and agents, read by the wrapper's id. */
  async function answerSlots(wrapper: string) {
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(await goldenMaster(WORKSPACES, 'listWorkspaces', 'qits-workspaces'));
    http
      .expectOne('/workspaces/api/agents')
      .flush(await goldenMaster(WORKSPACES, 'listAgents', 'qits-workspaces'));
  }

  async function answerRunners(harness: RouterTestingHarness, state: string) {
    http
      .expectOne('/workspaces/api/runners')
      .flush(await goldenMaster(state, 'listRunners', 'qits-workspaces'));
    await answered(harness);
  }

  it('shows a runner in service, with its slots, health and login commands', async () => {
    const { element, project } = await render(IN_SERVICE);
    const view = page.elementLocator(element);
    const runner = view.getByRole('article', { name: 'Runner localhost' });
    await expect.element(runner).toBeVisible();
    await expect.element(runner).toMatchTextContent('connected');
    await expect.element(runner).toMatchTextContent('0/1 slots running');
    await expect.element(runner).toMatchTextContent('health check passed');
    await expect.element(runner).toMatchTextContent('Claude logged in');
    await expect
      .element(runner.getByRole('region', { name: 'Slots' }).getByRole('link'))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/1`);
    await expect.element(runner.getByRole('button', { name: 'Copy Claude login' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('runner-in-service');
  });

  it('shows a refused health check in the service’s words', async () => {
    const { harness, element } = await render(UNREGISTERED);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('never connected');
    await view.getByRole('button', { name: 'Run health check' }).click();
    await settle();
    const refusal = await goldenMaster(UNREGISTERED, 'requestRunnerHealthcheck', 'qits-workspaces');
    http
      .expectOne((r) => r.url.endsWith('/healthcheck'))
      .flush(refusal, { status: 409, statusText: 'Conflict' });
    await answered(harness);
    await expect
      .element(view)
      .toMatchTextContent(`Could not run a health check — 409 ${refusal.message}.`);
    await expect.element(view).toMatchScreenshot('healthcheck-refused');
  });

  it('shows a registered runner’s one-time install line', async () => {
    const { harness, element, wrapper } = await render(UNREGISTERED);
    const view = page.elementLocator(element);
    await view.getByRole('textbox', { name: 'Name' }).fill('localhost');
    await view.getByRole('button', { name: 'Register' }).click();
    await settle();
    const created = await goldenMaster(NO_RUNNERS, 'createRunner', 'qits-workspaces');
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/workspaces/api/runners')
      .flush(created, { status: 201, statusText: 'Created' });
    await answered(harness);
    await answerSlots(wrapper);
    await answerRunners(harness, UNREGISTERED);
    const panel = view.getByRole('alert', { name: 'Install line' });
    await expect.element(panel).toMatchTextContent(created.installLine);
    await expect.element(panel).toMatchTextContent('This is the only time it is shown');
    await expect.element(view).toMatchScreenshot('install-line');
  });
});
