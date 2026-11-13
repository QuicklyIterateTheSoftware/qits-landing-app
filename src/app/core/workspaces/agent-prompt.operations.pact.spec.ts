import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { addGoldenInteraction, type GoldenMasters } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  DELETE_PROMPT_DRAFT,
  GET_PROMPT_DRAFT,
  PROMPT_AGENT,
  SAVE_PROMPT_DRAFT,
} from './agent-prompt.consumes';
import {
  AGENT_PROMPT,
  PROMPT_DRAFT,
  PROMPT_DRAFT_DELETE,
  PROMPT_DRAFT_SAVE,
} from './agent-prompt.operations';
import { draftText, promptDraftOf, promptParams, saveDraftParams } from './prompt-drafts';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the agent's Chat tab makes (epic
 * qits-1230) through `agent-prompt.operations.ts` (qits-2146: moved here from
 * `agent-prompt.store.pact.spec.ts` with `AgentPromptStore`, unchanged), in
 * `pacts/qits-landing-app_qits-workspaces-service.json` beside the other parts:
 *
 * - "an agent with a saved prompt draft": the draft restored, written and thrown away;
 * - "an agent with no prompt draft": nothing was ever composed (404);
 *
 * The agent's id is a param, so the draft's path takes it as a provider-state expression.
 *
 * - "an agent working on a ticket": the prompt, sent to the agent by its id (`promptAgent`, epic
 *   qits-1667), which it hears as its first turn. The recorded text is what the composer sends. The
 *   work item delivery door the tab used before (`deliverAgentTurn`) is no longer called.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const SAVED = 'an agent with a saved prompt draft';
const NONE = 'an agent with no prompt draft';
const WORKING = 'an agent working on a ticket';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
  'getAgentPromptDraft',
  'saveAgentPromptDraft',
  'deleteAgentPromptDraft',
  'promptAgent',
];

/**
 * qits-workspaces' golden masters, where a recording without a body (the draft's DELETE, a 204)
 * reads as no body rather than as a file that is not there.
 */
const masters: GoldenMasters = {
  operation: (state, operationId) => workspacesGoldenMasters.operation(state, operationId),
  body: <T>(state: string, operationId: string) =>
    (workspacesGoldenMasters.operation(state, operationId).file
      ? workspacesGoldenMasters.body<T>(state, operationId)
      : undefined) as T,
  text: (state, operationId) => workspacesGoldenMasters.text(state, operationId),
};

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

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

const agentOf = (state: string, operationId: string) =>
  masters.operation(state, operationId).params['agentId'];

/** What the recording of `operationId` in `state` sent. */
const sent = <T>(state: string, operationId: string) =>
  masters.operation(state, operationId).body as T;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-prompt-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: the agent’s prompt', () => {
  afterAll(() => {
    workspacesClient.setConfig({ baseUrl: '' });
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

  it('show-agent-chat: the saved draft is restored', () =>
    given(SAVED, 'getAgentPromptDraft', 'show-agent-chat', GET_PROMPT_DRAFT).executeTest(
      async (server) => {
        const id = agentOf(SAVED, 'getAgentPromptDraft');
        const { data } = await at(server.url, () => PROMPT_DRAFT.fetch({ path: { id } }));
        const recorded = masters.body<{ draft: { content: string } }>(SAVED, 'getAgentPromptDraft');
        expect(promptDraftOf(data)?.text).toBe(draftText(recorded.draft.content));
      },
    ));

  it('show-agent-chat: an agent never given a draft has none', () =>
    given(NONE, 'getAgentPromptDraft', 'show-agent-chat', []).executeTest(async (server) => {
      const id = agentOf(NONE, 'getAgentPromptDraft');
      const { response } = await at(server.url, () => PROMPT_DRAFT.fetch({ path: { id } }));
      expect(response?.status).toBe(404);
    }));

  it('save-prompt-draft: the prompt box is saved', () =>
    given(SAVED, 'saveAgentPromptDraft', 'save-prompt-draft', SAVE_PROMPT_DRAFT).executeTest(
      async (server) => {
        const { content } = sent<{ content: string }>(SAVED, 'saveAgentPromptDraft');
        const id = agentOf(SAVED, 'saveAgentPromptDraft');
        const { data } = await at(server.url, () =>
          PROMPT_DRAFT_SAVE.fetch(saveDraftParams(id, draftText(content))),
        );
        expect(data?.draft?.updatedAt).toBeTruthy();
      },
    ));

  for (const slug of ['discard-prompt-draft', 'send-agent-prompt'] as const) {
    it(`${slug}: the draft is thrown away`, () =>
      given(SAVED, 'deleteAgentPromptDraft', slug, DELETE_PROMPT_DRAFT).executeTest(
        async (server) => {
          const id = agentOf(SAVED, 'deleteAgentPromptDraft');
          const { error } = await at(server.url, () => PROMPT_DRAFT_DELETE.fetch({ path: { id } }));
          expect(error).toBeUndefined();
        },
      ));
  }

  it('send-agent-prompt: the agent hears the prompt as its first turn', () =>
    given(WORKING, 'promptAgent', 'send-agent-prompt', PROMPT_AGENT).executeTest(async (server) => {
      const { text } = sent<{ text: string }>(WORKING, 'promptAgent');
      const id = agentOf(WORKING, 'promptAgent');
      const { data } = await at(server.url, () => AGENT_PROMPT.fetch(promptParams(id, text)));
      expect(data?.launched).toBe(true);
    }));
});
