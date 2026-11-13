import { qitsOperation } from '@qits/angular';
import { availableAgents, openSignInTerminal } from '../../api/workspace-daemon';
import { AVAILABLE_AGENTS, DAEMON_REFUSAL, OPEN_SIGN_IN } from './agent-sign-in.consumes';

/**
 * "Nobody is signed in", and the door out of it (epic qits-1230): one sign-in serves the whole
 * shared credential volume, so it is a fact about the slot's container, read from the slot's daemon
 * through qits-workspaces' container proxy (`containerBase`, in the params). Declared as operations
 * (qits-2145) the workspace page's harness setup reads through `qitsResource` and writes through
 * `qitsMutation`, in place of the former `AgentSignInStore` (qits-2146).
 * `agent-sign-in.operations.pact.spec.ts` binds each.
 */

/** The daemon's harness report (`availableAgents`): who is signed in, and the daemon's hint. */
export const HARNESS_REPORT = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'availableAgents',
  method: 'GET',
  call: availableAgents,
  consumes: AVAILABLE_AGENTS,
});

/**
 * Start the sign-in terminal (`openSignInTerminal`): a command of the slot's own, which the
 * workspace page's screen attaches to. A refusal says why in the daemon's words.
 */
export const SIGN_IN_TERMINAL = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'openSignInTerminal',
  method: 'POST',
  call: openSignInTerminal,
  consumes: OPEN_SIGN_IN,
  errorConsumes: DAEMON_REFUSAL,
});
