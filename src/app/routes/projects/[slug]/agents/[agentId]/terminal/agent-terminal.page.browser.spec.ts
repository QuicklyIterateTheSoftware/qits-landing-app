import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { AgentLayout } from '../agent.layout';
import { AgentTerminalPage } from './agent-terminal.page';

/**
 * Screenshots of an agent's Terminal tab, at `agents/<agent id>/…`. The project is
 * qits-projects' "a project exists"; the agent is qits-workspaces' `getAgent` of "an agent with a
 * saved prompt draft" (the bug ticket's agent `…a1`, slot 1), the project's agents "an agent whose
 * workspace is starting"'s and its start "a workspace slot hosting agents"' (the agent RUNNING in
 * slot 1, no start), so the tab attaches to the
 * agent's terminal on the agent proxy and asks the slot's daemon nothing (epic qits-1667); the
 * harness sign-in and the plugins are the workspace page's screenshots.
 *
 * The socket is a fake (`WEB_SOCKET`): it opens when told and delivers a few lines of shell output,
 * raw terminal text that no golden master records. The event streams never connect.
 */

const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const DRAFTED = 'an agent with a saved prompt draft';
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
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

/** The Terminal tab's status line (the layout above has a status line of its own). */
const statusLine = (element: HTMLElement) =>
  page.elementLocator(element.querySelector('app-agent-terminal-page [role="status"]')!);

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentTerminalPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];

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
              { path: 'terminal', component: AgentTerminalPage },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
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

  /** Opens the Terminal tab and answers the project, the agent and the project's agents. */
  async function render() {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/agents/${agent.agentId}/terminal`,
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

  it('shows the agent’s terminal, attached, with its output', async () => {
    const { harness, element, agentId } = await render();
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.test/workspaces/agent/${agentId}/terminal`,
    ]);
    sockets[0].open();
    sockets[0].deliver(
      '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ git status\r\n' +
        'On branch ticket/contract-00000001-10\r\n' +
        'nothing to commit, working tree clean\r\n' +
        '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ ',
    );
    await answered(harness);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('link', { name: 'Terminal' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(statusLine(element)).toMatchTextContent('Attached.');
    await expect
      .poll(() => element.querySelector('.xterm-rows')?.textContent ?? '')
      .toContain('working tree clean');
    expect(sockets[0].sent.some((frame) => JSON.parse(frame).type === 'resize')).toBe(true);
    await expect.element(view).toMatchScreenshot('attached');
  });

  it('shows a socket that cannot attach as closed, with a way to try again', async () => {
    const { harness, element } = await render();
    // Every attempt closes before it opens; the waits are the socket's own.
    for (let attempt = 0; attempt < 6; attempt++) {
      await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(attempt + 1);
      sockets[attempt].serverClose(1006);
    }
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(statusLine(element)).toMatchTextContent('Closed: could not attach.');
    await expect.element(view.getByRole('button', { name: 'Try to attach again' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('lost');
  }, 30_000);
});
