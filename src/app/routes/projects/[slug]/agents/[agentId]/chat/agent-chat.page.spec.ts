import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspacesClient } from '../../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../../api/workspaces/client/client.gen';
import { client as workspaceDaemonClient } from '../../../../../../api/workspace-daemon/client.gen';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PickedContext } from '$core/workspaces/picked-context';
import {
  workspaceDaemonGoldenMaster,
  workspacesGoldenMaster,
} from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { AgentChatPage, TRANSCRIPT_POLL_MS } from './agent-chat.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const TURNS = 'a workspace daemon with an agent that has taken turns';
const DRAFTED = 'an agent with a saved prompt draft';
const ORIGIN = 'https://workspaces.qits.example';
// qits-workspaces' agent of the bug ticket, RUNNING in slot 1: the same agent the daemon's states
// name.
const AGENT = workspacesGoldenMaster('an agent whose workspace is starting', 'listAgents')
  .agents[0];
const agentId: string = AGENT.agentId;
const LOG = `${ORIGIN}/workspaces/agent/${agentId}/log?channel=TRANSCRIPT`;
const DRAFT = `/workspaces/api/agents/${agentId}/prompt-draft`;

describe('AgentChatPage', () => {
  let http: HttpTestingController;
  let streams: string[];
  let sockets: string[];
  let loads: string[];
  let harness: RouterTestingHarness;
  let agent: typeof AGENT;

  beforeEach(async () => {
    streams = [];
    sockets = [];
    loads = [];
    agent = AGENT;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([
          {
            path: 'agent/:agentId',
            children: [
              { path: 'chat', component: AgentChatPage },
              { path: 'files', children: [] },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: AgentsStore,
          useValue: {
            agentOf: () => ({ status: 'loaded', agent }),
            loadAgent: (id: string) => loads.push(id),
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
            sockets.push(url);
            throw new Error('the Chat tab opens no socket');
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

  /** Opens the tab; with a slot, it reads the agent's transcript through the agent proxy. */
  async function open() {
    await harness.navigateByUrl(`/agent/${agentId}/chat`);
    await settle();
    harness.detectChanges();
  }

  /** Answers the draft's read with the recorded saved draft. */
  async function answerDraft() {
    http.expectOne(DRAFT).flush(workspacesGoldenMaster(DRAFTED, 'getAgentPromptDraft'));
    await settle();
    harness.detectChanges();
  }

  it('shows a running agent’s transcript, and the composer with the saved draft', async () => {
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    expect(streams).toEqual([`${ORIGIN}/workspaces/api/workspaces/1/events`]);
    expect(sockets).toEqual([]);
    expect(text()).toContain('its live screen is on the Terminal tab');
    expect(text()).toContain('Fixed: the user name is trimmed before the lookup.');
    const prompt = element().querySelectorAll('textarea')[1];
    expect(prompt.value).toBe('Check the rounding in the invoice totals.');
    expect(text()).toContain('Restored draft from');
    expect(button('Terminate')).toBeUndefined();
  });

  it('reads a running agent’s transcript again while it runs', async () => {
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

  it('reads a stopped agent’s transcript once, and says how it starts again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // The recorded agent, as a stop leaves it.
    agent = { ...AGENT, runState: 'STOPPED' };
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    expect(text()).toContain('This agent was stopped.');
    vi.advanceTimersByTime(TRANSCRIPT_POLL_MS * 2);
    await settle();
    http.expectNone(LOG);
  });

  it('says a transcript it could not read, and reads it again on request', async () => {
    await open();
    http.expectOne(LOG).flush(null, { status: 409, statusText: 'Conflict' });
    await answerDraft();
    expect(text()).toContain('Could not read the agent’s transcript.');
    button('Try again')!.click();
    await settle();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await settle();
    harness.detectChanges();
    expect(text()).toContain('Fixed: the user name is trimmed before the lookup.');
  });

  it('offers a queued agent the composer alone', async () => {
    // The recorded agent, before it got a slot.
    agent = { ...AGENT, workspaceRowId: null, runState: 'QUEUED' };
    await open();
    await answerDraft();
    expect(streams).toEqual([]);
    expect(text()).toContain('This agent has no workspace yet.');
    expect(button('Refine into prompt')).toBeUndefined();
  });

  it('opens a picked reference’s lines in the Files tab', async () => {
    const picked = TestBed.inject(PickedContext);
    picked.use(agentId);
    // Lines 3-4 of the daemon's recorded source file, as the Files tab picks them.
    const file = workspaceDaemonGoldenMaster(
      'a workspace daemon with an agent whose worktree holds files',
      'readFile',
    );
    picked.add({ path: file.path, startLine: 3, endLine: 4, excerpt: 'class Login {' });
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    element().querySelector<HTMLButtonElement>(`[aria-label="Open ${file.path}:3-4"]`)!.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe(
      `/agent/${agentId}/files?path=${encodeURIComponent(file.path)}&lines=3-4`,
    );
  });

  it('shows no speech control', async () => {
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    const labels = [...element().querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Record');
    expect(text()).not.toMatch(/dictat|microphone|transcrib/i);
  });

  it('reads nothing more once the tab is left', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await open();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await answerDraft();
    await harness.navigateByUrl(`/agent/${agentId}`);
    vi.advanceTimersByTime(TRANSCRIPT_POLL_MS * 2);
    await settle();
    http.expectNone(LOG);
    expect(loads).toEqual([]);
  });
});
