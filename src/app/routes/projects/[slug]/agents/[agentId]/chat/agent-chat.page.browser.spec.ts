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
import { WEB_SOCKET } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { AgentLayout } from '../agent.layout';
import { AgentChatPage } from './agent-chat.page';

/**
 * Screenshots of an agent's Chat tab, at `agents/<agent id>/…`. The project is
 * qits-projects' "a project exists"; the agent is qits-workspaces' `getAgent` of "an agent with a
 * saved prompt draft" (the bug ticket's agent `…a1`, slot 1), the project's agents "an agent whose
 * workspace is starting"'s and its start "a workspace slot hosting agents"' (the agent RUNNING in
 * slot 1, no start). Its saved prompt draft is
 * qits-workspaces' "an agent with a saved prompt draft" (the same agent).
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

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentChatPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/agents/:agentId',
            component: AgentLayout,
            children: [
              { path: '', children: [] },
              { path: 'chat', component: AgentChatPage },
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

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  /** Opens the Chat tab and answers the project, the agent and the project's agents. */
  async function render() {
    await page.viewport(900, 1300);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/agents/${agent.agentId}/chat`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    http
      .expectOne(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)
      // The project's ACTIVE agents as the agent layout's spec answers them: the bug ticket's agent,
      // with no waits ("an agent whose workspace is starting", which the pact binds).
      .flush(await goldenMaster(STARTING, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    // The agent's start, asked of the agent (`getAgentActiveProcess`): none is running.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
      .flush(await goldenMaster(SLOT, 'getAgentActiveProcess', 'qits-workspaces'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, agentId: agent.agentId as string };
  }

  it('shows a running agent’s transcript and its restored prompt draft', async () => {
    const { harness, element, agentId } = await render();
    http
      .expectOne(`https://workspaces.test/workspaces/agent/${agentId}/log?channel=TRANSCRIPT`)
      .flush(await goldenMaster(TURNS, 'getCommandLog', 'qits-workspace-daemon'));
    http
      .expectOne(`/workspaces/api/agents/${agentId}/prompt-draft`)
      .flush(await goldenMaster(DRAFTED, 'getAgentPromptDraft', 'qits-workspaces'));
    await answered(harness);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('link', { name: 'Chat' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByText('Fixed: the user name is trimmed')).toBeVisible();
    await expect.element(view.getByText('Restored draft from 4m ago')).toBeVisible();
    await expect
      .element(view.getByRole('textbox', { name: 'The prompt' }))
      .toHaveValue('Check the rounding in the invoice totals.');
    await expect.element(view.getByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(sockets).toEqual([]);
    await expect.element(view).toMatchScreenshot('transcript');
  });
});
