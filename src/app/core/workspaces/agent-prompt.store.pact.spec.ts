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
  DELIVER_AGENT_TURN,
  GET_PROMPT_DRAFT,
  SAVE_PROMPT_DRAFT,
} from './agent-prompt.consumes';
import { AgentPromptStore, draftText } from './agent-prompt.store';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the agent's Chat tab makes (epic
 * qits-1230), in `pacts/qits-landing-app_qits-workspaces-service.json` beside the other stores'
 * parts:
 *
 * - "an agent with a saved prompt draft": the draft restored, written and thrown away;
 * - "an agent with no prompt draft": nothing was ever composed (404);
 * - "an agent working on a ticket": a prompt delivered, which the agent hears as its first turn;
 * - "a work item with no workspaces": no agent works on the item, so nothing was said.
 *
 * The agent's id is a param, so the draft's path takes it as a provider-state expression. A
 * delivery's recorded body names the item as a param (`{ticketId}`): it travels as it is, and the
 * provider puts its run's value in its place.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const SAVED = 'an agent with a saved prompt draft';
const NONE = 'an agent with no prompt draft';
const WORKING = 'an agent working on a ticket';
const NO_AGENT = 'a work item with no workspaces';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
  'getAgentPromptDraft',
  'saveAgentPromptDraft',
  'deleteAgentPromptDraft',
  'deliverAgentTurn',
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

/** The store, calling the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  return TestBed.inject(AgentPromptStore);
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
        const store = storeAt(server.url);
        const outcome = await store.readDraft(agentOf(SAVED, 'getAgentPromptDraft'));
        const recorded = masters.body<{ draft: { content: string } }>(SAVED, 'getAgentPromptDraft');
        expect(outcome.ok && outcome.value?.text).toBe(draftText(recorded.draft.content));
      },
    ));

  it('show-agent-chat: an agent never given a draft has none', () =>
    given(NONE, 'getAgentPromptDraft', 'show-agent-chat', []).executeTest(async (server) => {
      const store = storeAt(server.url);
      expect(await store.readDraft(agentOf(NONE, 'getAgentPromptDraft'))).toEqual({
        ok: true,
        value: null,
      });
    }));

  it('save-prompt-draft: the prompt box is saved', () =>
    given(SAVED, 'saveAgentPromptDraft', 'save-prompt-draft', SAVE_PROMPT_DRAFT).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { content } = sent<{ content: string }>(SAVED, 'saveAgentPromptDraft');
        const outcome = await store.saveDraft(
          agentOf(SAVED, 'saveAgentPromptDraft'),
          draftText(content),
        );
        expect(outcome.ok && outcome.value.updatedAt).toBeTruthy();
      },
    ));

  for (const slug of ['discard-prompt-draft', 'send-agent-prompt'] as const) {
    it(`${slug}: the draft is thrown away`, () =>
      given(SAVED, 'deleteAgentPromptDraft', slug, DELETE_PROMPT_DRAFT).executeTest(
        async (server) => {
          const store = storeAt(server.url);
          const outcome = await store.discardDraft(agentOf(SAVED, 'deleteAgentPromptDraft'));
          expect(outcome.ok).toBe(true);
        },
      ));
  }

  it('send-agent-prompt: the agent hears the prompt as its first turn', () =>
    given(WORKING, 'deliverAgentTurn', 'send-agent-prompt', DELIVER_AGENT_TURN).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { workId, text } = sent<{ workId: string; text: string }>(
          WORKING,
          'deliverAgentTurn',
        );
        const outcome = await store.deliver(workId, text);
        expect(outcome.ok && outcome.value.launched).toBe(true);
        expect(outcome.ok && outcome.value.agentId).toBeTruthy();
      },
    ));

  it('send-agent-prompt: no agent works on the item, so nothing is said', () =>
    given(NO_AGENT, 'deliverAgentTurn', 'send-agent-prompt', DELIVER_AGENT_TURN).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const { workId, text } = sent<{ workId: string; text: string }>(
          NO_AGENT,
          'deliverAgentTurn',
        );
        const outcome = await store.deliver(workId, text);
        expect(outcome.ok && outcome.value.agentId).toBeNull();
      },
    ));
});
