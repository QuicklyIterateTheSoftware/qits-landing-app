import type { Consumed } from '@qits/angular';
import type { GetCommandLogResponses, RefinePromptResponses } from '../../api/workspace-daemon';

/**
 * What `AgentChatStore` reads from qits-workspace-daemon's answers, through qits-workspaces' agent
 * proxy (epic qits-1667; the container proxy before it). The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. To read another field,
 * add it here.
 */

/**
 * `AgentChatStore.loadTranscript(agentId)`: the agent's command's transcript (`getCommandLog`,
 * `channel=TRANSCRIPT`), the harness's own JSON lines, put in order by `sequence`.
 */
export const GET_TRANSCRIPT = ['lines[].sequence', 'lines[].content'] as const;

/** The transcript, cut to what the store reads. */
export type CommandTranscript = Consumed<GetCommandLogResponses[200], typeof GET_TRANSCRIPT>;

/** `AgentChatStore.refine(agentId, notes, preamble)`: the rewrite (`refinePrompt`). */
export const REFINE_PROMPT = ['prompt'] as const;

/** The rewrite, cut to what the store reads. */
export type PromptRefinement = Consumed<RefinePromptResponses[200], typeof REFINE_PROMPT>;
