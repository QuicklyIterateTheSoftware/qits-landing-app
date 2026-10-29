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
import { heldBy, workspacesGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { REFUSAL_MESSAGE } from './agent-actions.consumes';
import { ENSURE_CONTAINER, STOP_CONTAINER } from './container-actions.consumes';
import { ContainerActionsStore } from './container-actions.store';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part a slot's container verbs make
 * (epic qits-1230), on the workspace page only (epic qits-1667), in
 * `pacts/qits-landing-app_qits-workspaces-service.json` beside the other stores' parts:
 *
 * - `ensureWorkspaceContainer`: "a stopped workspace slot" starts (its WORKSPACE lease queued on
 *   qits-system's targets).
 * - `stopWorkspaceContainer`: "a workspace slot running on a target" stops. The row binds the
 *   paths of `STOP_CONTAINER` the recording holds (`heldBy`): the pinned golden masters predate
 *   `affectedAgentIds` (epic qits-1667), so it is bound once qits-maintenance bumps them.
 * - `recreateWorkspaceContainer`: only its refusal is recorded — "an agent whose workspace daemon
 *   is not connected" (400: the working tree cannot be proved clean). A successful recreate has no
 *   recording, so the success path is covered by the plain spec only.
 *
 * Does not bind the refusal of either write when qits-system cannot be asked about the slot's lease
 * (409 `TARGET_UNAVAILABLE`, "a workspace slot qits-system cannot be asked about"), the successor of
 * the retired offline-runner refusal (epic qits-1481, qits-1532); the plain spec covers it.
 *
 * Ids in a path are the states' params, sent as provider-state expressions.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const STOPPED = 'a stopped workspace slot';
const RUNNING = 'a workspace slot running on a target';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
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
  return TestBed.inject(ContainerActionsStore);
}

const params = (state: string, operationId: string) => masters.operation(state, operationId).params;
const slotOf = (state: string, operationId: string) =>
  Number(params(state, operationId)['workspaceId']);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-container-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: a slot’s container verbs', () => {
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
      heldBy(masters, RUNNING, 'stopWorkspaceContainer', STOP_CONTAINER),
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
