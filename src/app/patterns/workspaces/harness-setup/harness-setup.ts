import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { qitsMutation, qitsResource } from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { HARNESS_REPORT, SIGN_IN_TERMINAL } from '$core/workspaces/agent-sign-in.operations';
import { containerBase, containerTerminalSocketUrl } from '$core/workspaces/container-proxy';
import type { SignedOut } from '$core/workspaces/harness-sign-in';
import { describeRefusal, runRefusal, sentence } from '$core/workspaces/refusals';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { concerns, WORKSPACE_REFRESH_DEBOUNCE_MS } from '$core/workspaces/workspace-events';
import { PluginsSection } from '$patterns/workspaces/plugins-section/plugins-section';
import { SignInNotice } from '$patterns/workspaces/sign-in-notice/sign-in-notice';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** What the status line says about the sign-in terminal's socket. */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached. Complete the sign-in, then close it with its own exit.',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'Closed: the sign-in terminal has ended.',
  lost: 'Closed: could not attach.',
};

/**
 * A slot's harness install (epic qits-1667, moved from the agent's Terminal tab, epic qits-1230):
 * it is the container's, shared by every agent the slot hosts, so it sits on the workspace's page,
 * where the container proxy (`/workspaces/container/<slot row id>/…`) is the slot's own address.
 *
 * - The sign-in notice (`app-sign-in-notice`): the slot's daemon reports a harness nobody signed in
 *   (the setup's own `qitsResource` over `HARNESS_REPORT`, qits-2146, handed to the notice), and
 *   offers the sign-in terminal (`qitsMutation(SIGN_IN_TERMINAL)`, once: a second press keeps the
 *   one that is open); once it is open, the screen attaches to it (`containerTerminalSocketUrl`, a
 *   command of the slot's own) until its command ends, when the report is read again.
 * - The plugins on the shared agent home (`app-plugins-section`, which reads them itself).
 *
 * Staleness (qits-1270): `WorkspaceStarted` (a new container, a new daemon) and `AgentStartRefused`
 * (a daemon refusing a start, often a harness nobody signed in) naming the slot (`workspaceId`) →
 * the sign-in report (the resource's `refreshOn`); `WorkspaceStarted` → the plugins (the
 * section's). Not announced: a sign-in finished or a plugin installed from another page or slot
 * (the daemon emits nothing on qits-events for either).
 *
 * In the browser only: the server renders it without reading or connecting.
 */
@Component({
  selector: 'app-harness-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PluginsSection, SignInNotice, TerminalScreen],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-labelledby="harness-setup">
      <h2 id="harness-setup" class="m-0 text-base font-semibold text-fg">Harness</h2>
      <app-sign-in-notice
        [report]="report"
        [harness]="harness()"
        [commandId]="signInCommand()"
        [opening]="opening()"
        [problem]="problem()"
        (open)="open($event)"
      />
      @if (signInCommand()) {
        <p
          class="m-0 flex items-center gap-3"
          [class.text-fg-muted]="link() === 'open' || link() === 'connecting'"
          [class.text-danger]="link() !== 'open' && link() !== 'connecting'"
          role="status"
        >
          The sign-in terminal. {{ linkLabel() }}
          @if (link() === 'lost') {
            <button
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
              (click)="rearm()"
            >
              Try to attach again
            </button>
          }
        </p>
        <ui-terminal-screen
          [frames]="frames()"
          [attached]="link() === 'open'"
          label="Agent sign-in terminal"
          (data)="socket()?.send($event)"
          (resized)="socket()?.resize($event.cols, $event.rows)"
        />
      }
      <app-plugins-section class="mt-2" [workspaceRowId]="workspaceRowId()" />
    </section>
  `,
})
export class HarnessSetup {
  private readonly origins = inject(PlatformOrigins);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly signingIn = qitsMutation(SIGN_IN_TERMINAL);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The slot whose container this is. */
  readonly workspaceRowId = input.required<number>();
  /** The harness the slot's agents run, so the notice names the one that matters; any when unknown. */
  readonly harness = input<string | null | undefined>(null);

  /** The slot daemon's base, through the container proxy; none for no slot. */
  private readonly base = computed(() => {
    const rowId = this.workspaceRowId();
    return Number.isInteger(rowId) && rowId > 0
      ? containerBase(this.origins.api('workspaces'), rowId)
      : undefined;
  });

  /**
   * The slot daemon's harness report, in the browser only; again once the container started anew
   * or a start was refused, and once a sign-in terminal ended.
   */
  protected readonly report = qitsResource(
    HARNESS_REPORT,
    () => {
      const baseUrl = this.base();
      return this.browser && baseUrl ? { baseUrl } : undefined;
    },
    {
      refreshOn: {
        names: ['WorkspaceStarted', 'AgentStartRefused'],
        when: (event) => concerns(event, { workspaceId: String(this.workspaceRowId()) }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The sign-in terminal somebody opened in the slot's container, while it is open. */
  protected readonly signInCommand = signal<string | null>(null);
  /** Whether the terminal is being opened. */
  protected readonly opening = signal(false);
  /** Why the terminal did not open. */
  protected readonly problem = signal<string | null>(null);

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** `<slot row id>/<command id>` of the socket on hand. */
  private socketFor: string | null = null;

  constructor() {
    if (!this.browser) return;
    const destroy = inject(DestroyRef);
    // Another slot: its own sign-in, none open yet.
    let shownFor = Number.NaN;
    effect(() => {
      const rowId = this.workspaceRowId();
      untracked(() => {
        if (rowId === shownFor) return;
        shownFor = rowId;
        this.signInCommand.set(null);
        this.opening.set(false);
        this.problem.set(null);
      });
    });
    effect(() => {
      const rowId = this.workspaceRowId();
      const commandId = this.signInCommand();
      untracked(() => this.attach(rowId, commandId));
    });
    // A sign-in terminal whose command ended (a clean close) is let go of, notice and all.
    effect(() => {
      if (this.signInCommand() && this.link() === 'disconnected') {
        untracked(() => this.finished());
      }
    });
    destroy.onDestroy(() => this.detach());
  }

  /** Start the sign-in terminal, once: a second press keeps the one that is open. */
  protected async open(harness: SignedOut['harness'] | undefined): Promise<void> {
    const baseUrl = this.base();
    if (!baseUrl || this.opening() || this.signInCommand()) return;
    this.opening.set(true);
    this.problem.set(null);
    try {
      const answer = await this.signingIn.run({
        baseUrl,
        body: harness ? { agentType: harness } : {},
      });
      const commandId = answer?.command?.id;
      if (!commandId) throw new Error('no command');
      this.signInCommand.set(commandId);
    } catch (error) {
      this.problem.set(
        sentence(`The sign-in terminal did not open — ${describeRefusal(runRefusal(error))}`),
      );
    } finally {
      this.opening.set(false);
    }
  }

  /** The terminal ended: let go of it, and read the report again. */
  private finished(): void {
    this.signInCommand.set(null);
    if (this.base()) this.report.reload();
  }

  protected rearm(): void {
    this.socket()?.rearm();
  }

  private attach(rowId: number, commandId: string | null): void {
    const key = commandId && rowId ? `${rowId}/${commandId}` : null;
    if (key === this.socketFor) return;
    this.detach();
    if (!key || !commandId) return;
    const socket = new TerminalSocket(
      containerTerminalSocketUrl(this.origins.api('workspaces'), rowId, commandId),
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
