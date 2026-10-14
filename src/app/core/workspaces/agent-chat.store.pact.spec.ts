import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import { addGoldenInteraction } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { workspaceDaemonGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { GET_TRANSCRIPT, REFINE_PROMPT, TERMINATE_COMMAND } from './agent-chat.consumes';
import { AgentChatStore } from './agent-chat.store';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentChatStore`
 * makes, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside
 * `agent-harness.store.pact.spec.ts`'s part: the agent's Chat tab, through qits-workspaces'
 * container proxy (`/workspaces/container/{workspaceRowId}/…`).
 *
 * - "a workspace daemon with an agent that has taken turns": the harness's transcript
 *   (`channel=TRANSCRIPT`): the person's prompt, the agent's text, a tool call and its result;
 * - "a workspace daemon with an agent chatting": Terminate ends the running chat;
 * - "a workspace daemon with a signed-in harness": rough notes rewritten into a prompt. The
 *   recorded notes and preamble are what the store sends.
 *
 * The slot's row id and the command's id are the states' params; the path takes them as
 * provider-state expressions (`addGoldenInteraction`).
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspace-daemon';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const TURNS = 'a workspace daemon with an agent that has taken turns';
const CHATTING = 'a workspace daemon with an agent chatting';
const SIGNED_IN = 'a workspace daemon with a signed-in harness';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['getCommandLog', 'terminateCommand', 'refinePrompt'];

const given = (
  state: string,
  operationId: string,
  interaction: InteractionSlug,
  consumes: readonly string[],
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
  return TestBed.inject(AgentChatStore);
}

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-chat-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspace-daemon pact: the agent’s chat', () => {
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

  it('show-agent-chat: the harness’s transcript, in order', () =>
    given(TURNS, 'getCommandLog', 'show-agent-chat', GET_TRANSCRIPT).executeTest(async (server) => {
      const { workspaceRowId, commandId } = masters.operation(TURNS, 'getCommandLog').params;
      const store = storeAt(server.url);
      await store.loadTranscript(Number(workspaceRowId), commandId);
      const transcript = store.transcriptOf(Number(workspaceRowId), commandId);
      expect(transcript?.status).toBe('loaded');
      expect(transcript?.lines.length).toBe(4);
      expect(JSON.parse(transcript!.lines[0]).type).toBe('user');
    }));

  it('terminate-agent-chat: the running chat ends', () =>
    given(CHATTING, 'terminateCommand', 'terminate-agent-chat', TERMINATE_COMMAND).executeTest(
      async (server) => {
        const { workspaceRowId, commandId } = masters.operation(
          CHATTING,
          'terminateCommand',
        ).params;
        const store = storeAt(server.url);
        expect(await store.terminate(Number(workspaceRowId), commandId)).toEqual({
          ok: true,
          value: undefined,
        });
      },
    ));

  it('refine-agent-prompt: rough notes become a prompt', () =>
    given(SIGNED_IN, 'refinePrompt', 'refine-agent-prompt', REFINE_PROMPT).executeTest(
      async (server) => {
        const op = masters.operation(SIGNED_IN, 'refinePrompt');
        const sent = op.body as { transcript: string; preamble: string };
        const store = storeAt(server.url);
        const outcome = await store.refine(
          Number(op.params['workspaceRowId']),
          sent.transcript,
          sent.preamble,
        );
        expect(outcome.ok && outcome.value).toBe(
          masters.body<{ prompt: string }>(SIGNED_IN, 'refinePrompt').prompt,
        );
      },
    ));
});
