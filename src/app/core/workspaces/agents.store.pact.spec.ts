import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import {
  getAgent,
  getAgentActiveProcess,
  getWorkspace,
  getWorkspaceActiveProcess,
  listAgents,
  listWorkspaceAgents,
  listWorkspaces,
} from '../../api/workspaces';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  GET_ACTIVE_PROCESS,
  GET_AGENT,
  GET_AGENT_ACTIVE_PROCESS,
  GET_SLOT,
  LIST_ITEM_AGENTS,
  LIST_PROJECT_AGENTS,
  LIST_PROJECT_SLOTS,
  LIST_SLOT_AGENTS,
  PROJECT_AGENTS,
} from './agents.consumes';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the workspace pages make (epic
 * qits-1230), in `pacts/qits-landing-app_qits-workspaces-service.json` beside
 * `workspaces.store.pact.spec.ts`'s part:
 *
 * - "a project with workspace slots hosting agents": the Agents page's slots and their agents — one
 *   slot RUNNING on runner `localhost`, the bug ticket's agent holding it and waiting on a release
 *   request, the epic's agent yielded in it, the improvement ticket's agent QUEUED;
 * - "a workspace slot hosting agents": the same, read by the slot (no start is running), with the
 *   agents it hosts (`listWorkspaceAgents`, epic qits-1667); and the agent page's start, asked of
 *   the agent (`getAgentActiveProcess`): none is running;
 * - "an agent whose workspace is starting": the bug ticket's ACTIVE agent, which its old agent
 *   address leads to, and its slot's page while the slot is PROVISIONING and a start is live (the
 *   agent page asks nothing of the slot since epic qits-1667);
 * - "an agent with a saved prompt draft" and "no agent with that id": the agent page's agent, read
 *   by its id, and one the service does not know;
 * - "a project with agents needing attention": the project's ACTIVE agents with their open waits
 *   and attention (`listAgents?projectId=&state=ACTIVE`), read by the agents menu, the Agents page
 *   and the agent page alike.
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
const AGENT = 'an agent with a saved prompt draft';
const NO_AGENT = 'no agent with that id';
const NEEDING_ATTENTION = 'a project with agents needing attention';

const OPERATIONS: readonly OwnedOperation[] = [
  'listWorkspaces',
  'getWorkspace',
  'getWorkspaceActiveProcess',
  'getAgent',
  'getAgentActiveProcess',
  'listWorkspaceAgents',
  {
    operationId: 'listAgents',
    interactions: ['show-project-workspaces', 'show-work-item-agent', 'agents-menu'],
  },
];

/**
 * qits-workspaces' golden masters. `addGoldenInteraction` itself sends each recorded query value
 * that names a param (`{x}`) as a provider-state expression: the provider fills in the state's
 * value, the mock server expects the recorded one.
 */
const masters = workspacesGoldenMasters;

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
        expect(slot?.placement).toBe('TARGET');
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
    given(SLOT, 'listWorkspaceAgents', 'show-workspace-slot', LIST_SLOT_AGENTS).executeTest(
      async (server) => {
        const id = Number(param(SLOT, 'listWorkspaceAgents', 'workspaceId'));
        const { data } = await at(server.url, () =>
          consume(listWorkspaceAgents({ path: { id } }), LIST_SLOT_AGENTS),
        );
        expect(data?.agents?.map((agent) => agent.runState).sort()).toEqual(['RUNNING', 'YIELDED']);
      },
    ));

  it('show-agent: the start running against its slot, asked of the agent: none', () =>
    given(SLOT, 'getAgentActiveProcess', 'show-agent', GET_AGENT_ACTIVE_PROCESS).executeTest(
      async (server) => {
        const id = param(SLOT, 'getAgentActiveProcess', 'agentId');
        const { data } = await at(server.url, () =>
          consume(getAgentActiveProcess({ path: { id } }), GET_AGENT_ACTIVE_PROCESS),
        );
        expect(data?.technicalProcessId).toBeNull();
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

  it('show-work-item-agent: the item’s agents, one of them ACTIVE', () =>
    given(STARTING, 'listAgents', 'show-work-item-agent', LIST_ITEM_AGENTS).executeTest(
      async (server) => {
        const workId = param(STARTING, 'listAgents', 'bugTicketId');
        const { data } = await at(server.url, () =>
          consume(listAgents({ query: { workId } }), LIST_ITEM_AGENTS),
        );
        expect(data?.agents?.[0]?.state).toBe('ACTIVE');
      },
    ));

  it('show-agent: the agent, by its id', () =>
    given(AGENT, 'getAgent', 'show-agent', GET_AGENT).executeTest(async (server) => {
      const id = param(AGENT, 'getAgent', 'agentId');
      const { data } = await at(server.url, () => consume(getAgent({ path: { id } }), GET_AGENT));
      expect(data?.agentId).toBeTruthy();
      expect(data?.workspaceRowId).toBeTruthy();
    }));

  it('show-agent: an agent the service does not know', () =>
    given(NO_AGENT, 'getAgent', 'show-agent', []).executeTest(async (server) => {
      const id = param(NO_AGENT, 'getAgent', 'agentId');
      const { response } = await at(server.url, () => consume(getAgent({ path: { id } }), []));
      expect(response?.status).toBe(404);
    }));

  it('show-workspace-slot: a slot whose container is coming up', () =>
    given(STARTING, 'getWorkspace', 'show-workspace-slot', GET_SLOT).executeTest(async (server) => {
      const id = Number(param(STARTING, 'getWorkspace', 'workspaceId'));
      const { data } = await at(server.url, () =>
        consume(getWorkspace({ path: { id } }), GET_SLOT),
      );
      expect(data?.workspace?.runtimeStatus).toBe('PROVISIONING');
    }));

  it('show-workspace-slot: the start running against it', () =>
    given(
      STARTING,
      'getWorkspaceActiveProcess',
      'show-workspace-slot',
      GET_ACTIVE_PROCESS,
    ).executeTest(async (server) => {
      const id = Number(param(STARTING, 'getWorkspaceActiveProcess', 'workspaceId'));
      const { data } = await at(server.url, () =>
        consume(getWorkspaceActiveProcess({ path: { id } }), GET_ACTIVE_PROCESS),
      );
      expect(data?.technicalProcessId).toBeTruthy();
    }));

  it('agents-menu: the project’s ACTIVE agents, with their waits and attention', () =>
    given(NEEDING_ATTENTION, 'listAgents', 'agents-menu', PROJECT_AGENTS).executeTest(
      async (server) => {
        const projectId = param(NEEDING_ATTENTION, 'listAgents', 'projectId');
        const { data } = await at(server.url, () =>
          consume(listAgents({ query: { projectId, state: 'ACTIVE' } }), PROJECT_AGENTS),
        );
        const agents = data?.agents ?? [];
        expect(agents).toHaveLength(5);
        const blocked = agents.find((a) => a.attention?.code === 'BLOCKED_NO_DESK');
        expect(blocked?.blockedAt).toBeTruthy();
        const overdue = agents.find((a) => a.attention?.code === 'WAIT_OVERDUE');
        expect(overdue?.waits?.[0]?.subjectKind).toBe('CI_RUN');
        expect(overdue?.waits?.[0]?.targetStates).toContain('SUCCESS');
        const noAttention = agents.find((a) => !a.attention);
        expect(noAttention?.waits?.length).toBeGreaterThan(0);
      },
    ));
});
