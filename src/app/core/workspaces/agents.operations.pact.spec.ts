import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  LIST_PROJECT_ACTIVE_AGENTS,
  LIST_WRAPPER_AGENTS,
  LIST_WRAPPER_SLOTS,
} from './agents.operations';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the Agents page's operations make
 * (`agents.operations.ts`, qits-2143), in `pacts/qits-landing-app_qits-workspaces-service.json`
 * beside `agents.store.pact.spec.ts`'s and `workspaces.store.pact.spec.ts`'s parts:
 *
 * - "a project with workspace slots hosting agents" (`show-project-workspaces`): the wrapper's
 *   slots — one RUNNING on a target, hosting the bug ticket's and the epic's agents — and every
 *   agent, the improvement ticket's QUEUED one with no slot among them. Moved here from
 *   `agents.store.pact.spec.ts` with `AgentsStore.loadProject`, unchanged;
 * - "a project with agents needing attention" (`show-project-agents`): the project's ACTIVE agents
 *   with their open waits and attention, the same request and state as the agents menu's
 *   `agents-menu` interaction, under the page's own trigger.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), so the pact and what the page reads cannot drift
 * apart, and each test runs the operation's own `fetch` against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const PROJECT = 'a project with workspace slots hosting agents';
const NEEDING_ATTENTION = 'a project with agents needing attention';

const OPERATIONS: readonly OwnedOperation[] = [
  'listWorkspaces',
  { operationId: 'listAgents', interactions: ['show-project-workspaces', 'show-project-agents'] },
];

/** `state`'s param `name`, as the golden masters froze it. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

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

/**
 * The interaction for the operation `op` in `state`, triggered by `interaction`. The provider is
 * named as the literal `qits/pact-names` can check (it cannot read `op.provider`), and `op` must
 * name the same one.
 */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: op.consumes,
  });
};

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-agents-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: the Agents page’s operations', () => {
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

  it('show-project-workspaces: the wrapper’s slots', () =>
    given(LIST_WRAPPER_SLOTS, PROJECT, 'show-project-workspaces').executeTest(async (server) => {
      const repositoryId = param(PROJECT, 'listWorkspaces', 'repositoryId');
      const { data } = await at(server.url, () =>
        LIST_WRAPPER_SLOTS.fetch({ query: { repositoryId } }),
      );
      const slot = data?.entries?.[0]?.workspace;
      expect(slot?.placement).toBe('TARGET');
    }));

  it('show-project-workspaces: every agent, the wrapper’s among them', () =>
    given(LIST_WRAPPER_AGENTS, PROJECT, 'show-project-workspaces').executeTest(async (server) => {
      const { data } = await at(server.url, () => LIST_WRAPPER_AGENTS.fetch({}));
      const agents = data?.agents ?? [];
      // One shape per null pattern: the queued agent (no slot), the waiting one, the yielded one.
      expect(agents.some((a) => a.runState === 'QUEUED' && a.workspaceRowId === null)).toBe(true);
      expect(agents.some((a) => !!a.waitingOn && !!a.waitingOnSince)).toBe(true);
    }));

  it('show-project-agents: the project’s ACTIVE agents, with their waits and attention', () =>
    given(LIST_PROJECT_ACTIVE_AGENTS, NEEDING_ATTENTION, 'show-project-agents').executeTest(
      async (server) => {
        const projectId = param(NEEDING_ATTENTION, 'listAgents', 'projectId');
        const { data } = await at(server.url, () =>
          LIST_PROJECT_ACTIVE_AGENTS.fetch({ query: { projectId, state: 'ACTIVE' } }),
        );
        const agents = data?.agents ?? [];
        expect(agents).toHaveLength(5);
        expect(agents.some((a) => a.attention?.code === 'BLOCKED_NO_DESK')).toBe(true);
        expect(agents.every((a) => !!a.harness && !!a.wrapperBranch)).toBe(true);
      },
    ));
});
