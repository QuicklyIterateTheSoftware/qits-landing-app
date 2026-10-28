import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../../../../api/workspaces/client.gen';
import { client as workspaceDaemonClient } from '../../../../../../../../api/workspace-daemon/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../../../testing/platform-origins';
import {
  answerCampaignReads,
  campaignsIn,
} from '../../../../../../../../../testing/campaign-reads';
import { goldenMaster } from '../../../../../../../../../testing/browser/golden-master';
import { WorkAgentLayout } from '../work-agent.layout';
import { AgentChatPage } from './agent-chat.page';

/**
 * Screenshots of a work item's agent's Chat tab. The project and its work are qits-projects'
 * recordings ("a project exists", "a bug ticket in detail", whose campaign is described by "a
 * campaign in detail"); the agent and its slot are qits-workspaces' "a workspace slot hosting
 * agents": the bug ticket's agent `…a1`, RUNNING in slot 1. Its saved prompt draft is
 * qits-workspaces' "an agent with a saved prompt draft" (the same agent).
 *
 * Its harness is qits-workspace-daemon's: "a workspace daemon with an agent running" names the same
 * agent in slot 1 and its command, a RUNNING TERMINAL, whose transcript is "a workspace daemon with
 * an agent that has taken turns" (the same command); "a workspace daemon with an agent chatting" is
 * that command RUNNING as a CHAT. The chat's socket is a fake (`WEB_SOCKET`) that replays the
 * recorded transcript's lines, the shape the daemon replays. The event streams never connect.
 */

const ITEM = 'contract-00000001-10';
const WORK = 'a bug ticket in detail';
const SLOT = 'a workspace slot hosting agents';
const DRAFTED = 'an agent with a saved prompt draft';
const RUNNING = 'a workspace daemon with an agent running';
const CHATTING = 'a workspace daemon with an agent chatting';
const TURNS = 'a workspace daemon with an agent that has taken turns';
const NOW = new Date('2026-01-01T00:04:00Z');

/** A socket the spec drives by hand. */
class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  readonly sent: string[] = [];
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = WEB_SOCKET_OPEN;
    this.onopen?.(new Event('open'));
  }
  deliver(text: string) {
    this.onmessage?.(new MessageEvent('message', { data: text }));
  }
}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentChatPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work/detail/:id/agent',
            component: WorkAgentLayout,
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
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket;
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

  /** Opens the Chat tab and answers the project, its work, the agent, its slot and its harness. */
  async function render(commands: string) {
    await page.viewport(900, 1300);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/work/detail/${ITEM}/agent/chat`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    const work = await goldenMaster(WORK, 'listProjectWork');
    http.expectOne(`/projects/api/projects/${project.id}/work`).flush(work);
    await answered(harness);
    await answerCampaignReads(http, goldenMaster, campaignsIn(work), {
      members: WORK,
      described: ['a campaign in detail'],
    });
    await answered(harness);
    const agents = await goldenMaster(SLOT, 'listAgents', 'qits-workspaces');
    const agent = agents.agents[0];
    http.expectOne(`/workspaces/api/agents?workId=${agent.workId}`).flush(agents);
    await answered(harness);
    const slot = agent.workspaceRowId;
    http
      .expectOne(`/workspaces/api/workspaces/${slot}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${slot}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    await answered(harness);
    const base = `https://workspaces.test/workspaces/container/${slot}`;
    http
      .expectOne(`${base}/agent-worktrees/${agent.agentId}`)
      .flush(await goldenMaster(RUNNING, 'getAgentWorktree', 'qits-workspace-daemon'));
    await answered(harness);
    const listed = await goldenMaster(commands, 'listCommands', 'qits-workspace-daemon');
    http.expectOne(`${base}/commands`).flush(listed);
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return {
      harness,
      element,
      base,
      agentId: agent.agentId as string,
      commandId: listed.entries[0].command.id as string,
    };
  }

  it('shows a terminal agent’s transcript and its restored prompt draft', async () => {
    const { harness, element, base, agentId, commandId } = await render(RUNNING);
    http
      .expectOne(`${base}/commands/${commandId}/log?channel=TRANSCRIPT`)
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

  it('shows a live chat as the daemon replays it', async () => {
    const { harness, element, commandId } = await render(CHATTING);
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.test/workspaces/container/1/chat/commands/${commandId}`,
    ]);
    const log = await goldenMaster(TURNS, 'getCommandLog', 'qits-workspace-daemon');
    sockets[0].open();
    sockets[0].deliver(log.lines.map((line: { content: string }) => `${line.content}\n`).join(''));
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view.getByText('Reading the login service first.')).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Terminate' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('live-chat');
  });
});
