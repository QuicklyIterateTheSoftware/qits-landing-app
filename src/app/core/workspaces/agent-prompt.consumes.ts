import type { Consumed } from '@qits/angular';
import type {
  GetAgentPromptDraftResponses,
  PromptAgentResponses,
  SaveAgentPromptDraftResponses,
} from '../../api/workspaces';

/**
 * What `AgentPromptStore` reads from qits-workspaces' answers for the agent's Chat tab (epic
 * qits-1230). The store passes each list to `consume(...)`, so it cannot read any other field, and
 * its pact spec passes the same lists as `consumes`. To read another field, add it here.
 */

/**
 * `AgentPromptStore.readDraft(agentId)`: the agent's saved prompt draft (`getAgentPromptDraft`),
 * its composition (`content`, the client's own JSON) and when it was written. A 404 (nothing was
 * ever composed) binds the status only.
 */
export const GET_PROMPT_DRAFT = ['draft.content', 'draft.updatedAt'] as const;

/** The saved draft, cut to what the store reads. */
export type SavedPromptDraft = Consumed<GetAgentPromptDraftResponses[200], typeof GET_PROMPT_DRAFT>;

/**
 * `AgentPromptStore.saveDraft(agentId, text)`: the draft as written (`saveAgentPromptDraft`); its
 * `updatedAt` tells the tab's own save from another device's on the `prompt-draft` hint.
 */
export const SAVE_PROMPT_DRAFT = ['draft.updatedAt'] as const;

/** `AgentPromptStore.discardDraft(agentId)`: `deleteAgentPromptDraft`, a 204. */
export const DELETE_PROMPT_DRAFT = [] as const;

/**
 * `AgentPromptStore.prompt(agentId, text)`: what became of a prompt sent to the agent by its id
 * (`promptAgent`, epic qits-1667; it answers as the work item's delivery door did): said at its next
 * turn, as its first turn, or to a yielded or stopped agent that resumes to hear it.
 */
export const PROMPT_AGENT = ['agentId', 'delivered', 'launched', 'resumed', 'detail'] as const;

/** A delivery, cut to what the store reads. */
export type AgentDelivery = Consumed<PromptAgentResponses[200], typeof PROMPT_AGENT>;

/** The draft as the store reads it back: just written, or found. */
export type WrittenPromptDraft = Consumed<
  SaveAgentPromptDraftResponses[200],
  typeof SAVE_PROMPT_DRAFT
>;
