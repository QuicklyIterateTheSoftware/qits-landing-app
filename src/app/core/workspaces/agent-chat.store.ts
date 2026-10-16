import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getCommandLog, refinePrompt, terminateCommand } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { GET_TRANSCRIPT, REFINE_PROMPT, TERMINATE_COMMAND } from './agent-chat.consumes';
import { containerBase } from './agent-harness.store';
import type { ReadStatus } from './agents.store';

/** A command's transcript, as `loadTranscript` left it: its lines, in order. */
export interface ChatTranscript {
  readonly status: ReadStatus;
  readonly lines: readonly string[];
}

interface AgentChatState {
  /** By `<slot row id>/<command id>`. */
  readonly transcripts: Readonly<Record<string, ChatTranscript>>;
}

/** What a terminate or a rewrite came to: `ok`, or the failure's status (0: no answer). */
export type ChatOutcome<T = void> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

const key = (workspaceRowId: number, commandId: string) => `${workspaceRowId}/${commandId}`;

/**
 * An agent's conversation on its slot's daemon, through qits-workspaces' container proxy (epic
 * qits-1230), for the agent's Chat tab, as qits-workspaces-frontend's chat read it:
 *
 * - `loadTranscript`: a harness's transcript (`getCommandLog`, `channel=TRANSCRIPT`), the same
 *   lines a chat replays on its socket; for an agent in a terminal, it is the conversation. A read
 *   again that fails keeps the last good lines.
 * - `terminate`: end a running chat (`terminateCommand`). Closing the socket only detaches.
 * - `refine`: rewrite rough notes into a task prompt (`refinePrompt`): one model call over the
 *   harness installed in the container; `preamble` says what the work is about.
 *
 * Every call gets the container's base as its `baseUrl`, at qits-workspaces' origin.
 *
 * Staleness (qits-1270): no qits-events event carries a turn, so a terminal harness's transcript
 * is the Chat tab's `TRANSCRIPT_POLL_MS` poll while the harness runs (a named, lint-allowed
 * exception), started and stopped by the harness, which `HARNESS_EVENTS` keep current; a running
 * chat's turns come down its socket.
 */
export const AgentChatStore = signalStore(
  { providedIn: 'root' },
  withState<AgentChatState>({ transcripts: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);
    const base = (workspaceRowId: number) =>
      containerBase(origins.api('workspaces'), workspaceRowId);
    const set = (id: string, value: ChatTranscript) =>
      patchState(store, { transcripts: { ...store.transcripts(), [id]: value } });

    return {
      async loadTranscript(workspaceRowId: number, commandId: string): Promise<void> {
        if (!Number.isInteger(workspaceRowId) || workspaceRowId <= 0 || !commandId) return;
        const id = key(workspaceRowId, commandId);
        if (!store.transcripts()[id]) set(id, { status: 'loading', lines: [] });
        const answer = await consume(
          getCommandLog({
            baseUrl: base(workspaceRowId),
            path: { commandId },
            query: { channel: 'TRANSCRIPT' },
          }),
          GET_TRANSCRIPT,
        );
        if (answer.error !== undefined || !answer.data) {
          const before = store.transcripts()[id];
          if (before?.status !== 'loaded') set(id, { status: 'error', lines: [] });
          return;
        }
        const lines = [...answer.data.lines]
          .sort((a, b) => a.sequence - b.sequence)
          .map((line) => line.content);
        set(id, { status: 'loaded', lines });
      },
      transcriptOf(workspaceRowId: number, commandId: string): ChatTranscript | undefined {
        return store.transcripts()[key(workspaceRowId, commandId)];
      },
      async terminate(workspaceRowId: number, commandId: string): Promise<ChatOutcome> {
        const answer = await consume(
          // The daemon's door takes an empty JSON object, as qits-workspaces-frontend sent it.
          terminateCommand({
            baseUrl: base(workspaceRowId),
            path: { commandId },
            body: {} as never,
          }),
          TERMINATE_COMMAND,
        );
        return answer.error === undefined
          ? { ok: true, value: undefined }
          : { ok: false, status: answer.response?.status ?? 0 };
      },
      async refine(
        workspaceRowId: number,
        transcript: string,
        preamble: string | null,
      ): Promise<ChatOutcome<string>> {
        const answer = await consume(
          refinePrompt({
            baseUrl: base(workspaceRowId),
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
