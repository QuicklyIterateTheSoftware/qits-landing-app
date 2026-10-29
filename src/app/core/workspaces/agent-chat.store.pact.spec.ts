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
import { getCommandLog, refinePrompt } from '../../api/workspace-daemon';
import type { InteractionSlug } from '../../interactions';
import { workspaceDaemonGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { GET_TRANSCRIPT, REFINE_PROMPT } from './agent-chat.consumes';
import { containerBase } from './container-proxy';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentChatStore`
 * reads, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside the other stores' parts:
 * the agent's Chat tab.
 *
 * The store reaches the daemon through qits-workspaces' agent proxy (epic qits-1667,
 * `/workspaces/agent/{agentId}/log`, `/prompt-refinements`), which forwards each call to the
 * daemon's own address, `/workspaces/container/{workspaceRowId}/…` (the log at the agent's
 * command), and hands back the daemon's answer. So this spec makes the daemon's calls at that
 * address, with the store's own `consumes` lists; the store's addressing is the plain spec's.
 *
 * - "a workspace daemon with an agent that has taken turns": the harness's transcript
 *   (`channel=TRANSCRIPT`): the person's prompt, the agent's text, a tool call and its result;
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
const SIGNED_IN = 'a workspace daemon with a signed-in harness';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['getCommandLog', 'refinePrompt'];

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

/** Runs `call` with the daemon's generated client at the mock server, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspaceDaemonClient),
      provideTestPlatformOrigins({ workspaces: url }),
    ],
  });
  return TestBed.runInInjectionContext(call);
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
      const { data } = await at(server.url, () =>
        consume(
          getCommandLog({
            baseUrl: containerBase(server.url, Number(workspaceRowId)),
            path: { commandId },
            query: { channel: 'TRANSCRIPT' },
          }),
          GET_TRANSCRIPT,
        ),
      );
      expect(data?.lines.length).toBe(4);
      expect(JSON.parse(data!.lines[0].content).type).toBe('user');
    }));

  it('refine-agent-prompt: rough notes become a prompt', () =>
    given(SIGNED_IN, 'refinePrompt', 'refine-agent-prompt', REFINE_PROMPT).executeTest(
      async (server) => {
        const op = masters.operation(SIGNED_IN, 'refinePrompt');
        const sent = op.body as { transcript: string; preamble: string };
        const { data } = await at(server.url, () =>
          consume(
            refinePrompt({
              baseUrl: containerBase(server.url, Number(op.params['workspaceRowId'])),
              body: { transcript: sent.transcript, preamble: sent.preamble },
            }),
            REFINE_PROMPT,
          ),
        );
        expect(data?.prompt).toBe(
          masters.body<{ prompt: string }>(SIGNED_IN, 'refinePrompt').prompt,
        );
      },
    ));
});
