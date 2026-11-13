import { qitsOperation } from '@qits/angular';
import { getCommandLog, refinePrompt } from '../../api/workspace-daemon';
import { GET_TRANSCRIPT, REFINE_PROMPT } from './agent-chat.consumes';

/**
 * An agent's conversation on the daemon of the slot it is placed in, through qits-workspaces' agent
 * proxy (`/workspaces/agent/<agent id>/…`, epic qits-1667), declared as operations (qits-2145) the
 * Chat tab reads through `qitsResource` and its prompt composer writes through `qitsMutation`, in
 * place of the former `AgentChatStore` (qits-2146). Each is the daemon's generated call, addressed
 * at the agent's route on qits-workspaces' origin (`agentRoute`, in the params); the answer is the
 * daemon's. `agent-chat.operations.pact.spec.ts` binds each.
 */

/**
 * The agent's harness transcript (`GET …/log?channel=TRANSCRIPT`, which the service maps to the
 * daemon's `getCommandLog` of the agent's command, the last one of a yielded or stopped agent too).
 */
export const AGENT_TRANSCRIPT = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'getCommandLog',
  method: 'GET',
  call: getCommandLog,
  consumes: GET_TRANSCRIPT,
});

/**
 * Rewrite rough notes into a task prompt (`POST …/prompt-refinements`, the daemon's
 * `refinePrompt`): one model call over the harness installed in the agent's container.
 */
export const PROMPT_REFINEMENT = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'refinePrompt',
  method: 'POST',
  call: refinePrompt,
  consumes: REFINE_PROMPT,
});
