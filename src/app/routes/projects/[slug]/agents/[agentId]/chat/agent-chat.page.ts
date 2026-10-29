import { DOCUMENT, isPlatformBrowser } from '@angular/common';
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
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { AgentChatStore } from '$core/workspaces/agent-chat.store';
import { AgentHarnessStore } from '$core/workspaces/agent-harness.store';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import { buildConversation, EMPTY_CONVERSATION } from '$core/workspaces/chat-model';
import { formatRange } from '$core/workspaces/file-range';
import type { CodeReference } from '$core/workspaces/picked-context';
import { agentChatSocketUrl, ChatSocket, type ChatLink } from '$core/workspaces/chat-socket';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import { Conversation } from '$patterns/workspaces/conversation/conversation';
import { deliveryNote, PromptComposer } from '$patterns/workspaces/prompt-composer/prompt-composer';
import { ActionButton } from '$ui/components/action-button/action-button';
import type { Action } from '$ui/components/action-button/action';

/** How often a terminal agent's transcript is read again while its harness runs. */
export const TRANSCRIPT_POLL_MS = 3000;

/** What the live chat's status line says about the socket; `open` says nothing. */
const LINK_LABELS: Readonly<Record<ChatLink, string>> = {
  connecting: 'Attaching…',
  open: '',
  reconnecting: 'Reconnecting…',
  disconnected: 'Detached: the conversation has ended.',
  lost: 'Could not attach.',
};

/**
 * An agent's Chat tab, at `/projects/<slug>/agents/<agent id>/chat` (epic qits-1230; by the
 * agent's id since epic qits-1681): the conversation with the agent as it grows, and a prompt box, ported from
 * qits-workspaces-frontend's chat panel without its speech input.
 *
 * The agent is the layout's (`AgentsStore.agentOf`, by the URL's agent id); its harness's command and whether it runs come
 * from its slot's daemon (`AgentHarnessStore`), read again after a lifecycle event about the agent
 * or its slot and on the slot's `commands` hint (`WorkspaceHints`).
 *
 * - **A running chat** (`CHAT`): the tab attaches to the agent's chat on qits-workspaces' agent
 *   proxy (`agentChatSocketUrl`, `/workspaces/agent/<agent id>/chat`, epic qits-1667; through
 *   `WEB_SOCKET`), which the service joins to the running command, which replays the whole conversation and then streams it; a message typed there
 *   goes down the socket, and the turn shows when the daemon echoes it. Terminate ends the run.
 * - **An agent in a terminal** (the default): its screen is on the Terminal tab; here its
 *   transcript (`AgentChatStore.loadTranscript`), read again every {@link TRANSCRIPT_POLL_MS} while
 *   the harness runs, and once more when it stops.
 * - Otherwise, and below a terminal's transcript: the prompt composer (`PromptComposer`), whose
 *   draft lives on the service and whose prompt the delivery door hands to the agent, with the line
 *   ranges picked in the Files tab; a pick's ↗ opens it there (`files?path=…&lines=…`).
 *
 * Staleness (qits-1270): `HARNESS_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the harness (`AgentHarnessStore.load`, quietly). `AgentStarted` and
 * `AgentHarnessExited` carry the `commandId`, so through the harness they already decide which
 * command's transcript is shown and whether it is polled: a start begins it, an exit stops the
 * poll and reads the last lines once more. The slot's `commands` hint (`WorkspaceHints`) does the
 * same for the agent's harness, and stays only until it is retired (those two events cover it).
 * Two exceptions to the one-stream rule stay (qits-1270, lint-allowed by name): the hint channel
 * (`prompt-draft` for the composer has no event) and the {@link TRANSCRIPT_POLL_MS} poll while a
 * terminal harness runs (the daemon offers no transcript stream, and qits-events carries no turn).
 *
 * In the browser only: the server renders the tab without reading or connecting.
 */
@Component({
  selector: 'app-agent-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Conversation, PromptComposer],
  providers: [WorkspaceHints],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-4 text-sm" aria-label="Chat">
      @if (agent(); as agent) {
        @switch (view()) {
          @case ('loading') {
            <p class="m-0 text-charcoal-brown-600">Looking for the agent’s conversation…</p>
          }
          @case ('error') {
            <p class="m-0 flex items-center gap-3 text-cinnabar-700">
              Could not reach the agent’s container.
              <button
                type="button"
                class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
                (click)="reload()"
              >
                Try again
              </button>
            </p>
          }
          @case ('chat') {
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="m-0 text-charcoal-brown-600">
                Switching tabs keeps the agent running; come back to pick up the conversation.
                @if (live()) {
                  Sub-agents join when the run ends: the live view shows the main thread only.
                }
              </p>
              <div class="flex items-center gap-3">
                @if (linkLabel(); as label) {
                  <span class="text-cinnabar-700" role="status">{{ label }}</span>
                }
                @if (pending() > 0) {
                  <span class="text-charcoal-brown-600" role="status">
                    {{ pending() }} message{{ pending() === 1 ? '' : 's' }} waiting to send
                  </span>
                }
                @if (live()) {
                  <ui-action-button [action]="terminateAction()" />
                }
              </div>
            </div>
            @if (terminateProblem(); as problem) {
              <p class="m-0 text-cinnabar-700" role="alert">{{ problem }}</p>
            }
            <section
              class="rounded-md border border-charcoal-brown-200 bg-white p-3"
              aria-label="The conversation"
              aria-live="polite"
            >
              @if (conversation().items.length === 0) {
                <p class="m-0 text-charcoal-brown-600">
                  {{
                    link() === 'open'
                      ? 'The session is attached and has said nothing yet.'
                      : 'Attaching to the conversation…'
                  }}
                </p>
              } @else {
                <app-conversation [items]="conversation().items" />
              }
            </section>
            @if (conversation().closed) {
              <p class="m-0 text-charcoal-brown-600">
                This conversation has ended. Its transcript is complete, sub-agents and all.
              </p>
            } @else {
              <div class="flex items-end gap-3">
                <label class="flex grow flex-col gap-1">
                  <span class="sr-only">Your next message</span>
                  <textarea
                    class="rounded-md border border-charcoal-brown-300 bg-white px-2 py-1.5 font-sans text-sm text-charcoal-brown-900"
                    rows="3"
                    placeholder="Say the next thing. Ctrl/⌘ + Enter sends."
                    [value]="message()"
                    (input)="message.set($any($event.target).value)"
                    (keydown)="onKey($event)"
                  ></textarea>
                </label>
                <ui-action-button [action]="sayAction()" />
              </div>
            }
          }
          @default {
            <p class="m-0 text-charcoal-brown-600">{{ explanation() }}</p>
            @if (transcript(); as transcript) {
              <section
                class="rounded-md border border-charcoal-brown-200 bg-white p-3"
                aria-label="The transcript"
                aria-live="polite"
              >
                @if (transcript.items.length === 0) {
                  <p class="m-0 text-charcoal-brown-600">The transcript has nothing in it yet.</p>
                } @else {
                  <app-conversation [items]="transcript.items" />
                }
              </section>
            }
            @if (lastSent(); as note) {
              <p class="m-0 text-mint-leaf-800" role="status">{{ note }}</p>
            }
            <app-prompt-composer
              [agentId]="agent.agentId ?? ''"
              [workId]="agent.workId ?? ''"
              [workspaceRowId]="rowId()"
              [preamble]="preamble()"
              (sent)="onSent($event)"
              (openReference)="openReference($event)"
            />
          }
        }
      }
    </section>
  `,
})
export class AgentChatPage {
  private readonly agents = inject(AgentsStore);
  private readonly harnesses = inject(AgentHarnessStore);
  private readonly chats = inject(AgentChatStore);
  private readonly hints = inject(WorkspaceHints);
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);
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

  /** What the work is about, for the prompt rewrite: the item's id and title. */
  protected readonly preamble = computed(() => {
    const agent = this.agent();
    return [agent?.entityId, agent?.entityTitle].filter(Boolean).join(': ') || null;
  });

  private readonly harness = computed(() =>
    this.rowId() ? this.harnesses.harnessOf(this.rowId(), this.agentId()) : undefined,
  );

  /**
   * What the tab shows: a read in flight or failed, the live chat, a terminal's transcript, or no
   * harness (`none`; also a queued agent, which has no slot to ask).
   */
  protected readonly view = computed(() => {
    if (!this.rowId()) return 'none';
    const harness = this.harness();
    if (!harness || harness.status === 'loading') return 'loading';
    if (harness.status === 'error') return 'error';
    if (harness.status === 'missing') return 'none';
    if (harness.kind === 'chat') return harness.running ? 'chat' : 'none';
    return harness.kind;
  });

  /** The live chat's command, which the socket attaches to. */
  private readonly chatCommand = computed(() =>
    this.view() === 'chat' ? (this.harness()?.commandId ?? null) : null,
  );

  /** A terminal harness's command, running or not, whose transcript is shown. */
  private readonly terminalCommand = computed(() =>
    this.view() === 'terminal' ? (this.harness()?.commandId ?? null) : null,
  );

  private readonly terminalRunning = computed(
    () => this.view() === 'terminal' && !!this.harness()?.running,
  );

  protected readonly explanation = computed(() => {
    if (!this.rowId()) {
      return 'This agent has no workspace yet. A message sent here is its first turn, once it starts.';
    }
    if (this.view() !== 'terminal') {
      return 'The agent is not in a live chat right now. A message sent here resumes it to hear it.';
    }
    return this.terminalRunning()
      ? 'This agent runs in a terminal; its live screen is on the Terminal tab. Below is its transcript, read-only. A message sent here is typed into it.'
      : 'This agent’s terminal has stopped. Below is its transcript. A message sent here resumes it to hear it.';
  });

  protected readonly transcript = computed(() => {
    const commandId = this.terminalCommand();
    if (!commandId) return null;
    const lines = this.chats.transcriptOf(this.rowId(), commandId)?.lines ?? [];
    return lines.length === 0 ? EMPTY_CONVERSATION : buildConversation(lines);
  });

  protected readonly socket = signal<ChatSocket | null>(null);
  protected readonly link = computed<ChatLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);
  protected readonly pending = computed(() => this.socket()?.queued() ?? 0);
  protected readonly conversation = computed(() => {
    const lines = this.socket()?.lines() ?? [];
    return lines.length === 0 ? EMPTY_CONVERSATION : buildConversation(lines);
  });

  /** Whether the run still goes, as far as the tab can tell. */
  protected readonly live = computed(
    () => this.chatCommand() !== null && !this.conversation().closed,
  );

  /** The message box of a live chat. */
  protected readonly message = signal('');
  protected readonly terminating = signal(false);
  protected readonly terminateProblem = signal<string | null>(null);
  /** What the last prompt the composer sent became, in words. */
  protected readonly lastSent = signal<string | null>(null);

  protected readonly sayAction = computed((): Action => ({
    label: 'Send',
    variant: 'success',
    disabled: !this.message().trim() || !this.live(),
    callback: () => this.say(),
  }));

  protected readonly terminateAction = computed((): Action => ({
    label: this.terminating() ? 'Terminating…' : 'Terminate',
    variant: 'danger',
    disabled: this.terminating(),
    callback: () => void this.terminate(),
  }));

  /** `<slot row id>/<command id>` of the socket on hand: a new command is a new socket. */
  private socketFor: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    const commandHints = this.hints.hints('commands');
    effect(() => {
      const rowId = this.rowId();
      untracked(() => this.hints.watch(rowId));
    });
    effect(() => {
      const rowId = this.rowId();
      const agentId = this.agentId();
      commandHints();
      if (rowId && agentId) untracked(() => void this.harnesses.load(rowId, agentId));
    });
    effect(() => {
      const rowId = this.rowId();
      const commandId = this.chatCommand();
      untracked(() => this.attach(rowId, commandId));
    });
    // Keyed by id and running: a stop reads the last lines once more; a list refresh restarts nothing.
    effect(() => {
      const rowId = this.rowId();
      const commandId = this.terminalCommand();
      const running = this.terminalRunning();
      untracked(() => this.followTranscript(rowId, commandId, running));
    });
    this.agents.follow(
      destroy,
      () => ({
        agentId: this.agentId() || undefined,
        workspaceId: this.rowId() ? String(this.rowId()) : undefined,
      }),
      () => this.reload(),
      HARNESS_EVENTS,
    );
    destroy.onDestroy(() => {
      this.detach();
      this.stopPoll();
    });
  }

  /** The agent layout's route, which holds `:agentId`. */
  private layoutRoute(): ActivatedRoute {
    const route = inject(ActivatedRoute);
    return route.parent ?? route;
  }

  protected reload(): void {
    const rowId = this.rowId();
    const agentId = this.agentId();
    if (rowId && agentId) void this.harnesses.load(rowId, agentId);
  }

  protected onSent(delivery: AgentDelivery): void {
    this.lastSent.set(deliveryNote(delivery));
    this.reload();
  }

  /** A picked reference's ↗: its lines, open in the Files tab. */
  protected openReference(reference: CodeReference): void {
    void this.router.navigate(['..', 'files'], {
      relativeTo: this.route,
      queryParams: { path: reference.path, lines: formatRange(reference) },
    });
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.say();
    }
  }

  /** A message down the live chat's socket. Never an optimistic bubble: the echo shows it. */
  protected say(): void {
    const text = this.message().trim();
    const socket = this.socket();
    if (!text || !socket || !this.live()) return;
    socket.send(text);
    this.message.set('');
  }

  /** End the run; the harness is read again whether or not the daemon took it. */
  protected async terminate(): Promise<void> {
    const commandId = this.chatCommand();
    if (!commandId || this.terminating()) return;
    this.terminating.set(true);
    this.terminateProblem.set(null);
    const outcome = await this.chats.terminate(this.rowId(), commandId);
    this.terminating.set(false);
    if (!outcome.ok) {
      this.terminateProblem.set(
        `The session did not stop: ${outcome.status ? `the daemon answered ${outcome.status}` : 'no answer'}.`,
      );
    }
    this.reload();
  }

  private followTranscript(rowId: number, commandId: string | null, running: boolean): void {
    this.stopPoll();
    if (!rowId || !commandId) return;
    void this.chats.loadTranscript(rowId, commandId);
    if (running) {
      this.poll = setInterval(
        () => void this.chats.loadTranscript(rowId, commandId),
        TRANSCRIPT_POLL_MS,
      );
    }
  }

  private stopPoll(): void {
    if (this.poll !== null) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }

  private attach(rowId: number, commandId: string | null): void {
    const key = commandId && rowId ? `${rowId}/${commandId}` : null;
    if (key === this.socketFor) return;
    this.detach();
    if (!key || !commandId) return;
    const socket = new ChatSocket(
      agentChatSocketUrl(this.origins.api('workspaces'), this.agentId()),
      this.openSocket,
      this.document,
    );
    this.socketFor = key;
    this.socket.set(socket);
    socket.connect();
  }

  private detach(): void {
    this.socket()?.close();
    this.socket.set(null);
    this.socketFor = null;
  }
}
