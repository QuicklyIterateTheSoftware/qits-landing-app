import { qitsOperation } from '@qits/angular';
import { listAgents, promptAgent } from '../../api/projects';
import { LIST_AGENTS, AGENT_REFUSAL, PROMPT_AGENT } from './named-agents.consumes';

/**
 * qits-projects' named agents (qits-2154: one per project, tied to no work item, keeping its
 * session across visits) declared as operations (qits-2145), for the UI builder's agent dialog
 * (qits-2157), which reads the list through `qitsResource` and prompts through `qitsMutation`;
 * `named-agents.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`. The CLI's twins are `qits projects agents list` and `qits projects agents prompt`.
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
 * A prompt to a named agent (`…/agents/{name}/prompt`), its text passed through unchanged: 200 when
 * the session took it (delivered, or queued at `position` behind a running turn), 202 when it is
 * held until the session is up (state STARTING); refused with a `reason` by 409 (a prompt is
 * already held), 429 (the queue is full) and 503 (the daemon cannot be reached).
 */
export const PROMPT_NAMED_AGENT = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'promptAgent',
  method: 'POST',
  call: promptAgent,
  consumes: PROMPT_AGENT,
  errorConsumes: AGENT_REFUSAL,
});
