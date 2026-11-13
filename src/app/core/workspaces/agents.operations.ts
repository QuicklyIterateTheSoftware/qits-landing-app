import { qitsOperation } from '@qits/angular';
import { listAgents, listWorkspaces } from '../../api/workspaces';
import { LIST_PROJECT_AGENTS, LIST_PROJECT_SLOTS, PROJECT_AGENTS } from './agents.consumes';

/**
 * qits-workspaces' reads behind the project's Agents page (`project-agents.page.ts`, qits-2143),
 * each declared once as an operation the page reads through `qitsResource` (qits-2145) instead of
 * through `AgentsStore`. Each carries its provider and operationId, which the page's data marks
 * (qits-2141) name as the source of what it shows, and its `consumes` from `agents.consumes.ts`;
 * `agents.operations.pact.spec.ts` binds each with the same three.
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
 * The project's ACTIVE agents with their waits and attention (`listAgents?projectId=&state=ACTIVE`),
 * the page's Active agents heading: the same request as the agents menu's
 * (`AgentsStore.loadProjectAgents`), made by the page on its own.
 */
export const LIST_PROJECT_ACTIVE_AGENTS = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: PROJECT_AGENTS,
});
