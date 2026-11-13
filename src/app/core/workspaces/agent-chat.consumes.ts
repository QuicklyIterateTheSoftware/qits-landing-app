import type { Consumed } from '@qits/angular';
import type { GetCommandLogResponses, RefinePromptResponses } from '../../api/workspace-daemon';

/**
 * What the operations in `agent-chat.operations.ts` read from qits-workspace-daemon's answers,
 * through qits-workspaces' agent proxy (epic qits-1667; the container proxy before it). Each
 * operation declares its list as its `consumes`, so a page cannot read any other field, and its
 * pact spec binds the same lists. To read another field, add it here.
 */

/**
 * `AGENT_TRANSCRIPT`: the agent's command's transcript (`getCommandLog`,
 * `channel=TRANSCRIPT`), the harness's own JSON lines, put in order by `sequence`.
 */
export const GET_TRANSCRIPT = ['lines[].sequence', 'lines[].content'] as const;

/** The transcript, cut to what the page reads. */
export type CommandTranscript = Consumed<GetCommandLogResponses[200], typeof GET_TRANSCRIPT>;

/** `PROMPT_REFINEMENT`: the rewrite (`refinePrompt`). */
export const REFINE_PROMPT = ['prompt'] as const;

/** The rewrite, cut to what the page reads. */
export type PromptRefinement = Consumed<RefinePromptResponses[200], typeof REFINE_PROMPT>;
