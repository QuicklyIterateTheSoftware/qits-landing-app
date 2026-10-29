import type { Consumed } from '@qits/angular';
import type {
  EnsureWorkspaceContainerResponses,
  RecreateWorkspaceContainerResponses,
  StopWorkspaceContainerResponses,
} from '../../api/workspaces';

/**
 * What `ContainerActionsStore` reads from qits-workspaces' answers to a slot's container verbs (epic
 * qits-1230), on the workspace page. The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. A refusal reads
 * `REFUSAL` or `REFUSAL_MESSAGE` (`agent-actions.consumes.ts`).
 */

/**
 * `ContainerActionsStore.ensureContainer(id)`: the start the call made (or joined); its process's log
 * is the slot's active process, which the page reads again.
 */
export const ENSURE_CONTAINER = ['technicalProcessId'] as const;

/** A start, cut to what the store reads. */
export type EnsuredContainer = Consumed<
  EnsureWorkspaceContainerResponses[200],
  typeof ENSURE_CONTAINER
>;

/**
 * `ContainerActionsStore.stopContainer(id)`: the slot, its container now stopped, and the agents the
 * stop affected (`affectedAgentIds`, epic qits-1667), which the workspace page names.
 */
export const STOP_CONTAINER = ['runtimeStatus', 'affectedAgentIds'] as const;

/** A stopped slot, cut to what the store reads. */
export type StoppedContainer = Consumed<
  StopWorkspaceContainerResponses[200],
  typeof STOP_CONTAINER
>;

/**
 * `ContainerActionsStore.recreateContainer(id)`: the start of the new container, and the agents the
 * recreate affected (`affectedAgentIds`, epic qits-1667). qits-workspaces records no successful
 * recreate (only its 400 refusal), so the pact does not bind this answer.
 */
export const RECREATE_CONTAINER = ['technicalProcessId', 'affectedAgentIds'] as const;

/** A recreate, cut to what the store reads. */
export type RecreatedContainer = Consumed<
  RecreateWorkspaceContainerResponses[200],
  typeof RECREATE_CONTAINER
>;
