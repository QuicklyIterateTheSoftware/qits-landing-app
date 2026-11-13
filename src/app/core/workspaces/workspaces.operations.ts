import { qitsOperation } from '@qits/angular';
import { listAgents, listOpenWorkspaces, listWorkItemWorkspaces } from '../../api/workspaces';
import {
  LIST_ACTIVE_AGENTS,
  LIST_OPEN_WORKSPACES,
  LIST_WORK_ITEM_WORKSPACES,
} from './workspaces.consumes';

/**
 * qits-workspaces' reads the work section makes (qits-2146, in place of `WorkspacesStore`):
 * `workspaces.operations.pact.spec.ts` binds each with the store's interactions, unchanged.
 */

/** The platform's ACTIVE workspaces bound to a work item (`listOpenWorkspaces`): their items. */
export const OPEN_WORKSPACES = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listOpenWorkspaces',
  method: 'GET',
  call: listOpenWorkspaces,
  consumes: LIST_OPEN_WORKSPACES,
});

/** The platform's ACTIVE agents (`listAgents?state=ACTIVE`): the items they work on. */
export const ACTIVE_AGENT_WORK = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: LIST_ACTIVE_AGENTS,
});

/** One work item's workspaces in every state, newest first (`listWorkItemWorkspaces`). */
export const WORK_ITEM_WORKSPACES = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'listWorkItemWorkspaces',
  method: 'GET',
  call: listWorkItemWorkspaces,
  consumes: LIST_WORK_ITEM_WORKSPACES,
});
