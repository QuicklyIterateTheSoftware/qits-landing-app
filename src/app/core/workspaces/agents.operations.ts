import { qitsOperation } from '@qits/angular';
import {
  getAgent,
  getAgentActiveProcess,
  getWorkspace,
  getWorkspaceActiveProcess,
  listAgents,
  listWorkspaceAgents,
  listWorkspaces,
} from '../../api/workspaces';
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
 * qits-workspaces' reads behind the workspace pages, each declared once as an operation a page
 * reads through `qitsResource` (qits-2145) instead of through the former `AgentsStore`: the
 * project's Agents page (`project-agents.page.ts`, qits-2143), and since qits-2146 an agent's page
 * and its tabs, a slot's page and a work item's old agent address. Each carries its provider and
 * operationId, which the pages' data marks (qits-2141) name as the source of what they show, and
 * its `consumes` from `agents.consumes.ts`; `agents.operations.pact.spec.ts` binds each with the
 * same three.
 */

/** The wrapper's ACTIVE slots (`listWorkspaces?repositoryId=`), the page's Workspaces heading. */
export const LIST_WRAPPER_SLOTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listWorkspaces',
  method: 'GET',
  call: listWorkspaces,
  consumes: LIST_PROJECT_SLOTS,
});

/**
 * Every agent (`listAgents`, unfiltered), of which the page keeps the wrapper's that are not
 * removed: how many agents each slot hosts, and whose lifecycle events read the slots again.
 */
export const LIST_WRAPPER_AGENTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: LIST_PROJECT_AGENTS,
});

/**
 * The project's ACTIVE agents with their waits and attention
 * (`listAgents?projectId=&state=ACTIVE`), the page's Active agents heading: the same request as the
 * agents menu's (`ProjectActiveAgents`), made by the page on its own.
 */
export const LIST_PROJECT_ACTIVE_AGENTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: PROJECT_AGENTS,
});

/**
 * One agent, by its id, in any state (`getAgent`): an agent's page (`agent.layout.ts`) and the run
 * state and slot its tabs follow (`OPEN_AGENT`). A 404 is an agent the service does not know.
 */
export const AGENT_DETAIL = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'getAgent',
  method: 'GET',
  call: getAgent,
  consumes: GET_AGENT,
});

/**
 * The start bringing the container of the agent's slot up, asked of the agent
 * (`getAgentActiveProcess`, epic qits-1667): the agent page's starting log, while one is live.
 */
export const AGENT_START = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'getAgentActiveProcess',
  method: 'GET',
  call: getAgentActiveProcess,
  consumes: GET_AGENT_ACTIVE_PROCESS,
});

/** One slot (`getWorkspace`): a slot's page and its status strip. A 404 is a slot that resolved. */
export const SLOT_DETAIL = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'getWorkspace',
  method: 'GET',
  call: getWorkspace,
  consumes: GET_SLOT,
});

/** The start bringing a slot's container up, if one is live (`getWorkspaceActiveProcess`). */
export const SLOT_START = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'getWorkspaceActiveProcess',
  method: 'GET',
  call: getWorkspaceActiveProcess,
  consumes: GET_ACTIVE_PROCESS,
});

/** The agents a slot hosts (`listWorkspaceAgents`, epic qits-1667): a slot's page lists them. */
export const SLOT_AGENTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listWorkspaceAgents',
  method: 'GET',
  call: listWorkspaceAgents,
  consumes: LIST_SLOT_AGENTS,
});

/**
 * A work item's agents (`listAgents?workId=`, newest first): which one is ACTIVE, where the item's
 * old agent address (`work-agent.layout.ts`) leads.
 */
export const ITEM_AGENTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: LIST_ITEM_AGENTS,
});
