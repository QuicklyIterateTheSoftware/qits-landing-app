import type { Consumed } from '@qits/angular';
import type {
  DiscardAgentResponses,
  InterruptAgentResponses,
  RestartAgentResponses,
  StopAgentResponses,
} from '../../api/workspaces';

/**
 * What the operations in `agent-actions.operations.ts` read from qits-workspaces' answers to the
 * agent page's writes (epic qits-1230, qits-1667). Each operation declares its list as its
 * `consumes`, so a page cannot read any other field, and its pact spec binds the same lists. To
 * read another field, add it here.
 *
 * A refusal's body is read too, for a person: the service's `message`, verbatim, and its `code`
 * where it names one (`AGENT_HAS_LEFTOVER_WORK`, `AGENT_DAEMON_UNREACHABLE`, …). Each write
 * declares `REFUSAL` as its `errorConsumes`, and the pact binds it on every recorded refusal.
 */

/** `AGENT_DISCARD`: the agent, now REMOVED. */
export const DISCARD_AGENT = ['state'] as const;

/** A discarded agent, cut to what the page reads. */
export type DiscardedAgent = Consumed<DiscardAgentResponses[200], typeof DISCARD_AGENT>;

/**
 * `AGENT_INTERRUPT` (epic qits-1667, `interruptAgent`): whether ESC
 * reached the agent's harness, and what the service said about it. Its run state does not change.
 */
export const INTERRUPT_AGENT = ['interrupted', 'detail'] as const;

/** An interrupt, cut to what the page reads. */
export type InterruptedAgent = Consumed<InterruptAgentResponses[200], typeof INTERRUPT_AGENT>;

/**
 * `AGENT_STOP` (epic qits-1667, `stopAgent`): the agent, now STOPPED: the
 * scheduler starts it again only when a person restarts or prompts it. Its container is untouched.
 */
export const STOP_AGENT = ['runState'] as const;

/** A stopped agent, cut to what the page reads. */
export type StoppedAgent = Consumed<StopAgentResponses[200], typeof STOP_AGENT>;

/**
 * `AGENT_RESTART` (epic qits-1667, `restartAgent`): the agent, started
 * again on its session (RUNNING) or handed back to the scheduler (YIELDED, or QUEUED without a
 * workspace).
 */
export const RESTART_AGENT = ['runState'] as const;

/** A restarted agent, cut to what the page reads. */
export type RestartedAgent = Consumed<RestartAgentResponses[200], typeof RESTART_AGENT>;

/** What a refusal says: the service's own words, and the refusal's name where it has one. */
export const REFUSAL = ['message', 'code'] as const;

/** A refusal that names no code (a recreate refused for an unknown working tree, a 400). */
export const REFUSAL_MESSAGE = ['message'] as const;
