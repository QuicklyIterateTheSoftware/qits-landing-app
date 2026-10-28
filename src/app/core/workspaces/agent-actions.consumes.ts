import type { Consumed } from '@qits/angular';
import type {
  DiscardAgentResponses,
  EnsureWorkspaceContainerResponses,
  RecreateWorkspaceContainerResponses,
  StopWorkspaceContainerResponses,
} from '../../api/workspaces';

/**
 * What `AgentActionsStore` reads from qits-workspaces' answers to the workspace pages' writes (epic
 * qits-1230). The store passes each list to `consume(...)`, so it cannot read any other field, and
 * its pact spec passes the same lists as `consumes`. To read another field, add it here.
 *
 * A refusal's body is read too, for a person: the service's `message`, verbatim, and its `code`
 * where it names one (`AGENT_HAS_LEFTOVER_WORK`, `AGENT_DAEMON_UNREACHABLE`, …). The store passes
 * `REFUSAL` as `consume`'s error paths, and the pact binds it on every recorded refusal.
 */

/** `AgentActionsStore.discardAgent(agentId, force)`: the agent, now REMOVED. */
export const DISCARD_AGENT = ['state'] as const;

/** A discarded agent, cut to what the store reads. */
export type DiscardedAgent = Consumed<DiscardAgentResponses[200], typeof DISCARD_AGENT>;

/**
 * `AgentActionsStore.ensureContainer(id)`: the start the call made (or joined); its process's log
 * is the slot's active process, which the page reads again.
 */
export const ENSURE_CONTAINER = ['technicalProcessId'] as const;

/** A start, cut to what the store reads. */
export type EnsuredContainer = Consumed<
  EnsureWorkspaceContainerResponses[200],
  typeof ENSURE_CONTAINER
>;

/** `AgentActionsStore.stopContainer(id)`: the slot, its container now stopped. */
export const STOP_CONTAINER = ['runtimeStatus'] as const;

/** A stopped slot, cut to what the store reads. */
export type StoppedContainer = Consumed<
  StopWorkspaceContainerResponses[200],
  typeof STOP_CONTAINER
>;

/**
 * `AgentActionsStore.recreateContainer(id)`: the start of the new container. qits-workspaces
 * records no successful recreate (only its 400 refusal), so the pact does not bind this answer.
 */
export const RECREATE_CONTAINER = ['technicalProcessId'] as const;

/** A recreate, cut to what the store reads. */
export type RecreatedContainer = Consumed<
  RecreateWorkspaceContainerResponses[200],
  typeof RECREATE_CONTAINER
>;

/** What a refusal says: the service's own words, and the refusal's name where it has one. */
export const REFUSAL = ['message', 'code'] as const;

/** A refusal that names no code (a recreate refused for an unknown working tree, a 400). */
export const REFUSAL_MESSAGE = ['message'] as const;
