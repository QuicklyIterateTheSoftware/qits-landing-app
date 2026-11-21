import { qitsOperation } from '@qits/angular';
import { listAgents, startAgent } from '../../api/projects';
import { AGENT_REFUSAL, LIST_AGENTS, START_AGENT } from './named-agents.consumes';

/**
 * qits-projects' named agents (qits-2154: one per project, tied to no work item, keeping its
 * session across visits) declared as operations (qits-2145), for the agent dialog (qits-2157,
 * qits-2499), which reads the list through `qitsResource` and starts the agent through
 * `qitsMutation`; `named-agents.operations.pact.spec.ts` binds each with the same provider,
 * operationId and `consumes`. The CLI's twin of the list is `qits projects agents list`.
 */

/**
 * The project's named agents, the desk first: each one's state (STOPPED, STARTING, IDLE, BUSY,
 * FAILED) and the daemon command running it now (null while none runs), whose terminal is
 * `namedAgentTerminalSocketUrl`.
 */
export const NAMED_AGENTS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listAgents',
  method: 'GET',
  call: listAgents,
  consumes: LIST_AGENTS,
});

/**
 * Starts a named agent that is not running (`…/agents/{name}/start`, qits-2499), with no prompt:
 * a stopped desk container is started and the agent's session asked for; a running agent is left
 * as it is. Answers the agent as the listing does (STARTING while it comes up); 404 with a
 * `reason` for an unknown project or name.
 */
export const START_NAMED_AGENT = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'startAgent',
  method: 'POST',
  call: startAgent,
  consumes: START_AGENT,
  errorConsumes: AGENT_REFUSAL,
});
