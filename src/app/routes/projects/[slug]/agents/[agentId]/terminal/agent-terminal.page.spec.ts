import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspaceDaemonClient } from '../../../../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../../../../api/workspace-daemon/client/client.gen';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import type { DomainEvent } from '$core/events/domain-events';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import { TERMINAL_BACKOFF_MS } from '$core/workspaces/terminal-socket';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
  workspacesGoldenMaster,
} from '../../../../../../../testing/golden-masters';
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

const RUNNING = 'a workspace daemon with an agent running';
const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const PLUGINS = 'a workspace daemon with plugins installed';
const ORIGIN = 'https://workspaces.qits.example';
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
  let followed: unknown[][];

  beforeEach(async () => {
    sockets = [];
    followed = [];
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
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: AgentsStore,
          useValue: {
            agentOf: () => ({ status: 'loaded', agent: AGENT }),
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
    http.verify();
    vi.useRealTimers();
  });

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';

  async function open(
    list = workspaceDaemonGoldenMaster(RUNNING, 'listCommands'),
    report = SIGNED_IN,
  ) {
    await harness.navigateByUrl(`/agent/${agentId}/terminal`);
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(report, 'availableAgents'));
    http
      .expectOne(`${BASE}/agent-plugins`)
      .flush(workspaceDaemonGoldenMaster(PLUGINS, 'listPlugins'));
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
    await harness.navigateByUrl(`/agent/${agentId}`);
    expect(sockets[0].closed).toBe(true);
  });

  const button = (label: string) =>
    Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes(label),
    )!;

  it('shows no sign-in notice while the harness is signed in, and lists the plugins', async () => {
    await open();
    expect(text()).not.toContain('Nobody has signed');
    expect(text()).toContain('Plugins');
    expect(text()).toContain('Java language server');
    expect(text()).toContain('installed, switched off');
  });

  it('says nobody signed the harness in, and attaches to the sign-in terminal it opens', async () => {
    await open(undefined, SIGNED_OUT);
    expect(text()).toContain('Nobody has signed Claude Code in');
    sockets[0].open();
    button('Open the sign-in terminal').click();
    await settle();
    const request = http.expectOne(`${BASE}/agents/sign-in`);
    expect(request.request.body).toEqual({ agentType: 'CLAUDE' });
    const terminal = workspaceDaemonGoldenMaster(SIGNED_OUT, 'openSignInTerminal');
    request.flush(terminal);
    await settle();
    harness.detectChanges();
    expect(text()).toContain('The sign-in terminal.');
    expect(text()).not.toContain('Nobody has signed');
    expect(sockets[0].closed).toBe(true);
    // The daemon's recordings freeze both commands' ids to the same value; the socket is new.
    expect(sockets[1].url).toBe(
      `wss://workspaces.qits.example/workspaces/container/${workspaceRowId}/terminal/commands/${terminal.command.id}`,
    );
    // The sign-in ends: the terminal goes, the report is read again, and the harness is back.
    sockets[1].open();
    sockets[1].serverClose(1000);
    harness.detectChanges();
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents'));
    await settle();
    harness.detectChanges();
    expect(text()).not.toContain('The sign-in terminal.');
    expect(sockets[2].url).toContain(`/terminal/commands/${commandId}`);
  });

  it('says why the sign-in terminal did not open', async () => {
    await open(undefined, SIGNED_OUT);
    button('Open the sign-in terminal').click();
    await settle();
    // No refused sign-in is recorded; an error answer is only a status and its message.
    http
      .expectOne(`${BASE}/agents/sign-in`)
      .flush({ message: 'Coding agents are not wired yet.' }, { status: 503, statusText: 'No' });
    await settle();
    harness.detectChanges();
    expect(text()).toContain('The sign-in terminal did not open — 503 Coding agents are not wired');
  });

  it('installs a plugin and shows the refreshed list', async () => {
    await open();
    const install = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('li'),
    ).find((li) => li.textContent?.includes('Python language server'))!;
    install.querySelector('button')!.click();
    await settle();
    http
      .expectOne(`${BASE}/agent-plugins/pyright-lsp/install`)
      .flush(workspaceDaemonGoldenMaster(PLUGINS, 'installPlugin'));
    await settle();
    harness.detectChanges();
    const row = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('li')).find(
      (li) => li.textContent?.includes('Python language server'),
    )!;
    expect(row.textContent).toContain('installed');
    expect(row.querySelector('button')).toBeNull();
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
      expect(scope()).toEqual({ agentId, workspaceId: String(workspaceRowId) });
      refresh(names.map((name) => ({ name })));
      await settle();
    }

    async function answerHarness() {
      await settle();
      http
        .expectOne(`${BASE}/agent-worktrees/${agentId}`)
        .flush(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
      await settle();
      http
        .expectOne(`${BASE}/commands`)
        .flush(workspaceDaemonGoldenMaster(RUNNING, 'listCommands'));
      await settle();
    }

    it('reads only the harness again after its exit', async () => {
      await open();
      await burst('AgentHarnessExited');
      http.expectNone(`${BASE}/agents/available`);
      http.expectNone(`${BASE}/agent-plugins`);
      await answerHarness();
    });

    it('reads the sign-in report and the plugins again after the container started', async () => {
      await open();
      await burst('WorkspaceStarted');
      http
        .expectOne(`${BASE}/agents/available`)
        .flush(workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents'));
      http
        .expectOne(`${BASE}/agent-plugins`)
        .flush(workspaceDaemonGoldenMaster(PLUGINS, 'listPlugins'));
      await answerHarness();
    });

    it('reads the sign-in report again after a refused start', async () => {
      await open();
      await burst('AgentStartRefused');
      http
        .expectOne(`${BASE}/agents/available`)
        .flush(workspaceDaemonGoldenMaster(SIGNED_OUT, 'availableAgents'));
      http.expectNone(`${BASE}/agent-plugins`);
      await answerHarness();
      harness.detectChanges();
    });
  });
});
