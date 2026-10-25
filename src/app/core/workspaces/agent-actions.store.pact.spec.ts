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
  CREATE_AGENT,
  DISCARD_AGENT,
  ENSURE_CONTAINER,
  REFUSAL,
  REFUSAL_MESSAGE,
  STOP_CONTAINER,
} from './agent-actions.consumes';
import { AgentActionsStore, type NewAgent } from './agent-actions.store';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the workspace pages' writes make
 * (epic qits-1230), in `pacts/qits-landing-app_qits-workspaces-service.json` beside the other
 * stores' parts:
 *
 * - `createAgent`: "a wrapper repository and a ticket to dispatch" makes a new agent (harness and
 *   first instruction chosen); "a workspace slot hosting agents" answers the item's ACTIVE agent
 *   (`fresh: false`; nothing chosen, the service's default harness).
 * - `discardAgent`: "an agent waiting for a workspace slot" is removed; "an agent whose workspace
 *   daemon is not connected" (409 `AGENT_DAEMON_UNREACHABLE`) and "an agent with leftover work"
 *   (409 `AGENT_HAS_LEFTOVER_WORK`) are refused, with the reason the page shows before it offers
 *   force. A forced discard (`force: true`) has no recording, so no interaction binds it; the plain
 *   spec covers it.
 * - `ensureWorkspaceContainer`: "a stopped workspace slot" starts (its WORKSPACE lease queued on
 *   qits-system's targets).
 * - `stopWorkspaceContainer`: "a workspace slot running on a target" stops.
 * - `recreateWorkspaceContainer`: only its refusal is recorded — "an agent whose workspace daemon
 *   is not connected" (400: the working tree cannot be proved clean). A successful recreate has no
 *   recording, so the success path is covered by the plain spec only.
 *
 * Does not bind the refusal of either write when qits-system cannot be asked about the slot's lease
 * (409 `TARGET_UNAVAILABLE`, "a workspace slot qits-system cannot be asked about"), the successor of
 * the retired offline-runner refusal (epic qits-1481, qits-1532); the plain spec covers it.
 *
 * Ids in a path are the states' params, sent as provider-state expressions. A create's recorded
 * body names its ids as params (`{ticketId}`): it travels as it is, and the provider puts its run's
 * values in their place.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const TO_DISPATCH = 'a wrapper repository and a ticket to dispatch';
const HOSTING = 'a workspace slot hosting agents';
const WAITING = 'an agent waiting for a workspace slot';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const LEFTOVER = 'an agent with leftover work';
const STOPPED = 'a stopped workspace slot';
const RUNNING = 'a workspace slot running on a target';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
  'createAgent',
  'discardAgent',
  'ensureWorkspaceContainer',
  'stopWorkspaceContainer',
  'recreateWorkspaceContainer',
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
  return TestBed.inject(AgentActionsStore);
}

const params = (state: string, operationId: string) => masters.operation(state, operationId).params;
const slotOf = (state: string, operationId: string) =>
  Number(params(state, operationId)['workspaceId']);

/** What the recording of `operationId` in `state` sent. */
const sent = <T>(state: string, operationId: string) =>
  masters.operation(state, operationId).body as T;

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

  it('create-agent: a ticket gets a new agent, in the chosen harness', () =>
    given(TO_DISPATCH, 'createAgent', 'create-agent', CREATE_AGENT).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.createAgent(sent<NewAgent>(TO_DISPATCH, 'createAgent'));
      expect(outcome.ok && outcome.value.fresh).toBe(true);
      expect(outcome.ok && outcome.value.agent?.agentId).toBeTruthy();
    }));

  it('create-agent: an item that has an agent answers that one', () =>
    given(HOSTING, 'createAgent', 'create-agent', CREATE_AGENT).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.createAgent(sent<NewAgent>(HOSTING, 'createAgent'));
      expect(outcome.ok && outcome.value.fresh).toBe(false);
    }));

  it('discard-agent: an agent waiting for a slot is removed', () =>
    given(WAITING, 'discardAgent', 'discard-agent', DISCARD_AGENT).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.discardAgent(params(WAITING, 'discardAgent')['agentId']);
      expect(outcome.ok && outcome.value.state).toBe('REMOVED');
    }));

  it('discard-agent: an agent whose daemon does not answer is refused, with the reason', () =>
    given(UNREACHABLE, 'discardAgent', 'discard-agent', REFUSAL).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.discardAgent(params(UNREACHABLE, 'discardAgent')['agentId']);
      expect(outcome).toMatchObject({ ok: false, status: 409, code: 'AGENT_DAEMON_UNREACHABLE' });
      expect(!outcome.ok && outcome.message).toBeTruthy();
    }));

  it('discard-agent: an agent with leftover work is refused, with the reason', () =>
    given(LEFTOVER, 'discardAgent', 'discard-agent', REFUSAL).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.discardAgent(params(LEFTOVER, 'discardAgent')['agentId']);
      expect(outcome).toMatchObject({ ok: false, status: 409, code: 'AGENT_HAS_LEFTOVER_WORK' });
      expect(!outcome.ok && outcome.message).toBeTruthy();
    }));

  it('start-workspace-container: a stopped slot starts', () =>
    given(
      STOPPED,
      'ensureWorkspaceContainer',
      'start-workspace-container',
      ENSURE_CONTAINER,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.ensureContainer(slotOf(STOPPED, 'ensureWorkspaceContainer'));
      expect(outcome.ok && outcome.value.technicalProcessId).toBeTruthy();
    }));

  it('stop-workspace-container: a running slot stops', () =>
    given(
      RUNNING,
      'stopWorkspaceContainer',
      'stop-workspace-container',
      STOP_CONTAINER,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.stopContainer(slotOf(RUNNING, 'stopWorkspaceContainer'));
      expect(outcome.ok && outcome.value.runtimeStatus).toBe('STOPPED');
    }));

  it('recreate-workspace-container: a working tree nobody can prove clean is refused', () =>
    given(
      UNREACHABLE,
      'recreateWorkspaceContainer',
      'recreate-workspace-container',
      REFUSAL_MESSAGE,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.recreateContainer(
        slotOf(UNREACHABLE, 'recreateWorkspaceContainer'),
      );
      expect(outcome).toMatchObject({ ok: false, status: 400 });
      expect(!outcome.ok && outcome.message).toBeTruthy();
    }));
});
