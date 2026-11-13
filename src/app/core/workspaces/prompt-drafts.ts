import { draftReferences, serializePrompt, type CodeReference } from './picked-context';
import type { SavedPromptDraft } from './agent-prompt.consumes';

/**
 * A draft as the Chat tab composes it: the prompt's text, the line ranges picked for it in the
 * Files tab, and when the service last wrote it.
 */
export interface PromptDraft {
  readonly text: string;
  readonly picked: readonly CodeReference[];
  readonly updatedAt: string | null;
}

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

/** The saved draft a `PROMPT_DRAFT` read answered, as the composer restores it; none for none. */
export function promptDraftOf(answer: SavedPromptDraft | undefined): PromptDraft | null {
  const draft = answer?.draft;
  return draft
    ? {
        text: draftText(draft.content),
        picked: draftPicked(draft.content),
        updatedAt: draft.updatedAt ?? null,
      }
    : null;
}

/**
 * `PROMPT_DRAFT_SAVE`'s params: the composition as `content` (`draftContent`), and what the agent
 * would be handed as `serializedPrompt` (the picks never pressed into the text appended). Built
 * here for the composer and the pact spec alike, so the page cannot send what no interaction holds.
 */
export function saveDraftParams(
  agentId: string,
  text: string,
  picked: readonly CodeReference[] = [],
) {
  return {
    path: { id: agentId },
    body: {
      content: draftContent(text, picked),
      serializedPrompt: serializePrompt({ text, picked }),
    },
  };
}

/** `AGENT_PROMPT`'s params: the text, sent to the agent by its id without compacting first. */
export function promptParams(agentId: string, text: string) {
  return { path: { id: agentId }, body: { text, compactFirst: false } };
}
