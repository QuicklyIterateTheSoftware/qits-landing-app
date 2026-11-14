import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of an agent's Terminal tab, at `agents/<agent id>/terminal`, inside the shell and the
 * agent's layout (`openRoute`). The project is qits-projects' "a project exists"; the agent is
 * qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug ticket's agent
 * `…a1`, slot 1), the project's ACTIVE agents (the layout's read, and the shell's agents menu's)
 * "an agent whose workspace is starting"'s and its start "a workspace slot hosting agents"' (the
 * agent RUNNING in slot 1, no start), so the tab attaches to the agent's terminal on the agent
 * proxy and asks the slot's daemon nothing (epic qits-1667); the harness sign-in and the plugins
 * are the workspace page's screenshots.
 *
 * The socket is a fake (`WEB_SOCKET`): it opens when told and delivers a few lines of shell output,
 * raw terminal text that no golden master records. The event streams never connect.
 *
 * The link to the workspace's page is a declared exit (`open-terminal-workspace` `workspace`, epic
 * qits-2000). It sits below the screen, past the fold, so `workspace-link` scrolls its line into
 * view before screenshotting the whole page; it is followed once, and the slot's page it leaves
 * for is its own spec's: its reads are answered with an error (`leftFor`).
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

describe('AgentTerminalPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];

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

  /** Opens the Terminal tab and answers the agent, the project's agents and the agent's start. */
  async function render() {
    // As wide as the page was, plus the sidebar. The screen sizes itself down to the fold, so the
    // frame runs past the viewport by the shell's foot, whatever the height.
    await page.viewport(1140, 900);
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    // The project's ACTIVE agents as the agent layout's spec answers them: the bug ticket's agent,
    // with no waits ("an agent whose workspace is starting", which the pact binds).
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/agents/${agent.agentId}/terminal`,
      { agents: STARTING },
    );
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    await opened.settled();
    // The agent's start, asked of the agent (`getAgentActiveProcess`): none is running.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
      .flush(await goldenMaster(SLOT, 'getAgentActiveProcess', 'qits-workspaces'));
    await opened.settled();
    return { opened, element: opened.page, agentId: agent.agentId as string };
  }

  it('shows the agent’s terminal, attached, with its output', async () => {
    const { opened, element, agentId } = await render();
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.test/workspaces/agent/${agentId}/terminal`,
    ]);
    sockets[0].open();
    sockets[0].deliver(
      '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ git status\r\n' +
        'On branch ticket/contract-00000001-9\r\n' +
        'nothing to commit, working tree clean\r\n' +
        '\x1b[1;32magent@workspace\x1b[0m:\x1b[1;34m~/wrapper\x1b[0m$ ',
    );
    await opened.settled();
    const layout = page.elementLocator(opened.frame.querySelector('app-agent-layout')!);
    await expect
      .element(layout.getByRole('link', { name: 'Terminal' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(statusLine(element)).toMatchTextContent('Attached.');
    await expect
      .poll(() => element.querySelector('.xterm-rows')?.textContent ?? '')
      .toContain('working tree clean');
    expect(sockets[0].sent.some((frame) => JSON.parse(frame).type === 'resize')).toBe(true);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('attached', { kind: 'DATA' });
    await shootShellMenus(opened, 'attached');
  });

  it('shows a socket that cannot attach as closed, with a way to try again', async () => {
    const { opened, element } = await render();
    // Every attempt closes before it opens; the waits are the socket's own.
    for (let attempt = 0; attempt < 6; attempt++) {
      await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(attempt + 1);
      sockets[attempt].serverClose(1006);
    }
    await opened.settled();
    const view = page.elementLocator(element);
    await expect.element(statusLine(element)).toMatchTextContent('Closed: could not attach.');
    await expect.element(view.getByRole('button', { name: 'Try to attach again' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('lost', { kind: 'ERROR' });
  }, 30_000);

  /** The line under the screen that links the workspace's page. */
  const workspaceLine = (element: HTMLElement) =>
    page.elementLocator(
      [...element.querySelectorAll<HTMLElement>('p')].find((p) =>
        p.textContent?.includes('the workspace’s page'),
      )!,
    );

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's (`idle()`, not
   * `settled()`, qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('shows the link to the workspace’s page below the screen', async () => {
    const { opened, element } = await render();
    sockets[0].open();
    await opened.settled();
    const line = workspaceLine(element);
    (line.element() as HTMLElement).scrollIntoView({ block: 'center' });
    await expect.element(line.getByRole('link', { name: 'the workspace’s page' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('workspace-link', { kind: 'DATA' });
  });

  it('open-terminal-workspace workspace: the link opens the workspace’s page', async () => {
    const { opened, element } = await render();
    sockets[0].open();
    await opened.settled();
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    await workspaceLine(element).getByRole('link', { name: 'the workspace’s page' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-terminal-workspace:workspace',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/workspaces/${agent.workspaceRowId}`,
    );
  });
});
