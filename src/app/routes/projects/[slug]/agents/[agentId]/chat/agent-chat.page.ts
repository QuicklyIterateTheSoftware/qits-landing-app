import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AgentChatStore } from '$core/workspaces/agent-chat.store';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import { buildConversation, EMPTY_CONVERSATION } from '$core/workspaces/chat-model';
import { formatRange } from '$core/workspaces/file-range';
import type { CodeReference } from '$core/workspaces/picked-context';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import { Conversation } from '$patterns/workspaces/conversation/conversation';
import { deliveryNote, PromptComposer } from '$patterns/workspaces/prompt-composer/prompt-composer';

/** How often a running agent's transcript is read again. */
export const TRANSCRIPT_POLL_MS = 3000;

/**
 * An agent's Chat tab, at `/projects/<slug>/agents/<agent id>/chat` (epic qits-1230; by the
 * agent's id since epic qits-1681): the conversation with the agent as it grows, and a prompt box,
 * ported from qits-workspaces-frontend's chat panel without its speech input.
 *
 * Everything is asked of the agent (epic qits-1667), never of its slot. How it runs is the agent's
 * own run state (`AgentsStore.agentOf`, the layout's `getAgent`); its conversation is its harness's
 * transcript through qits-workspaces' agent proxy (`AgentChatStore.loadTranscript`, `GET
 * /workspaces/agent/<agent id>/log?channel=TRANSCRIPT`), read again every {@link
 * TRANSCRIPT_POLL_MS} while the agent is RUNNING and once more when it stops. Its live screen is the
 * Terminal tab; Interrupt and Stop are the agent page's verbs. Below the transcript, the prompt
 * composer (`PromptComposer`), whose draft lives on the service and whose prompt the agent's prompt
 * door hands to it, with the line ranges picked in the Files tab; a pick's ↗ opens it there
 * (`files?path=…&lines=…`).
 *
 * Staleness (qits-1270): `HARNESS_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the agent (`AgentsStore.loadAgent`, quietly), whose run state starts and stops
 * the poll, and the transcript once more. Two exceptions to the one-stream rule stay (qits-1270,
 * lint-allowed by name): the slot's hint channel (`WorkspaceHints`, `/workspaces/api/…`:
 * `prompt-draft` for the composer has no event) and the {@link TRANSCRIPT_POLL_MS} poll while the
 * agent runs (the daemon offers no transcript stream, and qits-events carries no turn).
 *
 * In the browser only: the server renders the tab without reading.
 */
@Component({
  selector: 'app-agent-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Conversation, PromptComposer],
  providers: [WorkspaceHints],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-4 text-sm" aria-label="Chat">
      @if (agent(); as agent) {
        <p class="m-0 text-charcoal-brown-600">{{ explanation() }}</p>
        @if (rowId()) {
          @switch (transcriptState()) {
            @case ('loading') {
              <p class="m-0 text-charcoal-brown-600">Reading the agent’s transcript…</p>
            }
            @case ('error') {
              <p class="m-0 flex items-center gap-3 text-cinnabar-700">
                Could not read the agent’s transcript.
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
                  (click)="reload()"
                >
                  Try again
                </button>
              </p>
            }
            @default {
              <section
                class="rounded-md border border-charcoal-brown-200 bg-white p-3"
                aria-label="The transcript"
                aria-live="polite"
              >
                @if (transcript().items.length === 0) {
                  <p class="m-0 text-charcoal-brown-600">The transcript has nothing in it yet.</p>
                } @else {
                  <app-conversation [items]="transcript().items" />
                }
              </section>
            }
          }
        }
        @if (lastSent(); as note) {
          <p class="m-0 text-mint-leaf-800" role="status">{{ note }}</p>
        }
        <app-prompt-composer
          [agentId]="agent.agentId ?? ''"
          [workspaceRowId]="rowId()"
          [preamble]="preamble()"
          (sent)="onSent($event)"
          (openReference)="openReference($event)"
        />
      }
    </section>
  `,
})
export class AgentChatPage {
  private readonly agents = inject(AgentsStore);
  private readonly chats = inject(AgentChatStore);
  private readonly hints = inject(WorkspaceHints);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The agent's id, the agent layout's `:agentId`. */
  private readonly agentId = toSignal(
    this.layoutRoute().paramMap.pipe(map((params) => params.get('agentId') ?? '')),
    { initialValue: '' },
  );

  /** The agent, as the layout read it (`AgentsStore.loadAgent`). */
  protected readonly agent = computed(() => {
    const id = this.agentId();
    return id ? this.agents.agentOf(id)?.agent : undefined;
  });

  protected readonly rowId = computed(() => this.agent()?.workspaceRowId ?? 0);

  private readonly running = computed(() => this.agent()?.runState === 'RUNNING');

  /** What the work is about, for the prompt rewrite: the item's id and title. */
  protected readonly preamble = computed(() => {
    const agent = this.agent();
    return [agent?.entityId, agent?.entityTitle].filter(Boolean).join(': ') || null;
  });

  protected readonly explanation = computed(() => {
    if (!this.rowId()) {
      return 'This agent has no workspace yet. A message sent here is its first turn, once it starts.';
    }
    switch (this.agent()?.runState) {
      case 'RUNNING':
        return 'This agent is running; its live screen is on the Terminal tab. Below is its transcript, read-only. A message sent here is typed into it.';
      case 'STOPPED':
        return 'This agent was stopped. Below is its transcript. A message sent here starts it again to hear it.';
      default:
        return 'This agent is not running right now. Below is its transcript. A message sent here resumes it to hear it.';
    }
  });

  private readonly transcriptRead = computed(() => this.chats.transcriptOf(this.agentId()));

  protected readonly transcriptState = computed(() => this.transcriptRead()?.status ?? 'loading');

  protected readonly transcript = computed(() => {
    const lines = this.transcriptRead()?.lines ?? [];
    return lines.length === 0 ? EMPTY_CONVERSATION : buildConversation(lines);
  });

  /** What the last prompt the composer sent became, in words. */
  protected readonly lastSent = signal<string | null>(null);

  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    effect(() => {
      const rowId = this.rowId();
      untracked(() => this.hints.watch(rowId));
    });
    // Keyed by agent, slot and whether it runs: a stop reads the last lines once more.
    effect(() => {
      const agentId = this.agentId();
      const rowId = this.rowId();
      const running = this.running();
      untracked(() => this.followTranscript(agentId, rowId, running));
    });
    this.agents.follow(
      destroy,
      () => ({
        agentId: this.agentId() || undefined,
        workspaceId: this.rowId() ? String(this.rowId()) : undefined,
      }),
      () => this.refresh(),
      HARNESS_EVENTS,
    );
    destroy.onDestroy(() => this.stopPoll());
  }

  /** The agent layout's route, which holds `:agentId`. */
  private layoutRoute(): ActivatedRoute {
    const route = inject(ActivatedRoute);
    return route.parent ?? route;
  }

  /** Reads the transcript again. */
  protected reload(): void {
    const agentId = this.agentId();
    if (agentId && this.rowId()) void this.chats.loadTranscript(agentId);
  }

  /** After a harness event: the agent (its run state) and its transcript. */
  private refresh(): void {
    const agentId = this.agentId();
    if (!agentId) return;
    void this.agents.loadAgent(agentId);
    this.reload();
  }

  protected onSent(delivery: AgentDelivery): void {
    this.lastSent.set(deliveryNote(delivery));
    this.refresh();
  }

  /** A picked reference's ↗: its lines, open in the Files tab. */
  protected openReference(reference: CodeReference): void {
    void this.router.navigate(['..', 'files'], {
      relativeTo: this.route,
      queryParams: { path: reference.path, lines: formatRange(reference) },
    });
  }

  private followTranscript(agentId: string, rowId: number, running: boolean): void {
    this.stopPoll();
    if (!agentId || !rowId) return;
    void this.chats.loadTranscript(agentId);
    if (running) {
      this.poll = setInterval(() => void this.chats.loadTranscript(agentId), TRANSCRIPT_POLL_MS);
    }
  }

  private stopPoll(): void {
    if (this.poll !== null) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}
