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
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { AgentLayout } from '../agent.layout';
import { AgentTerminalPage } from './agent-terminal.page';

/**
 * Screenshots of an agent's Terminal tab, at `agents/<agent id>/…`. The project is
 * qits-projects' "a project exists"; the agent is qits-workspaces' `getAgent` of "an agent with a
 * saved prompt draft" (the bug ticket's agent `…a1`, slot 1), the project's agents and the slot
 * "a workspace slot hosting agents"' (the agent RUNNING in slot 1). Its harness is qits-workspace-daemon's "a workspace daemon with an agent running",
 * which names the same agent in slot 1: a RUNNING TERMINAL command.
 *
 * The slot's daemon reports the harness signed in ("a workspace daemon with a signed-in harness"),
 * or nobody signed in ("… a harness nobody signed in", the sign-in notice), and the plugins on the
 * shared agent home ("a workspace daemon with plugins installed"); all three name slot 1.
 *
 * The socket is a fake (`WEB_SOCKET`): it opens when told and delivers a few lines of shell output,
 * raw terminal text that no golden master records. The event streams never connect.
 */

const SLOT = 'a workspace slot hosting agents';
const DRAFTED = 'an agent with a saved prompt draft';
const RUNNING = 'a workspace daemon with an agent running';
const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const PLUGINS = 'a workspace daemon with plugins installed';
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

  /** Opens the Terminal tab and answers the project, its work, the agent, its slot and harness. */
  async function render(report = SIGNED_IN) {
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
    const base = `https://workspaces.test/workspaces/container/${slot}`;
    http
      .expectOne(`${base}/agents/available`)
      .flush(await goldenMaster(report, 'availableAgents', 'qits-workspace-daemon'));
    http
      .expectOne(`${base}/agent-plugins`)
      .flush(await goldenMaster(PLUGINS, 'listPlugins', 'qits-workspace-daemon'));
    http
      .expectOne(`${base}/agent-worktrees/${agent.agentId}`)
      .flush(await goldenMaster(RUNNING, 'getAgentWorktree', 'qits-workspace-daemon'));
    await answered(harness);
    const commands = await goldenMaster(RUNNING, 'listCommands', 'qits-workspace-daemon');
    http.expectOne(`${base}/commands`).flush(commands);
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

  it('says nobody signed the harness in, and offers the sign-in terminal', async () => {
    const { harness, element } = await render(SIGNED_OUT);
    sockets[0].open();
    await answered(harness);
    const view = page.elementLocator(element);
    const notice = page.elementLocator(element.querySelector('app-sign-in-notice')!);
    await expect.element(notice).toMatchTextContent('Nobody has signed Claude Code in');
    await expect
      .element(notice.getByRole('button', { name: 'Open the sign-in terminal' }))
      .toBeVisible();
    await expect.element(notice).toMatchScreenshot('sign-in-notice');
    await expect.element(view.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  });

  it('lists the plugins on the shared agent home', async () => {
    const { harness, element } = await render();
    sockets[0].open();
    await answered(harness);
    const plugins = page.elementLocator(element.querySelector('app-plugins-section')!);
    await expect.element(plugins).toMatchTextContent('installed, switched off');
    await expect.element(plugins.getByRole('button', { name: 'Install' }).first()).toBeVisible();
    await expect.element(plugins).toMatchScreenshot('plugins');
  });
});
