import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';

/**
 * Screenshots of an agent's Chat tab, at `agents/<agent id>/chat`, inside the shell and the agent's
 * layout (`openRoute`). The project is qits-projects' "a project exists"; the agent is
 * qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug ticket's agent
 * `…a1`, slot 1), the project's ACTIVE agents (the layout's read, and the shell's agents menu's)
 * "an agent whose workspace is starting"'s and its start "a workspace slot hosting agents"' (the
 * agent RUNNING in slot 1, no start). Its saved prompt draft is qits-workspaces' "an agent with a
 * saved prompt draft" (the same agent).
 *
 * Its transcript, read through the agent proxy (epic qits-1667), is qits-workspace-daemon's "a
 * workspace daemon with an agent that has taken turns" (the same agent's command). The tab opens no
 * socket. The event streams never connect.
 */

const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const DRAFTED = 'an agent with a saved prompt draft';
const TURNS = 'a workspace daemon with an agent that has taken turns';
const NOW = new Date('2026-01-01T00:04:00Z');

describe('AgentChatPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: WEB_SOCKET,
          useValue: (url: string) => {
            sockets.push(url);
            throw new Error('the Chat tab opens no socket');
          },
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

  /** Opens the Chat tab and answers the agent, the project's agents and the agent's start. */
  async function render() {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1140, 1300);
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    // The project's ACTIVE agents as the agent layout's spec answers them: the bug ticket's agent,
    // with no waits ("an agent whose workspace is starting", which the pact binds).
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/agents/${agent.agentId}/chat`,
      { agents: STARTING },
    );
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    await opened.settled();
    // The agent's start, asked of the agent (`getAgentActiveProcess`): none is running.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
      .flush(await goldenMaster(SLOT, 'getAgentActiveProcess', 'qits-workspaces'));
    await opened.settled();
    return { opened, agentId: agent.agentId as string };
  }

  it('shows a running agent’s transcript and its restored prompt draft', async () => {
    const { opened, agentId } = await render();
    http
      .expectOne(`https://workspaces.test/workspaces/agent/${agentId}/log?channel=TRANSCRIPT`)
      .flush(await goldenMaster(TURNS, 'getCommandLog', 'qits-workspace-daemon'));
    http
      .expectOne(`/workspaces/api/agents/${agentId}/prompt-draft`)
      .flush(await goldenMaster(DRAFTED, 'getAgentPromptDraft', 'qits-workspaces'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    const layout = page.elementLocator(opened.frame.querySelector('app-agent-layout')!);
    await expect
      .element(layout.getByRole('link', { name: 'Chat' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByText('Fixed: the user name is trimmed')).toBeVisible();
    await expect.element(view.getByText('Restored draft from 4m ago')).toBeVisible();
    await expect
      .element(view.getByRole('textbox', { name: 'The prompt' }))
      .toHaveValue('Check the rounding in the invoice totals.');
    await expect.element(view.getByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(sockets).toEqual([]);
    await expect.element(page.elementLocator(opened.frame)).toMatchScreenshot('transcript');
  });
});
