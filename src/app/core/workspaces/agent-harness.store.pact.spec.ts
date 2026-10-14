import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { getAgentWorktree, listCommands } from '../../api/workspace-daemon';
import type { InteractionSlug } from '../../interactions';
import { workspaceDaemonGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { GET_AGENT_WORKTREE, LIST_COMMANDS } from './agent-harness.consumes';
import { AgentHarnessStore, containerBase } from './agent-harness.store';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentHarnessStore`
 * makes, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside
 * `agent-chat.store.pact.spec.ts`'s part: the agent's Terminal and Chat tabs finding the harness,
 * through qits-workspaces' container proxy (`/workspaces/container/{workspaceRowId}/…`).
 *
 * - "a workspace daemon with an agent running": the agent's worktree names its harness's command,
 *   and the container's commands hold it, RUNNING, as a TERMINAL (both tabs);
 * - "a workspace daemon with an agent chatting": the same command RUNNING as a CHAT (the Chat tab
 *   attaches to its socket);
 * - "a workspace daemon with a signed-in harness": the daemon has not started the agent, so its
 *   worktree answers 404.
 *
 * The slot's row id and the agent's id are the states' params; the path takes them as provider-state
 * expressions (`addGoldenInteraction`).
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspace-daemon';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const RUNNING = 'a workspace daemon with an agent running';
const CHATTING = 'a workspace daemon with an agent chatting';
const NOT_STARTED = 'a workspace daemon with a signed-in harness';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['getAgentWorktree', 'listCommands'];

const given = (
  state: string,
  operationId: string,
  consumes: readonly string[],
  interaction: InteractionSlug = 'show-agent-terminal',
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });

/** The store, calling qits-workspaces' origin at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspaceDaemonClient),
      provideTestPlatformOrigins({ workspaces: url }),
    ],
  });
  return TestBed.inject(AgentHarnessStore);
}

const params = (state: string) => masters.operation(state, 'getAgentWorktree').params;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-daemon-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspace-daemon pact: the agent’s harness', () => {
  afterAll(() => {
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-agent-terminal: the agent’s worktree names its harness’s command', () =>
    given(RUNNING, 'getAgentWorktree', GET_AGENT_WORKTREE).executeTest(async (server) => {
      const { workspaceRowId, agentId } = params(RUNNING);
      storeAt(server.url);
      const { data } = await TestBed.runInInjectionContext(() =>
        consume(
          getAgentWorktree({
            baseUrl: containerBase(server.url, Number(workspaceRowId)),
            path: { agentId },
          }),
          GET_AGENT_WORKTREE,
        ),
      );
      expect(data?.commandId).toBe(params(RUNNING)['commandId']);
    }));

  it('show-agent-terminal: the container runs that command, as a terminal', () =>
    given(RUNNING, 'listCommands', LIST_COMMANDS).executeTest(async (server) => {
      const { workspaceRowId, commandId } = params(RUNNING);
      storeAt(server.url);
      const { data } = await TestBed.runInInjectionContext(() =>
        consume(
          listCommands({ baseUrl: containerBase(server.url, Number(workspaceRowId)) }),
          LIST_COMMANDS,
        ),
      );
      const command = data?.entries.find((entry) => entry.command.id === commandId)?.command;
      expect(command?.status).toBe('RUNNING');
      expect(command?.kind).toBe('TERMINAL');
    }));

  it('show-agent-terminal: an agent the daemon has not started is missing', () =>
    given(NOT_STARTED, 'getAgentWorktree', []).executeTest(async (server) => {
      const { workspaceRowId, agentId } = params(NOT_STARTED);
      const store = storeAt(server.url);
      await store.load(Number(workspaceRowId), agentId);
      expect(store.harnessOf(Number(workspaceRowId), agentId)).toEqual({
        status: 'missing',
        kind: 'none',
        commandId: null,
        running: false,
      });
    }));

  it('show-agent-chat: the agent’s worktree names its harness’s command', () =>
    given(RUNNING, 'getAgentWorktree', GET_AGENT_WORKTREE, 'show-agent-chat').executeTest(
      async (server) => {
        const { workspaceRowId, agentId, commandId } = params(RUNNING);
        storeAt(server.url);
        const { data } = await TestBed.runInInjectionContext(() =>
          consume(
            getAgentWorktree({
              baseUrl: containerBase(server.url, Number(workspaceRowId)),
              path: { agentId },
            }),
            GET_AGENT_WORKTREE,
          ),
        );
        expect(data?.commandId).toBe(commandId);
      },
    ));

  it('show-agent-chat: the container runs that command in a terminal', () =>
    given(RUNNING, 'listCommands', LIST_COMMANDS, 'show-agent-chat').executeTest(async (server) => {
      const { workspaceRowId, commandId } = params(RUNNING);
      storeAt(server.url);
      const { data } = await TestBed.runInInjectionContext(() =>
        consume(
          listCommands({ baseUrl: containerBase(server.url, Number(workspaceRowId)) }),
          LIST_COMMANDS,
        ),
      );
      const command = data?.entries.find((entry) => entry.command.id === commandId)?.command;
      expect(command?.kind).toBe('TERMINAL');
    }));

  it('show-agent-chat: the container runs that command as a chat', () =>
    given(CHATTING, 'listCommands', LIST_COMMANDS, 'show-agent-chat').executeTest(
      async (server) => {
        const { workspaceRowId, commandId } = masters.operation(CHATTING, 'listCommands').params;
        storeAt(server.url);
        const { data } = await TestBed.runInInjectionContext(() =>
          consume(
            listCommands({ baseUrl: containerBase(server.url, Number(workspaceRowId)) }),
            LIST_COMMANDS,
          ),
        );
        const command = data?.entries.find((entry) => entry.command.id === commandId)?.command;
        expect(command?.status).toBe('RUNNING');
        expect(command?.kind).toBe('CHAT');
      },
    ));
});
