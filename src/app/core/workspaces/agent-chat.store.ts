import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getCommandLog, refinePrompt } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { GET_TRANSCRIPT, REFINE_PROMPT } from './agent-chat.consumes';
import { agentRoute } from './agent-proxy';
import type { ReadStatus } from './agents.store';

/** An agent's transcript, as `loadTranscript` left it: its lines, in order. */
export interface ChatTranscript {
  readonly status: ReadStatus;
  readonly lines: readonly string[];
}

interface AgentChatState {
  /** By the agent's id. */
  readonly transcripts: Readonly<Record<string, ChatTranscript>>;
}

/** What a rewrite came to: `ok`, or the failure's status (0: no answer). */
export type ChatOutcome<T = void> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

/**
 * An agent's conversation on the daemon of the slot it is placed in, through qits-workspaces' agent
 * proxy (`/workspaces/agent/<agent id>/…`, epic qits-1667; before it the container proxy of epic
 * qits-1230), for the agent's Chat tab:
 *
 * - `loadTranscript(agentId)`: its harness's transcript (`GET …/log?channel=TRANSCRIPT`, which the
 *   service maps to the daemon's `getCommandLog` of the agent's command, the last one of a yielded
 *   or stopped agent too). A read again that fails keeps the last good lines.
 * - `refine(agentId, notes, preamble)`: rewrite rough notes into a task prompt (`POST
 *   …/prompt-refinements`, the daemon's `refinePrompt`): one model call over the harness installed
 *   in the agent's container; `preamble` says what the work is about.
 *
 * Every call is the daemon's generated one, addressed at the agent's route on qits-workspaces'
 * origin (`agentRoute`); the answer is the daemon's.
 *
 * Staleness (qits-1270): no qits-events event carries a turn, so the transcript is the Chat tab's
 * `TRANSCRIPT_POLL_MS` poll while the agent runs (a named, lint-allowed exception), started and
 * stopped by its run state, which `HARNESS_EVENTS` keep current.
 */
export const AgentChatStore = signalStore(
  { providedIn: 'root' },
  withState<AgentChatState>({ transcripts: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);
    const set = (id: string, value: ChatTranscript) =>
      patchState(store, { transcripts: { ...store.transcripts(), [id]: value } });

    return {
      async loadTranscript(agentId: string): Promise<void> {
        if (!agentId) return;
        if (!store.transcripts()[agentId]) set(agentId, { status: 'loading', lines: [] });
        const answer = await consume(
          getCommandLog({
            ...agentRoute(origins.api('workspaces'), agentId, 'log'),
            // The proxy picks the agent's command; the route names none.
            path: { commandId: '' },
            query: { channel: 'TRANSCRIPT' },
          }),
          GET_TRANSCRIPT,
        );
        if (answer.error !== undefined || !answer.data) {
          const before = store.transcripts()[agentId];
          if (before?.status !== 'loaded') set(agentId, { status: 'error', lines: [] });
          return;
        }
        const lines = [...answer.data.lines]
          .sort((a, b) => a.sequence - b.sequence)
          .map((line) => line.content);
        set(agentId, { status: 'loaded', lines });
      },
      transcriptOf(agentId: string): ChatTranscript | undefined {
        return store.transcripts()[agentId];
      },
      async refine(
        agentId: string,
        transcript: string,
        preamble: string | null,
      ): Promise<ChatOutcome<string>> {
        const answer = await consume(
          refinePrompt({
            ...agentRoute(origins.api('workspaces'), agentId, 'prompt-refinements'),
            body: preamble ? { transcript, preamble } : { transcript },
          }),
          REFINE_PROMPT,
        );
        return answer.error === undefined && answer.data
          ? { ok: true, value: answer.data.prompt }
          : { ok: false, status: answer.response?.status ?? 0 };
      },
    };
  }),
);
