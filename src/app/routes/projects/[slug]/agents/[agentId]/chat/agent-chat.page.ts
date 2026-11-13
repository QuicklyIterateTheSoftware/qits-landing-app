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
import { Router } from '@angular/router';
import { exit, outcomes, QitsEntityList, qitsResource } from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { projectSlugOf } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { AGENT_TRANSCRIPT } from '$core/workspaces/agent-chat.operations';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { agentRoute } from '$core/workspaces/agent-proxy';
import { OPEN_AGENT } from '$core/workspaces/open-agent';
import {
  concerns,
  HARNESS_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from '$core/workspaces/workspace-events';
import { buildConversation, EMPTY_CONVERSATION } from '$core/workspaces/chat-model';
import { formatRange } from '$core/workspaces/file-range';
import type { CodeReference } from '$core/workspaces/picked-context';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import { Conversation } from '$patterns/workspaces/conversation/conversation';
import { deliveryNote, PromptComposer } from '$patterns/workspaces/prompt-composer/prompt-composer';

/** How often a running agent's transcript is read again. */
export const TRANSCRIPT_POLL_MS = 3000;

/**
 * An agent's Chat tab, at `/projects/<slug>/agents/<agent id>/chat` (epic qits-1230; by the agent's
 * id since epic qits-1681): the conversation with the agent as it grows, and a prompt box, ported
 * from qits-workspaces-frontend's chat panel without its speech input.
 *
 * Everything is asked of the agent (epic qits-1667), never of its slot. How it runs is the agent's
 * own run state (`OPEN_AGENT`, the layout's `getAgent`); its conversation is its harness's
 * transcript through qits-workspaces' agent proxy, the tab's own `qitsResource` over
 * `AGENT_TRANSCRIPT` (qits-2146; `GET /workspaces/agent/<agent id>/log?channel=TRANSCRIPT`), read
 * again (`reload()`) every {@link TRANSCRIPT_POLL_MS} while the agent is RUNNING and once more when
 * it stops. The transcript's section names that read as its source (`qitsEntityList`, qits-2141).
 * Its live screen is the Terminal tab; Interrupt and Stop are the agent page's verbs. Below the
 * transcript, the prompt composer (`PromptComposer`), whose draft lives on the service and whose
 * prompt the agent's prompt door hands to it, with the line ranges picked in the Files tab; a
 * pick's ↗ opens it there (`files?path=…&lines=…`, the declared exit `open-picked-reference`
 * `files`, epic qits-2000).
 *
 * Staleness (qits-1270): `HARNESS_EVENTS` naming the agent (`agentId`) or its slot (`workspaceId`)
 * → the transcript once more (its resource's `refreshOn`), and the agent, whose run state starts
 * and stops the poll (the layout's `refreshOn`, `WORKSPACE_EVENTS`). Two exceptions to the
 * one-stream rule stay (qits-1270, lint-allowed by name): the slot's hint channel
 * (`WorkspaceHints`, `/workspaces/api/…`: `prompt-draft` for the composer has no event) and the
 * {@link TRANSCRIPT_POLL_MS} poll while the agent runs (the daemon offers no transcript stream, and
 * qits-events carries no turn).
 *
 * In the browser only: the server renders the tab without reading.
 */
@Component({
  selector: 'app-agent-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Conversation, PromptComposer, QitsEntityList],
  providers: [WorkspaceHints],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-4 text-sm" aria-label="Chat">
      @if (agent(); as agent) {
        <p class="m-0 text-fg-soft">{{ explanation() }}</p>
        @if (rowId()) {
          @switch (transcriptState()) {
            @case ('loading') {
              <p class="m-0 text-fg-soft">Reading the agent’s transcript…</p>
            }
            @case ('error') {
              <p class="m-0 flex items-center gap-3 text-danger">
                Could not read the agent’s transcript.
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
                  (click)="reload()"
                >
                  Try again
                </button>
              </p>
            }
            @default {
              <section
                class="rounded-md border border-line bg-surface p-3"
                aria-label="The transcript"
                aria-live="polite"
                [qitsEntityList]="log"
              >
                @if (transcript().items.length === 0) {
                  <p class="m-0 text-fg-soft">The transcript has nothing in it yet.</p>
                } @else {
                  <app-conversation [items]="transcript().items" />
                }
              </section>
            }
          }
        }
        @if (lastSent(); as note) {
          <p class="m-0 text-success" role="status">{{ note }}</p>
        }
        <app-prompt-composer
          [agentId]="agent.agentId ?? ''"
          [workspaceRowId]="rowId()"
          [preamble]="preamble()"
          (sent)="onSent($event)"
          [referenceOutcomes]="[opening.files]"
          (openReference)="openReference($event)"
        />
      }
    </section>
  `,
})
export class AgentChatPage {
  private readonly open = inject(OPEN_AGENT);
  private readonly origins = inject(PlatformOrigins);
  private readonly hints = inject(WorkspaceHints);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** A picked reference's ↗ opens its lines in the Files tab (epic qits-2000). */
  protected readonly opening = outcomes('open-picked-reference', {
    files: exit('projects/:slug/agents/:agentId/files'),
  });

  /** The agent's id, the agent layout's `:agentId`. */
  private readonly agentId = this.open.agentId;

  /** The agent, as the layout read it (`OPEN_AGENT`). */
  protected readonly agent = this.open.agent;

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

  /**
   * The agent's transcript, once it has a slot, in the browser only; again after a harness event
   * naming the agent or its slot, and on the poll.
   */
  protected readonly log = qitsResource(
    AGENT_TRANSCRIPT,
    () => {
      const agentId = this.agentId();
      if (!this.browser || !agentId || !this.rowId()) return undefined;
      return {
        ...agentRoute(this.origins.api('workspaces'), agentId, 'log'),
        // The proxy picks the agent's command; the route names none.
        path: { commandId: '' },
        query: { channel: 'TRANSCRIPT' as const },
      };
    },
    {
      refreshOn: {
        names: HARNESS_EVENTS,
        when: (event) =>
          concerns(event, {
            agentId: this.agentId() || undefined,
            workspaceId: this.rowId() ? String(this.rowId()) : undefined,
          }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The transcript's read: a read again that fails keeps the lines on screen. */
  protected readonly transcriptState = computed(() => loadState(this.log));

  protected readonly transcript = computed(() => {
    const lines = this.log.hasValue()
      ? [...(this.log.value()?.lines ?? [])]
          .sort((a, b) => a.sequence - b.sequence)
          .map((line) => line.content)
      : [];
    return lines.length === 0 ? EMPTY_CONVERSATION : buildConversation(lines);
  });

  /** What the last prompt the composer sent became, in words. */
  protected readonly lastSent = signal<string | null>(null);

  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!this.browser) return;
    effect(() => {
      const rowId = this.rowId();
      untracked(() => this.hints.watch(rowId));
    });
    // Keyed by agent, slot and whether it runs: a stop reads the last lines once more. A new agent
    // or slot is read by the resource itself, its params having changed.
    let followed = '';
    effect(() => {
      const agentId = this.agentId();
      const rowId = this.rowId();
      const running = this.running();
      untracked(() => {
        const key = `${agentId}/${rowId}`;
        this.followTranscript(agentId, rowId, running, key === followed);
        followed = key;
      });
    });
    inject(DestroyRef).onDestroy(() => this.stopPoll());
  }

  /** Reads the transcript again. */
  protected reload(): void {
    if (this.agentId() && this.rowId()) this.log.reload();
  }

  protected onSent(delivery: AgentDelivery): void {
    this.lastSent.set(deliveryNote(delivery));
    // The agent (its run state) and its transcript.
    this.open.reload();
    this.reload();
  }

  /** A picked reference's ↗: its lines, open in the Files tab. */
  protected openReference(reference: CodeReference): void {
    void this.opening.files.go(
      { slug: projectSlugOf(this.router.url) ?? '', agentId: this.agentId() },
      { queryParams: { path: reference.path, lines: formatRange(reference) } },
    );
  }

  private followTranscript(agentId: string, rowId: number, running: boolean, same: boolean): void {
    this.stopPoll();
    if (!agentId || !rowId) return;
    if (same) this.log.reload();
    if (running) this.poll = setInterval(() => this.log.reload(), TRANSCRIPT_POLL_MS);
  }

  private stopPoll(): void {
    if (this.poll !== null) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
}
