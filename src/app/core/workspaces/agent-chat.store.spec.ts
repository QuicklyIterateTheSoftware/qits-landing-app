import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
} from '../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { AgentChatStore } from './agent-chat.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const TURNS = 'a workspace daemon with an agent that has taken turns';
const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const ORIGIN = 'https://workspaces.qits.example';
const { agentId } = workspaceDaemonGoldenMasters.operation(TURNS, 'getCommandLog').params;
/** The agent's routes on qits-workspaces' agent proxy. */
const AGENT = `${ORIGIN}/workspaces/agent/${agentId}`;
const LOG = `${AGENT}/log?channel=TRANSCRIPT`;
/** `AgentChatStore` on qits-workspace-daemon's recorded states, through the agent proxy. */
describe('AgentChatStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentChatStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentChatStore);
  });

  afterEach(() => http.verify());

  it('reads the agent’s transcript by its id, in sequence order', async () => {
    const done = store.loadTranscript(agentId);
    expect(store.transcriptOf(agentId)?.status).toBe('loading');
    await settle();
    // The recorded log, its lines reversed: the store orders them by `sequence`.
    const log = workspaceDaemonGoldenMaster(TURNS, 'getCommandLog');
    const recorded = log.lines.map((line: { content: string }) => line.content);
    log.lines.reverse();
    http.expectOne(LOG).flush(log);
    await done;
    expect(store.transcriptOf(agentId)).toEqual({ status: 'loaded', lines: recorded });
  });

  it('keeps the last good lines when a read again fails', async () => {
    let done = store.loadTranscript(agentId);
    await settle();
    http.expectOne(LOG).flush(workspaceDaemonGoldenMaster(TURNS, 'getCommandLog'));
    await done;
    done = store.loadTranscript(agentId);
    await settle();
    http.expectOne(LOG).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await done;
    expect(store.transcriptOf(agentId)?.lines).toHaveLength(4);
  });

  it('says a transcript it never read failed', async () => {
    const done = store.loadTranscript(agentId);
    await settle();
    http.expectOne(LOG).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await done;
    expect(store.transcriptOf(agentId)).toEqual({ status: 'error', lines: [] });
  });

  it('reads nothing without an agent', async () => {
    await store.loadTranscript('');
    expect(store.transcriptOf('')).toBeUndefined();
  });

  it('rewrites rough notes into a prompt, with what the work is about', async () => {
    const done = store.refine(agentId, 'the login fails', 'contract-00000001-10: Fix the login');
    await settle();
    const request = http.expectOne(`${AGENT}/prompt-refinements`);
    expect(request.request.body).toEqual({
      transcript: 'the login fails',
      preamble: 'contract-00000001-10: Fix the login',
    });
    const answer = workspaceDaemonGoldenMaster(SIGNED_IN, 'refinePrompt');
    request.flush(answer);
    expect(await done).toEqual({ ok: true, value: answer.prompt });
  });
});
