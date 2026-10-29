import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import type { DomainEvent } from '$core/events/domain-events';
import { SelectedProject } from '$core/projects/selected-project';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import { TERMINAL_BACKOFF_MS } from '$core/workspaces/terminal-socket';
import { workspacesGoldenMaster } from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { AgentTerminalPage } from './agent-terminal.page';

/** A socket the spec drives by hand. */
class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  closed = false;
  readonly sent: string[] = [];
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
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

const settle = () => new Promise((resolve) => setTimeout(resolve));

const ORIGIN = 'https://workspaces.qits.example';
// qits-workspaces' agent of the bug ticket, RUNNING in slot 1.
const AGENT = workspacesGoldenMaster('an agent whose workspace is starting', 'listAgents')
  .agents[0];
const agentId: string = AGENT.agentId;
const SOCKET = `wss://workspaces.qits.example/workspaces/agent/${agentId}/terminal`;

describe('AgentTerminalPage', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let harness: RouterTestingHarness;
  let followed: unknown[][];
  let loads: string[];
  let agent: typeof AGENT;

  beforeEach(async () => {
    sockets = [];
    followed = [];
    loads = [];
    agent = AGENT;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([
          {
            path: 'agent/:agentId',
            children: [{ path: 'terminal', component: AgentTerminalPage }],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        { provide: SelectedProject, useValue: { slug: () => 'contract-00000001' } },
        {
          provide: AgentsStore,
          useValue: {
            agentOf: () => ({ status: 'loaded', agent }),
            loadAgent: (id: string) => loads.push(id),
            follow: (...args: unknown[]) => followed.push(args),
          },
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
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    // The tab asks nothing over HTTP: the agent is the layout's, the terminal a socket.
    http.verify();
    vi.useRealTimers();
  });

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';

  async function open() {
    await harness.navigateByUrl(`/agent/${agentId}/terminal`);
    await settle();
    harness.detectChanges();
  }

  it('attaches to the running agent’s terminal through qits-workspaces’ agent proxy', async () => {
    await open();
    expect(sockets.map((s) => s.url)).toEqual([SOCKET]);
    expect(text()).toContain('Attaching…');
    sockets[0].open();
    harness.detectChanges();
    expect(text()).toContain('Attached.');
    expect(sockets[0].sent).toEqual([JSON.stringify({ type: 'resize', cols: 100, rows: 30 })]);
  });

  it('shows the output, and sends what is typed', async () => {
    await open();
    sockets[0].open();
    sockets[0].deliver('$ ls\r\nREADME.md');
    harness.detectChanges();
    // jsdom has no matchMedia, so the screen shows the frames as text.
    expect(text()).toContain('README.md');
    const page = harness.routeDebugElement!.componentInstance as AgentTerminalPage;
    (page as unknown as { socket: () => { send(d: string): void } }).socket().send('ls\r');
    expect(sockets[0].sent).toContain(JSON.stringify({ type: 'data', data: 'ls\r' }));
  });

  it('shows a closed socket as closed, attaches again, then offers to try again', async () => {
    await open();
    vi.useFakeTimers();
    sockets[0].open();
    sockets[0].serverClose(1006);
    harness.detectChanges();
    expect(text()).toContain('Closed. Attaching again…');
    for (const wait of TERMINAL_BACKOFF_MS) {
      vi.advanceTimersByTime(wait);
      sockets[sockets.length - 1].serverClose(1006);
    }
    harness.detectChanges();
    expect(sockets).toHaveLength(TERMINAL_BACKOFF_MS.length + 1);
    expect(text()).toContain('Closed: could not attach.');
    const button = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Try to attach again'))!;
    button.click();
    harness.detectChanges();
    expect(sockets).toHaveLength(TERMINAL_BACKOFF_MS.length + 2);
    expect(text()).toContain('Attaching…');
  });

  it('says the harness ended on a clean close, and does not attach again', async () => {
    await open();
    vi.useFakeTimers();
    sockets[0].open();
    sockets[0].serverClose(1000);
    vi.advanceTimersByTime(30_000);
    harness.detectChanges();
    expect(text()).toContain('Closed: the harness has ended.');
    expect(sockets).toHaveLength(1);
  });

  it('opens no terminal for a stopped agent, and says how it comes back', async () => {
    // The recorded agent, as a stop leaves it.
    agent = { ...AGENT, runState: 'STOPPED' };
    await open();
    expect(sockets).toEqual([]);
    expect(text()).toContain('The agent was stopped');
  });

  it('opens no terminal for a yielded agent', async () => {
    agent = { ...AGENT, runState: 'YIELDED' };
    await open();
    expect(sockets).toEqual([]);
    expect(text()).toContain('The agent’s harness is not running.');
  });

  it('opens no terminal for an agent with no workspace', async () => {
    agent = { ...AGENT, workspaceRowId: null, runState: 'QUEUED' };
    await open();
    expect(sockets).toEqual([]);
    expect(text()).toContain('This agent has no workspace yet');
  });

  it('links the workspace’s page for the harness sign-in and the plugins', async () => {
    await open();
    const link = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.includes('the workspace’s page'),
    );
    expect(link?.getAttribute('href')).toBe('/projects/contract-00000001/workspaces/1');
    expect(text()).not.toContain('Nobody has signed');
    expect(text()).not.toContain('Plugins');
  });

  it('detaches when the tab is left', async () => {
    await open();
    await harness.navigateByUrl(`/agent/${agentId}`);
    expect(sockets[0].closed).toBe(true);
  });

  describe('after lifecycle events (qits-1270)', () => {
    /** Runs the page's `follow` refresh with a burst of `names`. */
    async function burst(...names: string[]) {
      const [, scope, refresh, events] = followed[0] as [
        unknown,
        () => object,
        (burst: readonly DomainEvent[]) => void,
        readonly string[],
      ];
      expect(events).toEqual(HARNESS_EVENTS);
      expect(scope()).toEqual({ agentId, workspaceId: '1' });
      refresh(names.map((name) => ({ name })));
      await settle();
      harness.detectChanges();
    }

    it('reads the agent again after its harness exited, keeping the socket', async () => {
      await open();
      await burst('AgentHarnessExited');
      expect(loads).toEqual([agentId]);
      expect(sockets).toHaveLength(1);
    });

    it('attaches anew after the harness started again', async () => {
      await open();
      await burst('AgentStarted');
      expect(loads).toEqual([agentId]);
      expect(sockets[0].closed).toBe(true);
      expect(sockets.map((s) => s.url)).toEqual([SOCKET, SOCKET]);
    });
  });
});
