import { qitsOperation } from '@qits/angular';
import {
  deleteAgentPromptDraft,
  getAgentPromptDraft,
  promptAgent,
  saveAgentPromptDraft,
} from '../../api/workspaces';
import {
  DELETE_PROMPT_DRAFT,
  GET_PROMPT_DRAFT,
  PROMPT_AGENT,
  SAVE_PROMPT_DRAFT,
} from './agent-prompt.consumes';

/**
 * An agent's prompt draft and its delivery on qits-workspaces (epic qits-1230), for the Chat tab's
 * prompt composer (`prompt-composer.ts`), declared as operations (qits-2145) the composer reads
 * through `qitsResource` and writes through `qitsMutation` in place of the former
 * `AgentPromptStore` (qits-2146). The draft is work product, so it lives on the service
 * (`/workspaces/api/agents/{id}/prompt-draft`) and survives a reload and a container recreate.
 * `agent-prompt.operations.pact.spec.ts` binds each.
 */

/** The saved draft (`getAgentPromptDraft`); a 404 is none, never one composed. */
export const PROMPT_DRAFT = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'getAgentPromptDraft',
  method: 'GET',
  call: getAgentPromptDraft,
  consumes: GET_PROMPT_DRAFT,
});

/**
 * Write the draft, with its picks (`saveAgentPromptDraft`); `serializedPrompt` is what the agent
 * would be handed. The answer's `updatedAt` is the composer's own echo on the `prompt-draft` hint.
 */
export const PROMPT_DRAFT_SAVE = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'saveAgentPromptDraft',
  method: 'PUT',
  call: saveAgentPromptDraft,
  consumes: SAVE_PROMPT_DRAFT,
});

/** Throw the draft away (`deleteAgentPromptDraft`): a 204 whether or not there was one. */
export const PROMPT_DRAFT_DELETE = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'deleteAgentPromptDraft',
  method: 'DELETE',
  call: deleteAgentPromptDraft,
  consumes: DELETE_PROMPT_DRAFT,
});

/**
 * Send a prompt to the agent by its id (`promptAgent`, epic qits-1667; `compactFirst: false`),
 * which resumes a yielded or stopped agent to hear it: the browser never starts a harness itself.
 */
export const AGENT_PROMPT = qitsOperation({
  provider: 'qits-workspaces-service',
  operationId: 'promptAgent',
  method: 'POST',
  call: promptAgent,
  consumes: PROMPT_AGENT,
});
