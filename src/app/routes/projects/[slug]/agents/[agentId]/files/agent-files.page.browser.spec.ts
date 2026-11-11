import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';

/**
 * Screenshots of an agent's Files tab, at `agents/<agent id>/files`, inside the shell and the
 * agent's layout (`openRoute`). The project is qits-projects' "a project exists"; the agent is
 * qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug ticket's agent
 * `…a1`, slot 1), the project's ACTIVE agents (the layout's read, and the shell's agents menu's)
 * "an agent whose workspace is starting"'s and its start "a workspace slot hosting agents"' (the
 * agent RUNNING in slot 1, no start).
 *
 * Its worktree is qits-workspace-daemon's "a workspace daemon with an agent whose worktree holds
 * files" (the same agent in slot 1): the tree with `node_modules` gitignored, the Java / Quarkus
 * detection linking `Login.java` to `LoginTest.java`, and `Login.java`'s text; the stub opened is
 * "a workspace daemon with an agent whose worktree has an ignored directory". The event streams
 * never connect.
 */

const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const DRAFTED = 'an agent with a saved prompt draft';
const FILES = 'a workspace daemon with an agent whose worktree holds files';
const IGNORED = 'a workspace daemon with an agent whose worktree has an ignored directory';
const LOGIN = 'src/main/java/app/Login.java';
const NOW = new Date('2026-01-01T00:04:00Z');

/** A tree row's button, by its path. */
const row = (element: HTMLElement, path: string) =>
  page.elementLocator(element.querySelector(`button[data-path="${path}"]`)!);

describe('AgentFilesPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** Opens the Files tab (at `search`) and answers the agent, the project's agents and its tree. */
  async function render(search = '') {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1140, 1100);
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    // The project's ACTIVE agents as the agent layout's spec answers them: the bug ticket's agent,
    // with no waits ("an agent whose workspace is starting", which the pact binds).
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/agents/${agent.agentId}/files${search}`,
      { agents: STARTING },
    );
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    await opened.settled();
    // The agent's start, asked of the agent (`getAgentActiveProcess`): none is running.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
      .flush(await goldenMaster(SLOT, 'getAgentActiveProcess', 'qits-workspaces'));
    await opened.settled();
    const worktree = `https://workspaces.test/workspaces/agent/${agent.agentId}`;
    http
      .expectOne(`${worktree}/detection`)
      .flush(await goldenMaster(FILES, 'detect', 'qits-workspace-daemon'));
    http
      .expectOne(`${worktree}/files`)
      .flush(await goldenMaster(FILES, 'listFiles', 'qits-workspace-daemon'));
    await opened.settled();
    const element = opened.page;
    return { opened, element, worktree, view: page.elementLocator(element) };
  }

  it('shows the tree and an open file, with its test linked and lines picked', async () => {
    const { opened, worktree, view, element } = await render(
      `?path=${encodeURIComponent(LOGIN)}&lines=4-5`,
    );
    http
      .expectOne(`${worktree}/files/content?path=${encodeURIComponent(LOGIN)}`)
      .flush(await goldenMaster(FILES, 'readFile', 'qits-workspace-daemon'));
    await opened.settled();
    await row(element, 'src/main/java/app').click();
    await opened.settled();
    await view.getByRole('button', { name: 'Pick lines' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Pick from line 6' }).click();
    await view.getByRole('button', { name: 'Pick from line 6' }).click();
    await opened.settled();
    const layout = page.elementLocator(opened.frame.querySelector('app-agent-layout')!);
    await expect
      .element(layout.getByRole('link', { name: 'Files' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByRole('button', { name: 'LoginTest' })).toBeVisible();
    await expect.element(view.getByText('class Login {')).toBeVisible();
    expect(element.querySelector('[data-path="node_modules"]')?.textContent).toContain('(2)');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('tree-and-file', { kind: 'DATA' });
  });

  it('shows a gitignored directory opened, dimmed, with a name search on', async () => {
    const { opened, worktree, view, element } = await render();
    await row(element, 'node_modules').click();
    await opened.settled();
    http
      .expectOne(`${worktree}/files?path=node_modules`)
      .flush(await goldenMaster(IGNORED, 'listFiles', 'qits-workspace-daemon'));
    await opened.settled();
    await view.getByRole('searchbox').fill('*.j*');
    await opened.settled();
    await expect.element(view.getByText('.package-lock.json')).toBeVisible();
    await expect.element(view.getByText('LoginTest.java')).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('ignored-and-search', { kind: 'DATA' });
  });
});
