import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  deleteAgentPromptDraft,
  deliverAgentTurn,
  getAgentPromptDraft,
  saveAgentPromptDraft,
} from '../../api/workspaces';
import {
  DELETE_PROMPT_DRAFT,
  DELIVER_AGENT_TURN,
  GET_PROMPT_DRAFT,
  SAVE_PROMPT_DRAFT,
  type AgentDelivery,
} from './agent-prompt.consumes';

/** A draft as the Chat tab composes it: the prompt's text, and when the service last wrote it. */
export interface PromptDraft {
  readonly text: string;
  readonly updatedAt: string | null;
}

/** What a call came to: its value, or the failure's status (0: no answer). */
export type PromptOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

/**
 * A draft's `content`: the composition, as this client writes it. qits-workspaces validates only
 * that it is JSON. `picked` is the context picked in the worktree, which the landing app's Chat tab
 * does not pick (there is no Files tab yet), so it is written empty.
 */
export function draftContent(text: string): string {
  return JSON.stringify({ text, picked: [] });
}

/**
 * The prompt text of a draft's `content`. A blob this build cannot read (an older client's, or
 * one written by hand) is an empty prompt, never an error: the same screen as no draft.
 */
export function draftText(content: string | undefined): string {
  try {
    const value: unknown = JSON.parse(content ?? '');
    const text = (value as { text?: unknown } | null)?.text;
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

const failed = (response: { readonly status: number } | undefined) =>
  ({ ok: false, status: response?.status ?? 0 }) as const;

/**
 * An agent's prompt draft and its delivery, on qits-workspaces (epic qits-1230), for the agent's
 * Chat tab, as qits-workspaces-frontend's prompt panel used them. The draft is work product, so it
 * lives on the service (`/workspaces/api/agents/{id}/prompt-draft`) and survives a reload and a
 * container recreate.
 *
 * - `readDraft`: the saved draft, or `null` when there never was one (a 404).
 * - `saveDraft`: write it; the answer's `updatedAt` is the tab's own echo on the `prompt-draft`
 *   hint.
 * - `discardDraft`: throw it away (a 204 whether or not there was one).
 * - `deliver`: send a prompt to the item's agent (`POST /workspaces/api/agent-dispatches/delivery`,
 *   `compactFirst: false`), which resumes a yielded agent to hear it: the browser never starts a
 *   harness itself.
 */
export const AgentPromptStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => ({
    async readDraft(agentId: string): Promise<PromptOutcome<PromptDraft | null>> {
      const answer = await consume(
        getAgentPromptDraft({ path: { id: agentId } }),
        GET_PROMPT_DRAFT,
      );
      if (answer.response?.status === 404) return { ok: true, value: null };
      if (answer.error !== undefined || !answer.data) return failed(answer.response);
      const draft = answer.data.draft;
      return {
        ok: true,
        value: draft
          ? { text: draftText(draft.content), updatedAt: draft.updatedAt ?? null }
          : null,
      };
    },
    async saveDraft(agentId: string, text: string): Promise<PromptOutcome<PromptDraft>> {
      const answer = await consume(
        saveAgentPromptDraft({
          path: { id: agentId },
          body: { content: draftContent(text), serializedPrompt: text.trim() },
        }),
        SAVE_PROMPT_DRAFT,
      );
      if (answer.error !== undefined || !answer.data) return failed(answer.response);
      return { ok: true, value: { text, updatedAt: answer.data.draft?.updatedAt ?? null } };
    },
    async discardDraft(agentId: string): Promise<PromptOutcome<void>> {
      const answer = await consume(
        deleteAgentPromptDraft({ path: { id: agentId } }),
        DELETE_PROMPT_DRAFT,
      );
      return answer.error === undefined ? { ok: true, value: undefined } : failed(answer.response);
    },
    async deliver(workId: string, text: string): Promise<PromptOutcome<AgentDelivery>> {
      const answer = await consume(
        deliverAgentTurn({ body: { workId, text, compactFirst: false } }),
        DELIVER_AGENT_TURN,
      );
      if (answer.error !== undefined || !answer.data) return failed(answer.response);
      return { ok: true, value: answer.data };
    },
  })),
);
