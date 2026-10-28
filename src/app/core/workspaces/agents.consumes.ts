import type {
  GetAgentResponses,
  GetWorkspaceActiveProcessResponses,
  GetWorkspaceResponses,
  ListAgentsResponses,
  ListWorkspacesResponses,
} from '../../api/workspaces';
import type { Consumed } from '@qits/angular';

/**
 * What `AgentsStore` reads from qits-workspaces' answers for the workspace pages (epic qits-1230).
 * The store passes each list to `consume(...)`, so it cannot read any other field, and its pact spec
 * passes the same lists as `consumes`. To read another field, add it here.
 */

/**
 * `AgentsStore.loadProject(repositoryId)`, the project's Workspaces page: the wrapper's slots
 * (`listWorkspaces`, ACTIVE only), each with its label, container state and placement.
 *
 * No longer reads `workspace.runner` (epic qits-1481, ahead of qits-workspaces-service dropping
 * it): the page no longer names which runner a slot is on.
 */
export const LIST_PROJECT_SLOTS = [
  'entries[].workspace.id',
  'entries[].workspace.workspaceId',
  'entries[].workspace.runtimeStatus',
  'entries[].workspace.placement',
  'entries[].workspace.queuedAt',
  'entries[].workspace.admin',
] as const;

/** One slot of the project's list, cut to what the store reads. */
export type ProjectSlot = NonNullable<
  NonNullable<
    Consumed<ListWorkspacesResponses[200], typeof LIST_PROJECT_SLOTS>['entries']
  >[number]['workspace']
>;

/**
 * `AgentsStore.loadProject(repositoryId)`: every agent (`listAgents`, unfiltered, newest first),
 * of which the page keeps the wrapper's that are not removed — as qits-workspaces-frontend's
 * overview did. Each with its item, its slot, its run state and what it waits on (qits-1229).
 */
export const LIST_PROJECT_AGENTS = [
  'agents[].agentId',
  'agents[].workspaceRowId',
  'agents[].repositoryId',
  'agents[].entityId',
  'agents[].entityTitle',
  'agents[].state',
  'agents[].runState',
  'agents[].admin',
  'agents[].activity',
  'agents[].waitingOn',
  'agents[].waitingOnSince',
] as const;

/** One agent of the project's list, cut to what the store reads. */
export type ProjectAgent = NonNullable<
  Consumed<ListAgentsResponses[200], typeof LIST_PROJECT_AGENTS>['agents']
>[number];

/**
 * `AgentsStore.loadSlot(id)` and `loadItem(workId)`: one slot (`getWorkspace`) and its status
 * strip — the container (and its error, which a QUEUED slot shows too, as its lease's detail),
 * the placement, the daemon.
 *
 * No longer reads `workspace.runner` (epic qits-1481, ahead of qits-workspaces-service dropping
 * it): the page no longer names which runner a slot is on.
 */
export const GET_SLOT = [
  'workspace.id',
  'workspace.workspaceId',
  'workspace.runtimeStatus',
  'workspace.runtimeError',
  'workspace.placement',
  'workspace.queuedAt',
  'workspace.admin',
  'workspace.daemonConnectedAt',
  'workspace.daemonVersion',
  'workspace.daemonOutdated',
] as const;

/** One slot, cut to what the store reads. */
export type SlotDetail = NonNullable<
  Consumed<GetWorkspaceResponses[200], typeof GET_SLOT>['workspace']
>;

/** `AgentsStore.loadSlot(id)`: the agents a slot hosts (`listAgents?workspaceId=`). */
export const LIST_SLOT_AGENTS = [
  'agents[].agentId',
  'agents[].entityId',
  'agents[].entityTitle',
  'agents[].state',
  'agents[].runState',
  'agents[].admin',
  'agents[].harness',
  'agents[].activity',
  'agents[].waitingOn',
  'agents[].waitingOnSince',
  'agents[].wrapperBranch',
] as const;

/** One agent a slot hosts, cut to what the store reads. */
export type SlotAgent = NonNullable<
  Consumed<ListAgentsResponses[200], typeof LIST_SLOT_AGENTS>['agents']
>[number];

/**
 * `AgentsStore.loadSlot(id)` and `loadItem(workId)`: the technical process starting the slot's
 * container, if one is live (`getWorkspaceActiveProcess`); its log is read from its own stream.
 */
export const GET_ACTIVE_PROCESS = ['technicalProcessId'] as const;

/** What the active-process read answers, cut to what the store reads. */
export type ActiveProcess = Consumed<
  GetWorkspaceActiveProcessResponses[200],
  typeof GET_ACTIVE_PROCESS
>;

/**
 * `AgentsStore.loadItem(workId)`: which of a work item's agents is ACTIVE (`listAgents?workId=`,
 * newest first), so the item's old agent address (`work/detail/<qualified id>/agent[/<tab>]`) can
 * lead to that agent's page (`agents/<agent id>`).
 */
export const LIST_ITEM_AGENTS = ['agents[].agentId', 'agents[].state'] as const;

/** One agent of an item, cut to what the store reads. */
export type ItemAgent = NonNullable<
  Consumed<ListAgentsResponses[200], typeof LIST_ITEM_AGENTS>['agents']
>[number];

/**
 * `AgentsStore.loadAgent(agentId)`, an agent's page (`agents/<agent id>`, epic qits-1681): the agent
 * (`getAgent`, in any state), with what it works on (its item, the item's status and block), where
 * (its slot and repository), how it runs and what it waits on. Its open waits and its attention come
 * from the project's list (`PROJECT_AGENTS`), which the recorded `getAgent` does not carry.
 */
export const GET_AGENT = [
  'agentId',
  'workspaceRowId',
  'repositoryId',
  'workId',
  'entityId',
  'entityTitle',
  'entityStatus',
  'entityBlocked',
  'state',
  'runState',
  'admin',
  'harness',
  'activity',
  'waitingOn',
  'waitingOnSince',
  'wrapperBranch',
] as const;

/** One agent, cut to what the store reads. */
export type AgentDetail = Consumed<GetAgentResponses[200], typeof GET_AGENT>;

/**
 * `AgentsStore.loadProjectAgents(projectId)`, the project's agents with what each waits on and what
 * it needs a person for (epic qits-1681): `listAgents?projectId=&state=ACTIVE`, every ACTIVE agent
 * whose repository is one of the project's. Each with its item (and the item's status and block),
 * its slot, how it runs, its activity, its open waits with their subjects, and its attention.
 *
 * A list of its own, beside `LIST_PROJECT_AGENTS`, until the pinned `@qits/workspaces-golden-masters`
 * holds state `a project with agents needing attention`: the pact binds every field listed here, and
 * the older states lack `waits`, `attention`, `blockedAt` and `deskAskedAt`.
 */
export const PROJECT_AGENTS = [
  'agents[].agentId',
  'agents[].workspaceRowId',
  'agents[].repositoryId',
  'agents[].workId',
  'agents[].entityId',
  'agents[].entityTitle',
  'agents[].entityStatus',
  'agents[].entityBlocked',
  'agents[].state',
  'agents[].runState',
  'agents[].admin',
  'agents[].activity',
  'agents[].waitingSince',
  'agents[].waitingOn',
  'agents[].waitingOnSince',
  'agents[].lastActivityAt',
  'agents[].waits[].id',
  'agents[].waits[].label',
  'agents[].waits[].createdAt',
  'agents[].waits[].subjectKind',
  'agents[].waits[].subjectRef',
  'agents[].waits[].subjectId',
  'agents[].waits[].subjectQualifiedId',
  'agents[].waits[].targetStates',
  'agents[].waits[].subjectState',
  'agents[].waits[].subjectStateAt',
  'agents[].waits[].subjectExpectedBy',
  'agents[].attention.code',
  'agents[].attention.reason',
  'agents[].attention.since',
  'agents[].attention.waitId',
  'agents[].blockedAt',
  'agents[].deskAskedAt',
] as const;

/** One of the project's ACTIVE agents, with its waits and attention, cut to what the store reads. */
export type ProjectStatusAgent = NonNullable<
  Consumed<ListAgentsResponses[200], typeof PROJECT_AGENTS>['agents']
>[number];

/** One open wait of a project's agent, cut to what the store reads. */
export type AgentWait = NonNullable<ProjectStatusAgent['waits']>[number];

/** What a project's agent needs a person for, cut to what the store reads. */
export type AgentAttention = NonNullable<ProjectStatusAgent['attention']>;
