import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { addGoldenInteraction } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  DISCARD_AGENT,
  INTERRUPT_AGENT,
  REFUSAL,
  RESTART_AGENT,
  STOP_AGENT,
} from './agent-actions.consumes';
import {
  AGENT_DISCARD,
  AGENT_INTERRUPT,
  AGENT_RESTART,
  AGENT_STOP,
} from './agent-actions.operations';
import { refusalOf } from './refusals';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the agent page's writes make
 * (epic qits-1230) through `agent-actions.operations.ts` (qits-2146: moved here from
 * `agent-actions.store.pact.spec.ts` with `AgentActionsStore`, unchanged), in
 * `pacts/qits-landing-app_qits-workspaces-service.json` beside the other parts:
 *
 * - `discardAgent`: "an agent waiting for a workspace slot" is removed; "an agent whose workspace
 *   daemon is not connected" (409 `AGENT_DAEMON_UNREACHABLE`) and "an agent with leftover work"
 *   (409 `AGENT_HAS_LEFTOVER_WORK`) are refused, with the reason the page shows before it offers
 *   force. A forced discard (`force: true`) has no recording, so no interaction binds it; the plain
 *   spec covers it.
 *
 * - The agent's own verbs (epic qits-1667): `interruptAgent`, "an agent in the middle of a turn"
 *   gets ESC; `stopAgent`, "an agent working on a ticket" is STOPPED; `restartAgent`, the agent of
 *   "a stopped workspace slot" is handed back to the scheduler (YIELDED).
 *
 * A slot's container verbs are `container-actions.operations`' part.
 *
 * Ids in a path are the states' params, sent as provider-state expressions.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const WAITING = 'an agent waiting for a workspace slot';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const LEFTOVER = 'an agent with leftover work';
const MID_TURN = 'an agent in the middle of a turn';
const WORKING = 'an agent working on a ticket';
const STOPPED_SLOT = 'a stopped workspace slot';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
  'discardAgent',
  'interruptAgent',
  'stopAgent',
  'restartAgent',
];

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

/**
 * Runs an operation's `fetch` against the mock server at `url`, in an injection context, and says
 * what it came to as the pages read it: the answer, or the refusal (`refusalOf`).
 */
async function at<T>(
  url: string,
  call: () => Promise<{ data?: T; error?: unknown; response?: { status: number } }>,
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  const { data, error, response } = await TestBed.runInInjectionContext(call);
  return error !== undefined || data === undefined
    ? refusalOf(error, response)
    : ({ ok: true, value: data } as const);
}

/** The agent `id`'s path, as the operations take it. */
const agent = (id: string) => ({ path: { id } });

const params = (state: string, operationId: string) => masters.operation(state, operationId).params;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-actions-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: the workspace pages’ writes', () => {
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

  it('discard-agent: an agent waiting for a slot is removed', () =>
    given(WAITING, 'discardAgent', 'discard-agent', DISCARD_AGENT).executeTest(async (server) => {
      const id = params(WAITING, 'discardAgent')['agentId'];
      const outcome = await at(server.url, () =>
        AGENT_DISCARD.fetch({ ...agent(id), body: { force: false } }),
      );
      expect(outcome.ok && outcome.value.state).toBe('REMOVED');
    }));

  it('discard-agent: an agent whose daemon does not answer is refused, with the reason', () =>
    given(UNREACHABLE, 'discardAgent', 'discard-agent', REFUSAL).executeTest(async (server) => {
      const id = params(UNREACHABLE, 'discardAgent')['agentId'];
      const outcome = await at(server.url, () =>
        AGENT_DISCARD.fetch({ ...agent(id), body: { force: false } }),
      );
      expect(outcome).toMatchObject({ ok: false, status: 409, code: 'AGENT_DAEMON_UNREACHABLE' });
      expect(!outcome.ok && outcome.message).toBeTruthy();
    }));

  it('discard-agent: an agent with leftover work is refused, with the reason', () =>
    given(LEFTOVER, 'discardAgent', 'discard-agent', REFUSAL).executeTest(async (server) => {
      const id = params(LEFTOVER, 'discardAgent')['agentId'];
      const outcome = await at(server.url, () =>
        AGENT_DISCARD.fetch({ ...agent(id), body: { force: false } }),
      );
      expect(outcome).toMatchObject({ ok: false, status: 409, code: 'AGENT_HAS_LEFTOVER_WORK' });
      expect(!outcome.ok && outcome.message).toBeTruthy();
    }));

  it('interrupt-agent: an agent in the middle of a turn gets ESC', () =>
    given(MID_TURN, 'interruptAgent', 'interrupt-agent', INTERRUPT_AGENT).executeTest(
      async (server) => {
        const id = params(MID_TURN, 'interruptAgent')['agentId'];
        const outcome = await at(server.url, () => AGENT_INTERRUPT.fetch(agent(id)));
        expect(outcome.ok && outcome.value.interrupted).toBe(true);
      },
    ));

  it('stop-agent: an agent working on a ticket is stopped', () =>
    given(WORKING, 'stopAgent', 'stop-agent', STOP_AGENT).executeTest(async (server) => {
      const id = params(WORKING, 'stopAgent')['agentId'];
      const outcome = await at(server.url, () => AGENT_STOP.fetch(agent(id)));
      expect(outcome.ok && outcome.value.runState).toBe('STOPPED');
    }));

  it('restart-agent: a stopped slot’s agent is handed back to the scheduler', () =>
    given(STOPPED_SLOT, 'restartAgent', 'restart-agent', RESTART_AGENT).executeTest(
      async (server) => {
        const id = params(STOPPED_SLOT, 'restartAgent')['agentId'];
        const outcome = await at(server.url, () => AGENT_RESTART.fetch(agent(id)));
        expect(outcome.ok && outcome.value.runState).toBe('YIELDED');
      },
    ));
});
