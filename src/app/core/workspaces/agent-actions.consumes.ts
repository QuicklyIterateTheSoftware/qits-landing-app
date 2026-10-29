import type { Consumed } from '@qits/angular';
import type {
  DiscardAgentResponses,
  InterruptAgentResponses,
  RestartAgentResponses,
  StopAgentResponses,
} from '../../api/workspaces';

/**
 * What `AgentActionsStore` reads from qits-workspaces' answers to the agent page's writes (epic
 * qits-1230, qits-1667). The store passes each list to `consume(...)`, so it cannot read any other field, and
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
 * `AgentActionsStore.interruptAgent(agentId)` (epic qits-1667, `interruptAgent`): whether ESC
 * reached the agent's harness, and what the service said about it. Its run state does not change.
 */
export const INTERRUPT_AGENT = ['interrupted', 'detail'] as const;

/** An interrupt, cut to what the store reads. */
export type InterruptedAgent = Consumed<InterruptAgentResponses[200], typeof INTERRUPT_AGENT>;

/**
 * `AgentActionsStore.stopAgent(agentId)` (epic qits-1667, `stopAgent`): the agent, now STOPPED: the
 * scheduler starts it again only when a person restarts or prompts it. Its container is untouched.
 */
export const STOP_AGENT = ['runState'] as const;

/** A stopped agent, cut to what the store reads. */
export type StoppedAgent = Consumed<StopAgentResponses[200], typeof STOP_AGENT>;

/**
 * `AgentActionsStore.restartAgent(agentId)` (epic qits-1667, `restartAgent`): the agent, started
 * again on its session (RUNNING) or handed back to the scheduler (YIELDED, or QUEUED without a
 * workspace).
 */
export const RESTART_AGENT = ['runState'] as const;

/** A restarted agent, cut to what the store reads. */
export type RestartedAgent = Consumed<RestartAgentResponses[200], typeof RESTART_AGENT>;

/** What a refusal says: the service's own words, and the refusal's name where it has one. */
export const REFUSAL = ['message', 'code'] as const;

/** A refusal that names no code (a recreate refused for an unknown working tree, a 400). */
export const REFUSAL_MESSAGE = ['message'] as const;
