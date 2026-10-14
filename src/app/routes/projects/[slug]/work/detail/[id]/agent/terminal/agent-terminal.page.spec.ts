import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspaceDaemonClient } from '../../../../../../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../../../../../../api/workspace-daemon/client/client.gen';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { SelectedWork } from '$core/work/selected-work';
import { AgentsStore } from '$core/workspaces/agents.store';
import { TERMINAL_BACKOFF_MS } from '$core/workspaces/terminal-socket';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
  workspacesGoldenMaster,
} from '../../../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../../../testing/platform-origins';
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

const RUNNING = 'a workspace daemon with an agent running';
const ORIGIN = 'https://workspaces.qits.example';
const ITEM = 'contract-00000001-10';
const { agentId, workspaceRowId, commandId } = workspaceDaemonGoldenMasters.operation(
  RUNNING,
  'getAgentWorktree',
).params;
const BASE = `${ORIGIN}/workspaces/container/${workspaceRowId}`;
// qits-workspaces' agent of the bug ticket, in slot 1: the same agent and slot the daemon's
// "agent running" state names.
const AGENT = workspacesGoldenMaster('an agent whose workspace is starting', 'listAgents')
  .agents[0];

describe('AgentTerminalPage', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([
          { path: 'agent/:id', children: [{ path: 'terminal', component: AgentTerminalPage }] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: SelectedWork,
          useValue: { entries: signal([{ id: AGENT.workId, qualifiedId: ITEM }]) },
        },
        {
          provide: AgentsStore,
          useValue: { itemOf: () => ({ status: 'loaded', agent: AGENT }), follow: () => undefined },
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
    http.verify();
    vi.useRealTimers();
  });

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';

  async function open(list = workspaceDaemonGoldenMaster(RUNNING, 'listCommands')) {
    await harness.navigateByUrl(`/agent/${ITEM}/terminal`);
    await settle();
    http
      .expectOne(`${BASE}/agent-worktrees/${agentId}`)
      .flush(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    await settle();
    http.expectOne(`${BASE}/commands`).flush(list);
    await settle();
    harness.detectChanges();
  }

  it('attaches to the harness’s command through qits-workspaces’ container proxy', async () => {
    await open();
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.qits.example/workspaces/container/${workspaceRowId}/terminal/commands/${commandId}`,
    ]);
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

  it('says the command ended on a clean close, and does not attach again', async () => {
    await open();
    vi.useFakeTimers();
    sockets[0].open();
    sockets[0].serverClose(1000);
    vi.advanceTimersByTime(30_000);
    harness.detectChanges();
    expect(text()).toContain('Closed: the command has ended.');
    expect(sockets).toHaveLength(1);
  });

  it('opens no terminal for a harness that runs as a chat', async () => {
    // The recorded list, with its one command a CHAT instead of a TERMINAL.
    const list = workspaceDaemonGoldenMaster(RUNNING, 'listCommands');
    list.entries[0].command.kind = 'CHAT';
    await open(list);
    expect(sockets).toEqual([]);
    expect(text()).toContain('runs as a chat');
  });

  it('detaches when the tab is left', async () => {
    await open();
    await harness.navigateByUrl(`/agent/${ITEM}`);
    expect(sockets[0].closed).toBe(true);
  });
});
