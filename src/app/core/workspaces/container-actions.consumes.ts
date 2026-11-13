import type { Consumed } from '@qits/angular';
import type {
  EnsureWorkspaceContainerResponses,
  RecreateWorkspaceContainerResponses,
  StopWorkspaceContainerResponses,
} from '../../api/workspaces';

/**
 * What the operations in `container-actions.operations.ts` read from qits-workspaces' answers to a
 * slot's container verbs (epic qits-1230), on the workspace page. Each operation declares its list
 * as its `consumes`, so a page cannot read any other field, and its pact spec binds the same lists.
 * A refusal reads `REFUSAL` or `REFUSAL_MESSAGE` (`agent-actions.consumes.ts`).
 */

/**
 * `CONTAINER_ENSURE`: the start the call made (or joined); its process's log
 * is the slot's active process, which the page reads again.
 */
export const ENSURE_CONTAINER = ['technicalProcessId'] as const;

/** A start, cut to what the page reads. */
export type EnsuredContainer = Consumed<
  EnsureWorkspaceContainerResponses[200],
  typeof ENSURE_CONTAINER
>;

/**
 * `CONTAINER_STOP`: the slot, its container now stopped, and the agents the
 * stop affected (`affectedAgentIds`, epic qits-1667), which the workspace page names.
 */
export const STOP_CONTAINER = ['runtimeStatus', 'affectedAgentIds'] as const;

/** A stopped slot, cut to what the page reads. */
export type StoppedContainer = Consumed<
  StopWorkspaceContainerResponses[200],
  typeof STOP_CONTAINER
>;

/**
 * `CONTAINER_RECREATE`: the start of the new container, and the agents the
 * recreate affected (`affectedAgentIds`, epic qits-1667). qits-workspaces records no successful
 * recreate (only its 400 refusal), so the pact does not bind this answer.
 */
export const RECREATE_CONTAINER = ['technicalProcessId', 'affectedAgentIds'] as const;

/** A recreate, cut to what the page reads. */
export type RecreatedContainer = Consumed<
  RecreateWorkspaceContainerResponses[200],
  typeof RECREATE_CONTAINER
>;
