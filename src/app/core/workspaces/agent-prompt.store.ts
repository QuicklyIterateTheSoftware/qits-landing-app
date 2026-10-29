import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
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
  type AgentDelivery,
} from './agent-prompt.consumes';
import { draftReferences, serializePrompt, type CodeReference } from './picked-context';

/**
 * A draft as the Chat tab composes it: the prompt's text, the line ranges picked for it in the
 * Files tab, and when the service last wrote it.
 */
export interface PromptDraft {
  readonly text: string;
  readonly picked: readonly CodeReference[];
  readonly updatedAt: string | null;
}

/** What a call came to: its value, or the failure's status (0: no answer). */
export type PromptOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

/**
 * A draft's `content`: the composition, as this client writes it. qits-workspaces validates only
 * that it is JSON. `picked` is the context picked in the worktree (the Files tab's line ranges).
 */
export function draftContent(text: string, picked: readonly CodeReference[] = []): string {
  return JSON.stringify({ text, picked });
}

/** The picked references of a draft's `content`; none when it cannot be read. */
export function draftPicked(content: string | undefined): readonly CodeReference[] {
  try {
    return draftReferences(JSON.parse(content ?? ''));
  } catch {
    return [];
  }
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
 * - `saveDraft`: write it, with its picks; `serializedPrompt` is what the agent would be handed
 *   (the picks never pressed into the text appended). The answer's `updatedAt` is the tab's own
 *   echo on the `prompt-draft` hint.
 * - `discardDraft`: throw it away (a 204 whether or not there was one).
 * - `prompt`: send a prompt to the agent by its id (`POST /workspaces/api/agents/{id}/prompt`,
 *   `promptAgent`, epic qits-1667; `compactFirst: false`), which resumes a yielded or stopped agent
 *   to hear it: the browser never starts a harness itself.
 *
 * Staleness (qits-1270): none from qits-events, which by design never carries what a person wrote
 * (no prompt draft event). Another device's draft comes in on the slot's `prompt-draft` hint
 * (`WorkspaceHints`, a named, lint-allowed exception), read by the composer.
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
          ? {
              text: draftText(draft.content),
              picked: draftPicked(draft.content),
              updatedAt: draft.updatedAt ?? null,
            }
          : null,
      };
    },
    async saveDraft(
      agentId: string,
      text: string,
      picked: readonly CodeReference[] = [],
    ): Promise<PromptOutcome<PromptDraft>> {
      const answer = await consume(
        saveAgentPromptDraft({
          path: { id: agentId },
          body: {
            content: draftContent(text, picked),
            serializedPrompt: serializePrompt({ text, picked }),
          },
        }),
        SAVE_PROMPT_DRAFT,
      );
      if (answer.error !== undefined || !answer.data) return failed(answer.response);
      return {
        ok: true,
        value: { text, picked, updatedAt: answer.data.draft?.updatedAt ?? null },
      };
    },
    async discardDraft(agentId: string): Promise<PromptOutcome<void>> {
      const answer = await consume(
        deleteAgentPromptDraft({ path: { id: agentId } }),
        DELETE_PROMPT_DRAFT,
      );
      return answer.error === undefined ? { ok: true, value: undefined } : failed(answer.response);
    },
    async prompt(agentId: string, text: string): Promise<PromptOutcome<AgentDelivery>> {
      const answer = await consume(
        promptAgent({ path: { id: agentId }, body: { text, compactFirst: false } }),
        PROMPT_AGENT,
      );
      if (answer.error !== undefined || !answer.data) return failed(answer.response);
      return { ok: true, value: answer.data };
    },
  })),
);
