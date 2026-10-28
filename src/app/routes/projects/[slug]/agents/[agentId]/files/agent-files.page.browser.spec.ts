import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../../api/workspaces/client.gen';
import { client as workspaceDaemonClient } from '../../../../../../api/workspace-daemon/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { AgentLayout } from '../agent.layout';
import { AgentFilesPage } from './agent-files.page';

/**
 * Screenshots of an agent's Files tab, at `agents/<agent id>/…`. The project is
 * qits-projects' "a project exists"; the agent is qits-workspaces' `getAgent` of "an agent with a
 * saved prompt draft" (the bug ticket's agent `…a1`, slot 1), the project's agents and the slot
 * "a workspace slot hosting agents"' (the agent RUNNING in slot 1).
 *
 * Its worktree is qits-workspace-daemon's "a workspace daemon with an agent whose worktree holds
 * files" (the same agent in slot 1): the tree with `node_modules` gitignored, the Java / Quarkus
 * detection linking `Login.java` to `LoginTest.java`, and `Login.java`'s text; the stub opened is
 * "a workspace daemon with an agent whose worktree has an ignored directory". The event streams
 * never connect.
 */

const SLOT = 'a workspace slot hosting agents';
const DRAFTED = 'an agent with a saved prompt draft';
const FILES = 'a workspace daemon with an agent whose worktree holds files';
const IGNORED = 'a workspace daemon with an agent whose worktree has an ignored directory';
const LOGIN = 'src/main/java/app/Login.java';
const NOW = new Date('2026-01-01T00:04:00Z');

/** A tree row's button, by its path. */
const row = (element: HTMLElement, path: string) =>
  page.elementLocator(element.querySelector(`button[data-path="${path}"]`)!);

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentFilesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/agents/:agentId',
            component: AgentLayout,
            children: [
              { path: '', children: [] },
              { path: 'files', component: AgentFilesPage },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
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

  /** Opens the Files tab (at `search`) and answers the project, its work, the agent and its tree. */
  async function render(search = '') {
    await page.viewport(900, 1100);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/agents/${agent.agentId}/files${search}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    http
      .expectOne(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)
      .flush(await goldenMaster(SLOT, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    const slot = agent.workspaceRowId;
    http
      .expectOne(`/workspaces/api/workspaces/${slot}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${slot}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    await answered(harness);
    const worktree = `https://workspaces.test/workspaces/container/${slot}/agent-worktrees/${agent.agentId}`;
    http
      .expectOne(`${worktree}/detection`)
      .flush(await goldenMaster(FILES, 'detect', 'qits-workspace-daemon'));
    http
      .expectOne(`${worktree}/files`)
      .flush(await goldenMaster(FILES, 'listFiles', 'qits-workspace-daemon'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, worktree, view: page.elementLocator(element) };
  }

  it('shows the tree and an open file, with its test linked and lines picked', async () => {
    const { harness, worktree, view, element } = await render(
      `?path=${encodeURIComponent(LOGIN)}&lines=4-5`,
    );
    http
      .expectOne(`${worktree}/files/content?path=${encodeURIComponent(LOGIN)}`)
      .flush(await goldenMaster(FILES, 'readFile', 'qits-workspace-daemon'));
    await answered(harness);
    await row(element, 'src/main/java/app').click();
    await answered(harness);
    await view.getByRole('button', { name: 'Pick lines' }).click();
    await answered(harness);
    await view.getByRole('button', { name: 'Pick from line 6' }).click();
    await view.getByRole('button', { name: 'Pick from line 6' }).click();
    await answered(harness);
    await expect
      .element(view.getByRole('link', { name: 'Files' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByRole('button', { name: 'LoginTest' })).toBeVisible();
    await expect.element(view.getByText('class Login {')).toBeVisible();
    expect(element.querySelector('[data-path="node_modules"]')?.textContent).toContain('(2)');
    await expect.element(view).toMatchScreenshot('tree-and-file');
  });

  it('shows a gitignored directory opened, dimmed, with a name search on', async () => {
    const { harness, worktree, view, element } = await render();
    await row(element, 'node_modules').click();
    await settle();
    http
      .expectOne(`${worktree}/files?path=node_modules`)
      .flush(await goldenMaster(IGNORED, 'listFiles', 'qits-workspace-daemon'));
    await answered(harness);
    await view.getByRole('searchbox').fill('*.j*');
    await answered(harness);
    await expect.element(view.getByText('.package-lock.json')).toBeVisible();
    await expect.element(view.getByText('LoginTest.java')).toBeVisible();
    await expect.element(view).toMatchScreenshot('ignored-and-search');
  });
});
