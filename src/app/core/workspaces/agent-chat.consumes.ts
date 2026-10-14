import type { Consumed } from '@qits/angular';
import type { GetCommandLogResponses, RefinePromptResponses } from '../../api/workspace-daemon';

/**
 * What `AgentChatStore` reads from qits-workspace-daemon's answers, through qits-workspaces'
 * container proxy (epic qits-1230). The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. To read another field,
 * add it here.
 */

/**
 * `AgentChatStore.loadTranscript(workspaceRowId, commandId)`: a command's agent transcript
 * (`getCommandLog`, `channel=TRANSCRIPT`), the harness's own JSON lines, put in order by `sequence`.
 */
export const GET_TRANSCRIPT = ['lines[].sequence', 'lines[].content'] as const;

/** The transcript, cut to what the store reads. */
export type CommandTranscript = Consumed<GetCommandLogResponses[200], typeof GET_TRANSCRIPT>;

/**
 * `AgentChatStore.terminate(workspaceRowId, commandId)`: ending a chat (`terminateCommand`). The
 * answer binds the status only; the tab reads the harness again.
 */
export const TERMINATE_COMMAND = [] as const;

/** `AgentChatStore.refine(workspaceRowId, notes, preamble)`: the rewrite (`refinePrompt`). */
export const REFINE_PROMPT = ['prompt'] as const;

/** The rewrite, cut to what the store reads. */
export type PromptRefinement = Consumed<RefinePromptResponses[200], typeof REFINE_PROMPT>;
