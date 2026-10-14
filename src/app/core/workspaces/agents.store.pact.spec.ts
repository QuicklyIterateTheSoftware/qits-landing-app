import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatchersV3, PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { consume } from '@qits/angular';
import { addGoldenInteraction, type GoldenMasters } from '@qits/angular/testing';
import {
  getWorkspace,
  getWorkspaceActiveProcess,
  listAgents,
  listWorkspaces,
} from '../../api/workspaces';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  GET_ACTIVE_PROCESS,
  GET_SLOT,
  LIST_ITEM_AGENTS,
  LIST_PROJECT_AGENTS,
  LIST_PROJECT_SLOTS,
  LIST_SLOT_AGENTS,
} from './agents.consumes';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the workspace pages make (epic
 * qits-1230), in `pacts/qits-landing-app_qits-workspaces-service.json` beside
 * `workspaces.store.pact.spec.ts`'s part:
 *
 * - "a project with workspace slots hosting agents": the Workspaces page's slots and agents — one
 *   slot RUNNING on runner `localhost`, the bug ticket's agent holding it and waiting on a release
 *   request, the epic's agent yielded in it, the improvement ticket's agent QUEUED;
 * - "a workspace slot hosting agents": the same, read by the slot (no start is running);
 * - "an agent whose workspace is starting": the bug ticket's agent page while its slot is
 *   PROVISIONING and a start is live.
 *
 * The slot's row id is a param (`workspaceId`, frozen to its place in the state's write order); the
 * provider names its real value, so the path and the query take it as a provider-state expression.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const PROJECT = 'a project with workspace slots hosting agents';
const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';

const OPERATIONS: readonly OwnedOperation[] = [
  'listWorkspaces',
  'getWorkspace',
  'getWorkspaceActiveProcess',
  {
    operationId: 'listAgents',
    interactions: ['show-project-workspaces', 'show-workspace-slot', 'show-work-item-agent'],
  },
];

/**
 * qits-workspaces' golden masters, with each recorded query value that names a param (`{x}`) sent
 * as a provider-state expression: the provider fills in the state's value, the mock server expects
 * the recorded one.
 */
const masters: GoldenMasters = {
  operation(state, operationId) {
    const op = workspacesGoldenMasters.operation(state, operationId);
    const query = Object.fromEntries(
      Object.entries(op.query).map(([key, value]) => {
        const name = /^\{(\w+)}$/.exec(value)?.[1];
        return [key, name ? MatchersV3.fromProviderState(`\${${name}}`, op.params[name]) : value];
      }),
    );
    return { ...op, query: query as unknown as Record<string, string> };
  },
  body: (state, operationId) => workspacesGoldenMasters.body(state, operationId),
};

/** `state`'s param `name`, as the golden masters froze it. */
const param = (state: string, operationId: string, name: string) =>
  workspacesGoldenMasters.operation(state, operationId).params[name];

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

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-agents-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: workspace pages', () => {
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
    given(PROJECT, 'listWorkspaces', 'show-project-workspaces', LIST_PROJECT_SLOTS).executeTest(
      async (server) => {
        const repositoryId = param(PROJECT, 'listWorkspaces', 'repositoryId');
        const { data } = await at(server.url, () =>
          consume(listWorkspaces({ query: { repositoryId } }), LIST_PROJECT_SLOTS),
        );
        const slot = data?.entries?.[0]?.workspace;
        expect(slot?.placement).toBe('RUNNER');
        expect(slot?.runner?.name).toBeTruthy();
      },
    ));

  it('show-project-workspaces: every agent, the wrapper’s among them', () =>
    given(PROJECT, 'listAgents', 'show-project-workspaces', LIST_PROJECT_AGENTS).executeTest(
      async (server) => {
        const { data } = await at(server.url, () => consume(listAgents(), LIST_PROJECT_AGENTS));
        const agents = data?.agents ?? [];
        // One shape per null pattern: the queued agent (no slot), the waiting one, the yielded one.
        expect(agents.some((a) => a.runState === 'QUEUED' && a.workspaceRowId === null)).toBe(true);
        expect(agents.some((a) => !!a.waitingOn && !!a.waitingOnSince)).toBe(true);
      },
    ));

  it('show-workspace-slot: the slot', () =>
    given(SLOT, 'getWorkspace', 'show-workspace-slot', GET_SLOT).executeTest(async (server) => {
      const id = Number(param(SLOT, 'getWorkspace', 'workspaceId'));
      const { data } = await at(server.url, () =>
        consume(getWorkspace({ path: { id } }), GET_SLOT),
      );
      expect(data?.workspace?.runtimeStatus).toBe('RUNNING');
    }));

  it('show-workspace-slot: the agents it hosts', () =>
    given(SLOT, 'listAgents', 'show-workspace-slot', LIST_SLOT_AGENTS).executeTest(
      async (server) => {
        const workspaceId = Number(param(SLOT, 'listAgents', 'workspaceId'));
        const { data } = await at(server.url, () =>
          consume(listAgents({ query: { workspaceId } }), LIST_SLOT_AGENTS),
        );
        expect(data?.agents?.length).toBe(2);
      },
    ));

  it('show-workspace-slot: no start is running against it', () =>
    given(SLOT, 'getWorkspaceActiveProcess', 'show-workspace-slot', GET_ACTIVE_PROCESS).executeTest(
      async (server) => {
        const id = Number(param(SLOT, 'getWorkspaceActiveProcess', 'workspaceId'));
        const { data } = await at(server.url, () =>
          consume(getWorkspaceActiveProcess({ path: { id } }), GET_ACTIVE_PROCESS),
        );
        expect(data?.technicalProcessId).toBeNull();
      },
    ));

  it('show-work-item-agent: the item’s agents', () =>
    given(STARTING, 'listAgents', 'show-work-item-agent', LIST_ITEM_AGENTS).executeTest(
      async (server) => {
        const workId = param(STARTING, 'listAgents', 'bugTicketId');
        const { data } = await at(server.url, () =>
          consume(listAgents({ query: { workId } }), LIST_ITEM_AGENTS),
        );
        expect(data?.agents?.[0]?.waitingOn).toBeTruthy();
      },
    ));

  it('show-work-item-agent: its slot, starting', () =>
    given(STARTING, 'getWorkspace', 'show-work-item-agent', GET_SLOT).executeTest(
      async (server) => {
        const id = Number(param(STARTING, 'getWorkspace', 'workspaceId'));
        const { data } = await at(server.url, () =>
          consume(getWorkspace({ path: { id } }), GET_SLOT),
        );
        expect(data?.workspace?.runtimeStatus).toBe('PROVISIONING');
      },
    ));

  it('show-work-item-agent: the start running against its slot', () =>
    given(
      STARTING,
      'getWorkspaceActiveProcess',
      'show-work-item-agent',
      GET_ACTIVE_PROCESS,
    ).executeTest(async (server) => {
      const id = Number(param(STARTING, 'getWorkspaceActiveProcess', 'workspaceId'));
      const { data } = await at(server.url, () =>
        consume(getWorkspaceActiveProcess({ path: { id } }), GET_ACTIVE_PROCESS),
      );
      expect(data?.technicalProcessId).toBeTruthy();
    }));
});
