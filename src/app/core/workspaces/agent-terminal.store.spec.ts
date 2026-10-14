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
import { AgentTerminalStore, containerBase } from './agent-terminal.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const RUNNING = 'a workspace daemon with an agent running';
const NOT_STARTED = 'a workspace daemon with a signed-in harness';
const ORIGIN = 'https://workspaces.qits.example';

const { agentId, workspaceRowId, commandId } = workspaceDaemonGoldenMasters.operation(
  RUNNING,
  'getAgentWorktree',
).params;
const ROW = Number(workspaceRowId);
const BASE = `${ORIGIN}/workspaces/container/${ROW}`;

/** `AgentTerminalStore` on qits-workspace-daemon's recorded states (epic qits-1230). */
describe('AgentTerminalStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentTerminalStore>;

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
    store = TestBed.inject(AgentTerminalStore);
  });

  afterEach(() => http.verify());

  async function answerWorktree(body: object, status = 200) {
    await settle();
    http
      .expectOne(`${BASE}/agent-worktrees/${agentId}`)
      .flush(body, { status, statusText: status === 200 ? 'OK' : 'Not Found' });
    await settle();
  }

  it('puts the daemon behind qits-workspaces’ container proxy', () => {
    expect(containerBase(ORIGIN, 7)).toBe(`${ORIGIN}/workspaces/container/7`);
  });

  it('finds the running harness’s command, a terminal', async () => {
    const done = store.load(ROW, agentId);
    expect(store.harnessOf(ROW, agentId)?.status).toBe('loading');
    await answerWorktree(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    http.expectOne(`${BASE}/commands`).flush(workspaceDaemonGoldenMaster(RUNNING, 'listCommands'));
    await done;
    expect(store.harnessOf(ROW, agentId)).toEqual({
      status: 'loaded',
      kind: 'terminal',
      commandId,
    });
  });

  it('calls a harness that runs as a chat a chat', async () => {
    const done = store.load(ROW, agentId);
    await answerWorktree(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    // The recorded list, with its one command a CHAT instead of a TERMINAL.
    const list = workspaceDaemonGoldenMaster(RUNNING, 'listCommands');
    list.entries[0].command.kind = 'CHAT';
    http.expectOne(`${BASE}/commands`).flush(list);
    await done;
    expect(store.harnessOf(ROW, agentId)?.kind).toBe('chat');
  });

  it('shows no harness when its command is not running', async () => {
    const done = store.load(ROW, agentId);
    await answerWorktree(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    // The recorded list, with its one command EXITED.
    const list = workspaceDaemonGoldenMaster(RUNNING, 'listCommands');
    list.entries[0].command.status = 'EXITED';
    http.expectOne(`${BASE}/commands`).flush(list);
    await done;
    expect(store.harnessOf(ROW, agentId)).toEqual({
      status: 'loaded',
      kind: 'none',
      commandId: null,
    });
  });

  it('asks for no commands when the worktree names none', async () => {
    const done = store.load(ROW, agentId);
    // The recorded worktree, after a container restart: no command yet.
    const worktree = workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree');
    worktree.commandId = null;
    await answerWorktree(worktree);
    await done;
    expect(store.harnessOf(ROW, agentId)?.kind).toBe('none');
  });

  it('calls an agent the daemon has not started missing', async () => {
    const done = store.load(ROW, agentId);
    await answerWorktree(workspaceDaemonGoldenMaster(NOT_STARTED, 'getAgentWorktree'), 404);
    await done;
    expect(store.harnessOf(ROW, agentId)?.status).toBe('missing');
  });

  it('keeps the last good answer when a read again fails', async () => {
    let done = store.load(ROW, agentId);
    await answerWorktree(workspaceDaemonGoldenMaster(RUNNING, 'getAgentWorktree'));
    http.expectOne(`${BASE}/commands`).flush(workspaceDaemonGoldenMaster(RUNNING, 'listCommands'));
    await done;
    done = store.load(ROW, agentId);
    await settle();
    http
      .expectOne(`${BASE}/agent-worktrees/${agentId}`)
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    await done;
    expect(store.harnessOf(ROW, agentId)?.kind).toBe('terminal');
  });

  it('reads nothing for a queued agent', async () => {
    await store.load(0, agentId);
    expect(store.harnessOf(0, agentId)).toBeUndefined();
  });
});
