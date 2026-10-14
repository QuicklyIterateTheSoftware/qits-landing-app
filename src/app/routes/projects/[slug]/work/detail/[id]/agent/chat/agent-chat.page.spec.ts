import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspacesClient } from '../../../../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../../../../api/workspaces/client/client.gen';
import { client as workspaceDaemonClient } from '../../../../../../../../api/workspace-daemon/client.gen';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { SelectedWork } from '$core/work/selected-work';
import { AgentsStore } from '$core/workspaces/agents.store';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
  workspacesGoldenMaster,
} from '../../../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../../../testing/platform-origins';
import { AgentChatPage, TRANSCRIPT_POLL_MS } from './agent-chat.page';

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
const CHATTING = 'a workspace daemon with an agent chatting';
const TURNS = 'a workspace daemon with an agent that has taken turns';
const DRAFTED = 'an agent with a saved prompt draft';
const ORIGIN = 'https://workspaces.qits.example';
const ITEM = 'contract-00000001-10';
const { agentId, workspaceRowId, commandId } = workspaceDaemonGoldenMasters.operation(
  RUNNING,
  'getAgentWorktree',
).params;
const BASE = `${ORIGIN}/workspaces/container/${workspaceRowId}`;
const LOG = `${BASE}/commands/${commandId}/log?channel=TRANSCRIPT`;
const DRAFT = `/workspaces/api/agents/${agentId}/prompt-draft`;
// qits-workspaces' agent of the bug ticket, in slot 1: the same agent and slot the daemon's states
// name.
const AGENT = workspacesGoldenMaster('an agent whose workspace is starting', 'listAgents')
  .agents[0];

/** The recorded transcript's lines, which a chat's socket replays in the same shape. */
const LINES: readonly string[] = workspaceDaemonGoldenMaster(TURNS, 'getCommandLog').lines.map(
  (line: { content: string }) => line.content,
);

describe('AgentChatPage', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let streams: string[];
  let harness: RouterTestingHarness;
  let agent: typeof AGENT;

  beforeEach(async () => {
    sockets = [];
    streams = [];
    agent = AGENT;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([
          { path: 'agent/:id', children: [{ path: 'chat', component: AgentChatPage }] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: SelectedWork,
          useValue: { entries: signal([{ id: AGENT.workId, qualifiedId: ITEM }]) },
        },
        {
          provide: AgentsStore,
          useValue: {
            itemOf: () => ({ status: 'loaded', agent }),
            follow: () => undefined,
          },
        },
        {
          provide: EVENT_SOURCE,
          useValue: (url: string): EventSourceLike => {
            streams.push(url);
            return { onmessage: null, onerror: null, readyState: 1, close: () => undefined };
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

  const element = () => harness.routeNativeElement as HTMLElement;
  const text = () => element().textContent ?? '';
  const button = (label: string) =>
    [...element().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  /** Opens the tab and answers the harness's reads (the commands from `listed`). */
  async function open(listed = RUNNING) {
    await harness.navigateByUrl(`/agent/${ITEM}/chat`);
    await settle();
    http
      .expectOne(`${BASE}/agent-worktrees/${agentId}`)
      .flush(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    await settle();
    http.expectOne(`${BASE}/commands`).flush(workspaceDaemonGoldenMaster(listed, 'listCommands'));
    await settle();
    harness.detectChanges();
    await settle();
  }

  /** Answers the draft's read with the recorded saved draft. */
  async function answerDraft() {
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(DRAFTED, 'getAgentPromptDraft'));
    await settle();
    harness.detectChanges();
  }

  it('shows a terminal agent’s transcript, and the composer with the saved draft', async () => {
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    expect(streams).toEqual([`${ORIGIN}/workspaces/api/workspaces/${workspaceRowId}/events`]);
    expect(sockets).toEqual([]);
    expect(text()).toContain('its live screen is on the Terminal tab');
    expect(text()).toContain('Fixed: the user name is trimmed before the lookup.');
    const prompt = element().querySelectorAll('textarea')[1];
    expect(prompt.value).toBe('Check the rounding in the invoice totals.');
    expect(text()).toContain('Restored draft from');
  });

  it('reads a running terminal’s transcript again while it runs', async () => {
    // Only the poll's interval is faked: the reads' own awaits run as they do.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    vi.advanceTimersByTime(TRANSCRIPT_POLL_MS);
    await settle();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await settle();
  });

  it('attaches to a running chat, shows what it replays, and sends what is said', async () => {
    await open(CHATTING);
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.qits.example/workspaces/container/${workspaceRowId}/chat/commands/${commandId}`,
    ]);
    expect(text()).toContain('Attaching…');
    sockets[0].open();
    sockets[0].deliver(LINES.map((line) => `${line}\n`).join(''));
    harness.detectChanges();
    expect(text()).toContain('Reading the login service first.');
    expect(text()).not.toContain('Attaching…');
    const box = element().querySelector('textarea')!;
    box.value = 'Also trim the e-mail.';
    box.dispatchEvent(new Event('input'));
    harness.detectChanges();
    button('Send')!.click();
    harness.detectChanges();
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ type: 'user', text: 'Also trim the e-mail.' }),
    ]);
    expect(box.value).toBe('');
  });

  it('terminates a running chat, then reads the harness again', async () => {
    await open(CHATTING);
    sockets[0].open();
    harness.detectChanges();
    button('Terminate')!.click();
    await settle();
    http
      .expectOne(`${BASE}/commands/${commandId}/terminate`)
      .flush(workspaceDaemonGoldenMaster(CHATTING, 'terminateCommand'));
    await settle();
    http
      .expectOne(`${BASE}/agent-worktrees/${agentId}`)
      .flush(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    await settle();
    // The recorded chat's list, its command TERMINATED: what the terminate answered.
    const list = workspaceDaemonGoldenMaster(CHATTING, 'listCommands');
    list.entries[0].command.status = 'TERMINATED';
    http.expectOne(`${BASE}/commands`).flush(list);
    await settle();
    harness.detectChanges();
    await settle();
    expect(sockets[0].closed).toBe(true);
    expect(text()).toContain('not in a live chat');
    await answerDraft();
  });

  it('says the conversation ended when the daemon closes it', async () => {
    await open(CHATTING);
    sockets[0].open();
    sockets[0].deliver(`${LINES[0]}\n${JSON.stringify({ type: 'session_closed' })}\n`);
    harness.detectChanges();
    expect(text()).toContain('This conversation has ended.');
    expect(button('Terminate')).toBeUndefined();
    expect(element().querySelector('textarea')).toBeNull();
  });

  it('offers a queued agent the composer alone', async () => {
    // The recorded agent, before it got a slot.
    agent = { ...AGENT, workspaceRowId: null };
    await harness.navigateByUrl(`/agent/${ITEM}/chat`);
    await settle();
    await answerDraft();
    expect(streams).toEqual([]);
    expect(text()).toContain('This agent has no workspace yet.');
    expect(button('Refine into prompt')).toBeUndefined();
  });

  it('shows no speech control', async () => {
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    const labels = [...element().querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Record');
    expect(text()).not.toMatch(/dictat|microphone|transcrib/i);
  });

  it('detaches when the tab is left', async () => {
    await open(CHATTING);
    await harness.navigateByUrl(`/agent/${ITEM}`);
    expect(sockets[0].closed).toBe(true);
  });
});
