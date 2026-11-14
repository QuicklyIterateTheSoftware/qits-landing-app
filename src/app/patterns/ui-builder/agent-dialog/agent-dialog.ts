import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsMutation,
  qitsResource,
} from '@qits/angular';
import { refreshOn } from '$core/events/refresh-on';
import {
  aboutProjectAgents,
  heardAgentState,
  NAMED_AGENT_STATE_CHANGED,
  NAMED_AGENT_STATE_LABELS,
  namedAgentTerminalSocketUrl,
  promptAnswerLine,
  promptRefusalLine,
  UI_BUILDER_AGENT,
  type HeardAgentState,
  type NamedAgentState,
} from '$core/named-agents/named-agents';
import { NAMED_AGENTS, PROMPT_NAMED_AGENT } from '$core/named-agents/named-agents.operations';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { openedContext, type OpenedContextFields } from '$core/ui-builder/opened-context';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** The state chip's tone per state. */
const STATE_TONES: Readonly<Record<NamedAgentState, ChipTone>> = {
  STOPPED: 'neutral',
  STARTING: 'waiting',
  IDLE: 'ok',
  BUSY: 'waiting',
  FAILED: 'failed',
};

/** What the line beside the chip says about the terminal's socket (`agent-terminal.page.ts`'s). */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'Closed: the session has ended.',
  lost: 'Closed: could not attach.',
};

/** What the terminal's place says while there is no command to attach to, per state. */
const NO_TERMINAL: Readonly<Record<NamedAgentState, string>> = {
  STOPPED:
    'The agent is not running. Send a prompt to start it: its terminal shows here once it is up.',
  STARTING: 'The agent is starting: its terminal shows here once it is up.',
  IDLE: 'The agent has no terminal right now.',
  BUSY: 'The agent has no terminal right now.',
  FAILED: 'The agent could not be run. Send a prompt to try again.',
};

/** The agent as the dialog shows it: its state and the command whose terminal it attaches. */
interface ShownAgent {
  readonly state: NamedAgentState;
  readonly commandId: string | null;
}

/** What the last Send came to: one line, and whether it was taken (200, 202). */
interface SendResult {
  readonly line: string;
  readonly taken: boolean;
}

/**
 * The UI builder's agent dialog (qits-2157): the project's `ui-builder` named agent (qits-2154, one
 * per project, tied to no work item, keeping its session across visits), its live terminal and a
 * prompt field. It is the UI of `qits projects agents list` and `qits projects agents prompt --name
 * ui-builder`.
 *
 * - A native `<dialog>` opened with `showModal()` (where the DOM has it: jsdom and the server have
 *   not, so it is opened by its `open` attribute there), closed by Escape, the close button or a
 *   click on the backdrop; each says `closed`, and the page removes the dialog. Full screen below
 *   768px. The terminal sits in a pane of bounded height, which `TerminalScreen` sizes itself to.
 * - The agent: the project's named agents (`NAMED_AGENTS`), read on open, its `ui-builder` entry.
 *   With a `commandId`, the terminal attaches to that command (`namedAgentTerminalSocketUrl` on
 *   qits-projects' container proxy, through `WEB_SOCKET`; `TerminalSocket`) and keystrokes and
 *   sizes go to it. Without one (STOPPED, or STARTING before the daemon takes it) the terminal's
 *   place says so. A `NamedAgentStateChanged` about the agent is shown at once, until the list read
 *   again after it answers (so a command it brings attaches at once); a new command re-attaches.
 * - Closing only detaches (`TerminalSocket.close()`): it never stops, interrupts or discards the
 *   session. Opened again, the dialog attaches to the same command, and the daemon replays its
 *   scrollback.
 * - The prompt field: Enter sends, Shift+Enter is a new line. Send posts `PROMPT_NAMED_AGENT` with
 *   the opened-context block (`openedContext`, of what the page shows at that moment: `context`)
 *   before the text, which only this door can prefix: typing in the terminal goes into the Claude
 *   TUI as typed, which the line under the field says. One line says what came of it: delivered,
 *   queued (at its position), starting (202), or refused (409, 429, 503, with the server's
 *   `reason`). The field is cleared only when the prompt was taken (200, 202).
 * - The header's chip is the agent's state (Stopped, Starting, Idle, Working, Failed), the
 *   terminal's link status beside it.
 *
 * Staleness (qits-1270): `NamedAgentStateChanged` naming the open project (`projectId`) → the named
 * agents (the resource's `refreshOn`); of them, the `ui-builder` agent's state and command are
 * shown at once (`refreshOn`, the dialog's own), which attaches or detaches the terminal.
 *
 * In the browser only: the server renders nothing it reads, and never connects.
 */
@Component({
  selector: 'app-agent-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, QitsEntity, QitsEntityList, QitsField, TerminalScreen],
  host: { class: 'contents' },
  template: `
    <dialog
      #dialog
      class="m-auto box-border open:flex max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] flex-col rounded-lg border border-line bg-surface p-0 text-fg backdrop:bg-shadow max-md:m-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none max-md:rounded-none max-md:border-0"
      aria-labelledby="agent-dialog-title"
      (keydown)="dialogKey($event)"
      (cancel)="cancelled($event)"
      (close)="finish()"
      (click)="backdrop($event)"
    >
      <div class="flex min-h-0 flex-1 flex-col gap-3 p-4" [qitsEntityList]="agents">
        <header class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="agent-dialog-title" class="m-0 text-lg font-semibold">UI builder agent</h2>
          @if (listed(); as entry) {
            <span class="agent-state inline-flex" [qitsEntity]="entry" entityKey="name">
              @if (shown(); as agent) {
                <ui-chip
                  [label]="stateLabel(agent.state)"
                  [tone]="stateTone(agent.state)"
                  [fieldOf]="entry"
                  [qitsField]="{ derived: ['state'] }"
                />
              }
            </span>
          }
          @if (socket()) {
            <span
              class="link text-sm"
              [class.text-fg-soft]="link() === 'open' || link() === 'connecting'"
              [class.text-danger]="link() !== 'open' && link() !== 'connecting'"
              role="status"
              >{{ linkLabel() }}</span
            >
            @if (link() === 'lost') {
              <button
                type="button"
                class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
                (click)="socket()?.rearm()"
              >
                Try to attach again
              </button>
            }
          }
          <button
            type="button"
            class="close ml-auto cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg hover:bg-surface-subtle"
            aria-label="Close the agent dialog"
            (click)="finish()"
          >
            Close
          </button>
        </header>
        <div
          class="terminal-pane h-[min(28rem,50dvh)] min-h-48 shrink-0 overflow-y-auto max-md:h-auto max-md:flex-1 max-md:shrink"
        >
          @if (socket()) {
            <ui-terminal-screen
              [frames]="frames()"
              [attached]="link() === 'open'"
              label="UI builder agent terminal"
              (data)="socket()?.send($event)"
              (resized)="socket()?.resize($event.cols, $event.rows)"
            />
          } @else if (listed(); as entry) {
            <p class="no-terminal {{ placeClass }}" [qitsEntity]="entry" entityKey="name">
              <span [fieldOf]="entry" [qitsField]="{ derived: ['state', 'commandId'] }">{{
                noTerminal()
              }}</span>
            </p>
          } @else {
            <p class="no-terminal {{ placeClass }}">
              {{ readLine() }}
              @if (agents.status() === 'error') {
                <button
                  type="button"
                  class="ml-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
                  (click)="agents.reload()"
                >
                  Try again
                </button>
              }
            </p>
          }
        </div>
        <form class="flex flex-col gap-1" (submit)="submitted($event)">
          <label class="text-sm font-semibold" for="agent-dialog-prompt">Prompt</label>
          <div class="flex items-end gap-2">
            <textarea
              id="agent-dialog-prompt"
              autofocus
              class="box-border min-h-16 flex-1 resize-y rounded-md border border-line bg-surface px-2 py-1 font-sans text-sm text-fg"
              rows="3"
              placeholder="Ask for a pitch of what you see, or about it"
              [value]="draft()"
              (input)="typed($event)"
              (keydown)="promptKey($event)"
            ></textarea>
            <button
              type="submit"
              class="send cursor-pointer rounded-md border-0 bg-accent px-3 py-2 text-sm font-semibold text-fg-on-accent disabled:cursor-default disabled:opacity-50"
              [disabled]="sending() || !draft().trim()"
            >
              Send
            </button>
          </div>
          <p
            class="result m-0 min-h-5 text-sm"
            [class.text-fg-soft]="result()?.taken !== false"
            [class.text-danger]="result()?.taken === false"
            role="status"
          >
            {{ result()?.line ?? '' }}
          </p>
          <p class="hint m-0 text-xs text-fg-muted">
            Send puts what the page shows (route, screenshot, selection) before your text. Text
            typed straight into the terminal goes to the agent as typed, without that context.
          </p>
        </form>
      </div>
    </dialog>
  `,
})
export class AgentDialog {
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open project's id. */
  readonly projectId = input.required<string>();
  /** What the UI builder shows now, put before each prompt (`openedContext`). */
  readonly context = input.required<OpenedContextFields>();
  /** The dialog was closed (Escape, the close button, the backdrop): the page removes it. */
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** The project's named agents, in the browser only, read again after each state change. */
  protected readonly agents = qitsResource(
    NAMED_AGENTS,
    () => {
      const projectId = this.projectId();
      return this.browser && projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: [NAMED_AGENT_STATE_CHANGED],
        when: (event) => aboutProjectAgents(event, this.projectId()),
      },
    },
  );

  /** The list's value, when it has one. */
  private readonly answered = computed(() =>
    this.agents.hasValue() ? this.agents.value() : undefined,
  );

  /** The `ui-builder` entry of the list; null until read, or when the project has none. */
  protected readonly listed = computed(
    () => this.answered()?.agents.find((agent) => agent.name === UI_BUILDER_AGENT) ?? null,
  );

  /** The latest state event about the agent, with the list's value it arrived over. */
  private readonly heard = signal<{
    readonly over: unknown;
    readonly said: HeardAgentState;
  } | null>(null);

  /**
   * The agent as shown: what the latest state event said, until the list answers again after it;
   * else its list entry. Null while neither says anything.
   */
  protected readonly shown = computed((): ShownAgent | null => {
    const heard = this.heard();
    if (heard && heard.over === this.answered()) return heard.said;
    const entry = this.listed();
    return entry ? { state: entry.state, commandId: entry.commandId ?? null } : null;
  });

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** The terminal's place, while there is no terminal to show. */
  protected readonly placeClass =
    'm-0 flex h-full min-h-48 items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-sm text-fg-soft';

  /** What the terminal's place says while the agent shows without a command, by its state. */
  protected readonly noTerminal = computed(() => {
    const agent = this.shown();
    return agent ? NO_TERMINAL[agent.state] : '';
  });

  /** What the terminal's place says while the list names no ui-builder agent: why not. */
  protected readonly readLine = computed(() => {
    if (this.agents.status() === 'error') return 'The agent could not be read.';
    return this.agents.hasValue() ? 'This project has no ui-builder agent.' : 'Reading the agent…';
  });

  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly result = signal<SendResult | null>(null);

  private readonly prompt = qitsMutation(PROMPT_NAMED_AGENT);

  /** `<project>/<command>` of the socket on hand. */
  private socketFor: string | null = null;
  private done = false;

  constructor() {
    afterNextRender(() => this.show());
    if (!this.browser) return;
    effect(() => {
      const projectId = this.projectId();
      const commandId = this.shown()?.commandId ?? null;
      untracked(() => this.attach(projectId, commandId));
    });
    // The event's own fields, at once: the list is read again after it (its `refreshOn`).
    refreshOn({
      names: [NAMED_AGENT_STATE_CHANGED],
      when: (event) => aboutProjectAgents(event, this.projectId()),
      debounceMs: 0,
      refresh: (events) => {
        const said = events
          .map((event) => heardAgentState(event, this.projectId(), UI_BUILDER_AGENT))
          .filter((heard) => heard !== null)
          .at(-1);
        if (said) this.heard.set({ over: this.answered(), said });
      },
    });
    inject(DestroyRef).onDestroy(() => this.detach());
  }

  protected stateLabel(state: NamedAgentState): string {
    return NAMED_AGENT_STATE_LABELS[state];
  }

  protected stateTone(state: NamedAgentState): ChipTone {
    return STATE_TONES[state];
  }

  /** Closes the dialog: detaches the terminal (the session keeps running) and says `closed` once. */
  protected finish(): void {
    if (this.done) return;
    this.done = true;
    this.detach();
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this.closed.emit();
  }

  /** Escape closes, wherever the focus is in the dialog (the native `cancel` is not everywhere). */
  protected dialogKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.finish();
  }

  protected cancelled(event: Event): void {
    event.preventDefault();
    this.finish();
  }

  /** A click on the backdrop: the dialog element itself, outside its content. */
  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.finish();
  }

  protected typed(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter sends; Shift+Enter (and Enter while composing) is the textarea's own. */
  protected promptKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.send();
  }

  protected submitted(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  /** Posts the opened-context block and the draft; clears the draft only when it was taken. */
  private async send(): Promise<void> {
    const text = this.draft();
    const projectId = this.projectId();
    if (!text.trim() || this.sending() || !projectId) return;
    this.sending.set(true);
    try {
      const answer = await this.prompt.run({
        path: { projectId, name: UI_BUILDER_AGENT },
        body: { text: openedContext(this.context(), text) },
      });
      if (answer) {
        this.result.set({ line: promptAnswerLine(answer), taken: true });
        this.draft.set('');
      } else {
        this.result.set({ line: promptRefusalLine(0, undefined), taken: false });
      }
    } catch (error) {
      const refused = error instanceof QitsApiError ? error : null;
      this.result.set({
        line: promptRefusalLine(refused?.status ?? 0, refused?.error?.reason),
        taken: false,
      });
    } finally {
      this.sending.set(false);
    }
  }

  /** Opens the dialog modally, or by its attribute where the DOM has no `showModal`. */
  private show(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open || this.done) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  private attach(projectId: string, commandId: string | null): void {
    const key = commandId && projectId ? `${projectId}/${commandId}` : null;
    if (key === this.socketFor || this.done) return;
    this.detach();
    if (!key || !commandId) return;
    const socket = new TerminalSocket(
      namedAgentTerminalSocketUrl(this.origins.api('projects'), projectId, commandId),
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
