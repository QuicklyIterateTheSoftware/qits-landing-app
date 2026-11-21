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
  bracketedPaste,
  DESK_AGENT,
  heardAgentState,
  NAMED_AGENT_STATE_CHANGED,
  NAMED_AGENT_STATE_LABELS,
  namedAgentTerminalSocketUrl,
  startRefusalLine,
  type HeardAgentState,
  type NamedAgentState,
} from '$core/named-agents/named-agents';
import { NAMED_AGENTS, START_NAMED_AGENT } from '$core/named-agents/named-agents.operations';
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
  STOPPED: 'The agent is not running. Close and open this dialog to start it.',
  STARTING: 'The agent is starting: its terminal shows here once it is up.',
  IDLE: 'The agent has no terminal right now.',
  BUSY: 'The agent has no terminal right now.',
  FAILED: 'The agent could not be run. Close and open this dialog to try again.',
};

/** The agent as the dialog shows it: its state and the command whose terminal it attaches. */
interface ShownAgent {
  readonly state: NamedAgentState;
  readonly commandId: string | null;
}

/**
 * A named agent's dialog (qits-2157, qits-2499, qits-2495): one of the project's named agents
 * (qits-2154, `agent`: `ui-builder` from the UI builder, `desk` from the Desk page), its state and
 * its live terminal, typed into directly. It is the UI of `qits projects agents list` and the
 * agent's terminal; there is no prompt field.
 *
 * - A native `<dialog>` opened with `showModal()` (where the DOM has it: jsdom and the server have
 *   not, so it is opened by its `open` attribute there), closed by Escape, the close button or a
 *   click on the backdrop; each says `closed`, and the page removes the dialog. Full screen below
 *   768px. The terminal sits in a pane of bounded height, which `TerminalScreen` sizes itself to.
 * - Opened, it starts the agent (`START_NAMED_AGENT`): a stopped desk container is started and
 *   the agent's session asked for; a running agent is left as it is. Its answer is shown at once,
 *   until the list answers after it. The list (`NAMED_AGENTS`) is read once the start answered or
 *   failed, and gives the agent's entry. A failed start says why in the header.
 * - With a `commandId`, the terminal attaches to that command (`namedAgentTerminalSocketUrl` on
 *   qits-projects' container proxy, through `WEB_SOCKET`; `TerminalSocket`) and keystrokes and
 *   sizes go to it. Without one (STARTING before the daemon takes it) the terminal's place says
 *   so. A `NamedAgentStateChanged` about the agent is shown at once, until the list answers again
 *   after it; a new command re-attaches.
 * - **Insert page context** (only with a `context`, the UI builder's): writes the opened-context
 *   block (`openedContext`, of what the page shows at that moment) into the agent's input as a
 *   bracketed paste, so it is not sent: the person types on and presses Enter themselves. Enabled
 *   while the terminal is attached.
 * - Closing only detaches (`TerminalSocket.close()`): it never stops, interrupts or discards the
 *   session. Opened again, the dialog attaches to the same command, and the daemon replays its
 *   scrollback.
 * - The header's chip is the agent's state (Stopped, Starting, Idle, Working, Failed), the
 *   terminal's link status beside it.
 *
 * Staleness (qits-1270): `NamedAgentStateChanged` naming the open project (`projectId`) → the named
 * agents (the resource's `refreshOn`); of them, the agent's own state and command are shown at
 * once (`refreshOn`, the dialog's own), which attaches or detaches the terminal. No event says the
 * desk's state moved, so while the desk shows no terminal its place offers **Read again**.
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
          <h2 id="agent-dialog-title" class="m-0 text-lg font-semibold">{{ title() }}</h2>
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
          @if (startFailure(); as failure) {
            <span class="start-failure text-sm text-danger" role="status">{{ failure }}</span>
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
          #pane
          class="terminal-pane h-[min(28rem,50dvh)] min-h-48 shrink-0 overflow-y-auto max-md:h-auto max-md:flex-1 max-md:shrink"
        >
          @if (socket()) {
            <ui-terminal-screen
              [frames]="frames()"
              [attached]="link() === 'open'"
              [label]="title() + ' terminal'"
              (data)="socket()?.send($event)"
              (resized)="socket()?.resize($event.cols, $event.rows)"
            />
          } @else if (listed(); as entry) {
            <p class="no-terminal {{ placeClass }}" [qitsEntity]="entry" entityKey="name">
              <span [fieldOf]="entry" [qitsField]="{ derived: ['state', 'commandId'] }">{{
                noTerminal()
              }}</span>
              @if (untold()) {
                <button
                  type="button"
                  class="read-again ml-2 cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
                  (click)="agents.reload()"
                >
                  Read again
                </button>
              }
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
        @if (context()) {
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              class="insert-context cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg hover:bg-surface-subtle disabled:cursor-default disabled:opacity-50"
              [disabled]="link() !== 'open'"
              (click)="insertContext()"
            >
              Insert page context
            </button>
            <p class="hint m-0 text-xs text-fg-muted">
              Pastes what the page shows (route, screenshot, selection) into the agent’s input. It
              is not sent: type on, then press Enter.
            </p>
          </div>
        }
      </div>
    </dialog>
  `,
})
export class AgentDialog {
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * The open project's id. Not `required`: the list's resource reads it while the dialog's own
   * view is created, which can come before its inputs are set; empty reads nothing.
   */
  readonly projectId = input('');
  /** The named agent's name (`ui-builder`, `desk`); empty starts and shows nothing. */
  readonly agent = input('');
  /** The dialog's heading, and its terminal's label with ` terminal` after it. */
  readonly title = input.required<string>();
  /** What the page shows now, for Insert page context (`openedContext`); none, no button. */
  readonly context = input<OpenedContextFields | null>(null);
  /** The dialog was closed (Escape, the close button, the backdrop): the page removes it. */
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');

  /** The start's answer (null until it answered), and whether it is over (answered or failed). */
  private readonly started = signal<{
    readonly over: unknown;
    readonly said: ShownAgent;
  } | null>(null);
  private readonly startOver = signal(false);
  /** Why the start failed, in one line; null while it did not. */
  protected readonly startFailure = signal<string | null>(null);

  private readonly start = qitsMutation(START_NAMED_AGENT);

  /**
   * The project's named agents, in the browser only, read once the start is over and again after
   * each state change.
   */
  protected readonly agents = qitsResource(
    NAMED_AGENTS,
    () => {
      const projectId = this.projectId();
      return this.browser && projectId && this.startOver() ? { path: { projectId } } : undefined;
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

  /** The agent's entry of the list; null until read, or when the project has none. */
  protected readonly listed = computed(
    () => this.answered()?.agents.find((agent) => agent.name === this.agent()) ?? null,
  );

  /** The latest state event about the agent, with the list's value it arrived over. */
  private readonly heard = signal<{
    readonly over: unknown;
    readonly said: HeardAgentState;
  } | null>(null);

  /**
   * The agent as shown: what the latest state event said, or the start answered, until the list
   * answers again after it; else its list entry. Null while none says anything.
   */
  protected readonly shown = computed((): ShownAgent | null => {
    const heard = this.heard();
    if (heard && heard.over === this.answered()) return heard.said;
    const started = this.started();
    if (started && started.over === this.answered()) return started.said;
    const entry = this.listed();
    return entry ? { state: entry.state, commandId: entry.commandId ?? null } : null;
  });

  /**
   * Whether the agent shows without a terminal and no event will say when that changes: the desk,
   * whose state no `NamedAgentStateChanged` carries.
   */
  protected readonly untold = computed(
    () => this.agent() === DESK_AGENT && !this.shown()?.commandId,
  );

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

  /** What the terminal's place says while the list names no such agent: why not. */
  protected readonly readLine = computed(() => {
    if (this.agents.status() === 'error') return 'The agent could not be read.';
    if (this.agents.hasValue()) return `This project has no ${this.agent()} agent.`;
    return this.startOver() ? 'Reading the agent…' : 'Starting the agent…';
  });

  /** `<project>/<command>` of the socket on hand. */
  private socketFor: string | null = null;
  private done = false;

  constructor() {
    afterNextRender(() => this.show());
    if (!this.browser) return;
    afterNextRender(() => void this.startAgent());
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
          .map((event) => heardAgentState(event, this.projectId(), this.agent()))
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

  /**
   * Pastes the opened-context block into the agent's input, bracketed so it is not sent, its
   * control characters dropped (`bracketedPaste`): parts of it come from the URL.
   */
  protected insertContext(): void {
    const context = this.context();
    const socket = this.socket();
    if (!context || !socket || this.link() !== 'open') return;
    socket.send(bracketedPaste(openedContext(context)));
    // Back to the terminal (xterm's input), so the person types on after the paste.
    this.pane().nativeElement.querySelector('textarea')?.focus();
  }

  /** Starts the agent once, on open; the list is read once this is over, either way. */
  private async startAgent(): Promise<void> {
    const projectId = this.projectId();
    const name = this.agent();
    if (!projectId || !name || this.done) {
      this.startOver.set(true);
      return;
    }
    try {
      const answer = await this.start.run({ path: { projectId, name } });
      if (answer) {
        // An answer about another agent says nothing of this one; the list answers next.
        if (answer.name !== name) return;
        this.started.set({
          over: this.answered(),
          said: { state: answer.state, commandId: answer.commandId ?? null },
        });
      } else {
        this.startFailure.set(startRefusalLine(0, undefined));
      }
    } catch (error) {
      const refused = error instanceof QitsApiError ? error : null;
      this.startFailure.set(startRefusalLine(refused?.status ?? 0, refused?.error?.reason));
    } finally {
      this.startOver.set(true);
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
