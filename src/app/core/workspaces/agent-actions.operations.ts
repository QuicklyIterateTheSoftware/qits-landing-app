import { qitsOperation } from '@qits/angular';
import { discardAgent, interruptAgent, restartAgent, stopAgent } from '../../api/workspaces';
import {
  DISCARD_AGENT,
  INTERRUPT_AGENT,
  REFUSAL,
  RESTART_AGENT,
  STOP_AGENT,
} from './agent-actions.consumes';

/**
 * The agent page's writes on qits-workspaces (epic qits-1230, qits-1667), by the agent, declared as
 * operations (qits-2145) that `app-agent-discard` and `app-agent-run-actions` write through
 * `qitsMutation` in place of the former `AgentActionsStore` (qits-2146); a slot's container verbs
 * are `container-actions.operations.ts`'. Each reads the service's refusal (`REFUSAL`: its
 * `message` and `code`), and `agent-actions.operations.pact.spec.ts` binds each.
 */

/**
 * Discard (`…/agents/{id}/discard`): the agent, now REMOVED. Without `force` the service refuses
 * (409) an agent whose worktrees hold work that never reached the git host
 * (`AGENT_HAS_LEFTOVER_WORK`), whose daemon does not answer (`AGENT_DAEMON_UNREACHABLE`) or that is
 * still busy (`AGENT_BUSY`); the page then offers `force`.
 */
export const AGENT_DISCARD = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'discardAgent',
  method: 'POST',
  call: discardAgent,
  consumes: DISCARD_AGENT,
  errorConsumes: REFUSAL,
});

/**
 * Interrupt (`…/agents/{id}/interrupt`): ESC to a running harness, which changes no run state (409
 * when there is no running terminal harness).
 */
export const AGENT_INTERRUPT = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'interruptAgent',
  method: 'POST',
  call: interruptAgent,
  consumes: INTERRUPT_AGENT,
  errorConsumes: REFUSAL,
});

/**
 * Stop (`…/agents/{id}/stop`): the agent becomes STOPPED, yielding a running harness first; the
 * container is never touched.
 */
export const AGENT_STOP = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'stopAgent',
  method: 'POST',
  call: stopAgent,
  consumes: STOP_AGENT,
  errorConsumes: REFUSAL,
});

/**
 * Restart (`…/agents/{id}/restart`): a running agent started again on its session, a yielded or
 * stopped one handed back to the scheduler (409 for a queued or removed agent).
 */
export const AGENT_RESTART = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'restartAgent',
  method: 'POST',
  call: restartAgent,
  consumes: RESTART_AGENT,
  errorConsumes: REFUSAL,
});
