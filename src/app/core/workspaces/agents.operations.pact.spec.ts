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
  AGENT_DETAIL,
  AGENT_START,
  ITEM_AGENTS,
  LIST_PROJECT_ACTIVE_AGENTS,
  LIST_WRAPPER_AGENTS,
  LIST_WRAPPER_SLOTS,
  SLOT_AGENTS,
  SLOT_DETAIL,
  SLOT_START,
} from './agents.operations';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the workspace pages' reads make
 * (`agents.operations.ts`: the Agents page since qits-2143; an agent's page, a slot's page and a
 * work item's old agent address since qits-2146), in
 * `pacts/qits-landing-app_qits-workspaces-service.json` beside `workspaces.store.pact.spec.ts`'s
 * and the writes' parts:
 *
 * - "a project with workspace slots hosting agents" (`show-project-workspaces`): the wrapper's
 *   slots — one RUNNING on a target, hosting the bug ticket's and the epic's agents — and every
 *   agent, the improvement ticket's QUEUED one with no slot among them. Moved here from
 *   `agents.store.pact.spec.ts` with `AgentsStore.loadProject`, unchanged;
 * - "a project with agents needing attention" (`show-project-agents`): the project's ACTIVE agents
 *   with their open waits and attention, the same request and state as the agents menu's
 *   `agents-menu` interaction, under the page's own trigger;
 * - `agents-menu` (qits-2146: the agents menu reads `LIST_PROJECT_ACTIVE_AGENTS` through
 *   `ProjectActiveAgents`; moved here from `agents.store.pact.spec.ts` unchanged, where the agent
 *   page's `AgentsStore.loadProjectAgents` makes the same request): "a project with agents needing
 *   attention", the project's ACTIVE agents with their open waits and attention; "a project with an
 *   agent overdue on a release request" (qits-2040), one agent whose release request has not moved
 *   for hours (`WAIT_OVERDUE` on a `RELEASE_REQUEST` wait) and which also waits on its item's
 *   comments, which the agent status links (epic qits-2000); "a project with agents starting up"
 *   (qits-2007), the agents as they come up, one per start-up `phase` (QUEUED with no slot,
 *   PROVISIONING, STARTING) and two READY (IDLE, BUSY), each with its `phaseSince`, which the
 *   menu's chip reads.
 *
 * Moved here from `agents.store.pact.spec.ts` with `AgentsStore` (qits-2146), unchanged:
 *
 * - "a workspace slot hosting agents" (`show-workspace-slot`, `show-agent`): one slot RUNNING, the
 *   bug ticket's agent holding it and waiting on a release request, the epic's agent yielded in it,
 *   read by the slot (no start is running), with the agents it hosts (`listWorkspaceAgents`, epic
 *   qits-1667); and the agent page's start, asked of the agent (`getAgentActiveProcess`): none is
 *   running;
 * - "an agent whose workspace is starting" (`show-work-item-agent`, `show-workspace-slot`): the bug
 *   ticket's ACTIVE agent, which its old agent address leads to, and its slot's page while the slot
 *   is PROVISIONING and a start is live (the agent page asks nothing of the slot since epic
 *   qits-1667);
 * - "a work item with no workspaces" (qits-2040, `show-work-item-agent`): the improvement ticket's
 *   agents, none at all, so its old agent address leads to the item's page;
 * - "an agent with a saved prompt draft" and "no agent with that id" (`show-agent`): the agent
 *   page's agent, read by its id, and one the service does not know.
 *
 * The slot's row id is a param (`workspaceId`, frozen to its place in the state's write order); the
 * provider names its real value, so the path and the query take it as a provider-state expression.
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
const STARTING_UP = 'a project with agents starting up';
const OVERDUE = 'a project with an agent overdue on a release request';
const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const NO_WORKSPACES = 'a work item with no workspaces';
const AGENT = 'an agent with a saved prompt draft';
const NO_AGENT = 'no agent with that id';

/**
 * `PROJECT_AGENTS` as "a project with agents starting up" can bind it: no agent there waits on
 * anything or needs a person, so its body holds no wait's or attention's fields
 * (`NEEDING_ATTENTION` binds those).
 */
const STARTING_UP_AGENTS = LIST_PROJECT_ACTIVE_AGENTS.consumes.filter(
  (path) => !path.startsWith('agents[].waits[].') && !path.startsWith('agents[].attention.'),
);

const OPERATIONS: readonly OwnedOperation[] = [
  'listWorkspaces',
  'getWorkspace',
  'getWorkspaceActiveProcess',
  'getAgent',
  'getAgentActiveProcess',
  'listWorkspaceAgents',
  {
    operationId: 'listAgents',
    interactions: [
      'show-project-workspaces',
      'show-project-agents',
      'agents-menu',
      'show-work-item-agent',
    ],
  },
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
 * The interaction for the operation `op` in `state`, triggered by `interaction`, binding
 * `op.consumes` (or `consumes`, as far as a state holds them). The provider is named as the
 * literal `qits/pact-names` can check (it cannot read `op.provider`), and `op` must name the same
 * one.
 */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
  consumes: readonly string[] = op.consumes,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
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

  it('agents-menu: the project’s ACTIVE agents, with their waits and attention', () =>
    given(LIST_PROJECT_ACTIVE_AGENTS, NEEDING_ATTENTION, 'agents-menu').executeTest(
      async (server) => {
        const projectId = param(NEEDING_ATTENTION, 'listAgents', 'projectId');
        const { data } = await at(server.url, () =>
          LIST_PROJECT_ACTIVE_AGENTS.fetch({ query: { projectId, state: 'ACTIVE' } }),
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

  it('agents-menu: an agent overdue on a release request, which also waits on comments', () =>
    given(LIST_PROJECT_ACTIVE_AGENTS, OVERDUE, 'agents-menu').executeTest(async (server) => {
      const projectId = param(OVERDUE, 'listAgents', 'projectId');
      const { data } = await at(server.url, () =>
        LIST_PROJECT_ACTIVE_AGENTS.fetch({ query: { projectId, state: 'ACTIVE' } }),
      );
      const [agent] = data?.agents ?? [];
      expect(agent?.attention?.code).toBe('WAIT_OVERDUE');
      const overdue = agent?.waits?.find((w) => w.id === agent.attention?.waitId);
      expect(overdue?.subjectKind).toBe('RELEASE_REQUEST');
      expect(overdue?.subjectQualifiedId).toBeTruthy();
      const comments = agent?.waits?.find((w) => w.subjectKind === 'COMMENTS');
      expect(comments?.subjectQualifiedId).toBeTruthy();
    }));

  it('agents-menu: the project’s ACTIVE agents starting up, each with its phase', () =>
    given(LIST_PROJECT_ACTIVE_AGENTS, STARTING_UP, 'agents-menu', STARTING_UP_AGENTS).executeTest(
      async (server) => {
        const projectId = param(STARTING_UP, 'listAgents', 'projectId');
        const { data } = await at(server.url, () =>
          LIST_PROJECT_ACTIVE_AGENTS.fetch({ query: { projectId, state: 'ACTIVE' } }),
        );
        const agents = data?.agents ?? [];
        // The agents differ in which fields are null, so the pact holds one of each shape (the
        // queued one with no slot, the coming-up ones with no activity, the READY ones with one).
        expect(agents.length).toBeGreaterThan(0);
        expect(agents.every((a) => !!a.phase && !!a.phaseSince)).toBe(true);
        expect(agents.some((a) => a.phase === 'QUEUED' && a.workspaceRowId == null)).toBe(true);
        expect(agents.some((a) => a.phase === 'READY' && !!a.activity)).toBe(true);
      },
    ));

  it('show-workspace-slot: the slot', () =>
    given(SLOT_DETAIL, SLOT, 'show-workspace-slot').executeTest(async (server) => {
      const id = Number(param(SLOT, 'getWorkspace', 'workspaceId'));
      const { data } = await at(server.url, () => SLOT_DETAIL.fetch({ path: { id } }));
      expect(data?.workspace?.runtimeStatus).toBe('RUNNING');
    }));

  it('show-workspace-slot: the agents it hosts', () =>
    given(SLOT_AGENTS, SLOT, 'show-workspace-slot').executeTest(async (server) => {
      const id = Number(param(SLOT, 'listWorkspaceAgents', 'workspaceId'));
      const { data } = await at(server.url, () => SLOT_AGENTS.fetch({ path: { id } }));
      expect(data?.agents?.map((agent) => agent.runState).sort()).toEqual(['RUNNING', 'YIELDED']);
    }));

  it('show-agent: the start running against its slot, asked of the agent: none', () =>
    given(AGENT_START, SLOT, 'show-agent').executeTest(async (server) => {
      const id = param(SLOT, 'getAgentActiveProcess', 'agentId');
      const { data } = await at(server.url, () => AGENT_START.fetch({ path: { id } }));
      expect(data?.technicalProcessId).toBeNull();
    }));

  it('show-workspace-slot: no start is running against it', () =>
    given(SLOT_START, SLOT, 'show-workspace-slot').executeTest(async (server) => {
      const id = Number(param(SLOT, 'getWorkspaceActiveProcess', 'workspaceId'));
      const { data } = await at(server.url, () => SLOT_START.fetch({ path: { id } }));
      expect(data?.technicalProcessId).toBeNull();
    }));

  it('show-work-item-agent: the item’s agents, one of them ACTIVE', () =>
    given(ITEM_AGENTS, STARTING, 'show-work-item-agent').executeTest(async (server) => {
      const workId = param(STARTING, 'listAgents', 'bugTicketId');
      const { data } = await at(server.url, () => ITEM_AGENTS.fetch({ query: { workId } }));
      expect(data?.agents?.[0]?.state).toBe('ACTIVE');
    }));

  it('show-work-item-agent: an item without agents', () =>
    given(ITEM_AGENTS, NO_WORKSPACES, 'show-work-item-agent').executeTest(async (server) => {
      const workId = param(NO_WORKSPACES, 'listAgents', 'improvementTicketId');
      const { data } = await at(server.url, () => ITEM_AGENTS.fetch({ query: { workId } }));
      expect(data?.agents).toEqual([]);
    }));

  it('show-agent: the agent, by its id', () =>
    given(AGENT_DETAIL, AGENT, 'show-agent').executeTest(async (server) => {
      const id = param(AGENT, 'getAgent', 'agentId');
      const { data } = await at(server.url, () => AGENT_DETAIL.fetch({ path: { id } }));
      expect(data?.agentId).toBeTruthy();
      expect(data?.workspaceRowId).toBeTruthy();
    }));

  it('show-agent: an agent the service does not know', () =>
    given(AGENT_DETAIL, NO_AGENT, 'show-agent', []).executeTest(async (server) => {
      const id = param(NO_AGENT, 'getAgent', 'agentId');
      const { response } = await at(server.url, () => AGENT_DETAIL.fetch({ path: { id } }));
      expect(response?.status).toBe(404);
    }));

  it('show-workspace-slot: a slot whose container is coming up', () =>
    given(SLOT_DETAIL, STARTING, 'show-workspace-slot').executeTest(async (server) => {
      const id = Number(param(STARTING, 'getWorkspace', 'workspaceId'));
      const { data } = await at(server.url, () => SLOT_DETAIL.fetch({ path: { id } }));
      expect(data?.workspace?.runtimeStatus).toBe('PROVISIONING');
    }));

  it('show-workspace-slot: the start running against it', () =>
    given(SLOT_START, STARTING, 'show-workspace-slot').executeTest(async (server) => {
      const id = Number(param(STARTING, 'getWorkspaceActiveProcess', 'workspaceId'));
      const { data } = await at(server.url, () => SLOT_START.fetch({ path: { id } }));
      expect(data?.technicalProcessId).toBeTruthy();
    }));
});
