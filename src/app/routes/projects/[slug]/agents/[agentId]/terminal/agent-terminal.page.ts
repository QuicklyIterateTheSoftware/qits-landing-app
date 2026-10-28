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
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { AgentHarnessStore } from '$core/workspaces/agent-harness.store';
import { AgentPluginsStore } from '$core/workspaces/agent-plugins.store';
import { AgentSignInStore } from '$core/workspaces/agent-sign-in.store';
import type { DomainEvent } from '$core/events/domain-events';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  terminalSocketUrl,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { PluginsSection } from '$patterns/workspaces/plugins-section/plugins-section';
import { SignInNotice } from '$patterns/workspaces/sign-in-notice/sign-in-notice';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** What the status line says about the socket. */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached. Click the terminal and type: input goes straight to the agent.',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'Closed: the command has ended.',
  lost: 'Closed: could not attach.',
};

/**
 * An agent's Terminal tab, at `/projects/<slug>/agents/<agent id>/terminal` (epic qits-1230; by
 * the agent's id since epic qits-1681): the agent's harness, live, when it runs in a terminal, ported from
 * qits-workspaces-frontend's Terminal tab.
 *
 * The agent is the layout's (`AgentsStore.agentOf`, by the URL's agent id); its harness's command comes
 * from its slot's daemon (`AgentHarnessStore`), read again after a lifecycle event about the agent
 * or its slot (a restart is a new command). The screen attaches to that command's PTY socket on
 * qits-workspaces' origin (`terminalSocketUrl`, through `WEB_SOCKET`): deployed with the session
 * cookie, under `ng serve` with the bearer as a subprotocol. A socket that closes says so on the
 * status line and attaches again (`TerminalSocket`); once the attempts are spent, a button tries
 * again. Leaving the tab only detaches: the harness keeps running.
 *
 * Above the screen, the sign-in notice (`app-sign-in-notice`): the slot's daemon reports a harness
 * nobody signed in (`AgentSignInStore`), and offers the sign-in terminal, which the screen then
 * attaches to instead, until its command ends. Below it, the plugins on the shared agent home
 * (`app-plugins-section`, `AgentPluginsStore`).
 *
 * Staleness (qits-1270): `HARNESS_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the harness (`AgentHarnessStore.load`, quietly; a new command re-attaches the
 * screen); of them, `WorkspaceStarted` (a new container, a new daemon) and `AgentStartRefused` (a
 * daemon refusing a start, often a harness nobody signed in) → the sign-in report
 * (`AgentSignInStore.loadReport`), and `WorkspaceStarted` → the plugins (`AgentPluginsStore.load`).
 * Not announced: a sign-in finished or a plugin installed from another tab, slot or the runner's
 * login command (the daemon emits nothing on qits-events for either); they show on the next visit
 * or the next of those events.
 *
 * In the browser only: the server renders the tab without reading or connecting.
 */
@Component({
  selector: 'app-agent-terminal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PluginsSection, SignInNotice, TerminalScreen],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-label="Terminal">
      @if (agent(); as agent) {
        @if (!rowId()) {
          <p class="m-0 text-charcoal-brown-600">
            This agent has no workspace yet, so there is no terminal.
          </p>
        } @else {
          <app-sign-in-notice [workspaceRowId]="rowId()" [harness]="agent.harness" />
          @if (signInCommand()) {
            <p class="m-0 text-charcoal-brown-600">
              The sign-in terminal. Complete the sign-in, then close it with its own exit.
            </p>
          }
          @if (signInCommand() || view() === 'terminal') {
            <p
              class="m-0 flex items-center gap-3"
              [class.text-charcoal-brown-600]="link() === 'open' || link() === 'connecting'"
              [class.text-cinnabar-700]="link() !== 'open' && link() !== 'connecting'"
              role="status"
            >
              {{ linkLabel() }}
              @if (link() === 'lost') {
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
                  (click)="rearm()"
                >
                  Try to attach again
                </button>
              }
            </p>
            <ui-terminal-screen
              [frames]="frames()"
              [attached]="link() === 'open'"
              [label]="signInCommand() ? 'Agent sign-in terminal' : 'Agent terminal'"
              (data)="socket()?.send($event)"
              (resized)="socket()?.resize($event.cols, $event.rows)"
            />
          } @else {
            @switch (view()) {
              @case ('loading') {
                <p class="m-0 text-charcoal-brown-600">Looking for the agent’s harness…</p>
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
                <p class="m-0 text-charcoal-brown-600">
                  This agent runs as a chat, so it has no terminal.
                </p>
              }
              @case ('none') {
                <p class="m-0 text-charcoal-brown-600">
                  The agent’s harness is not running. The service starts it again when the agent
                  gets its turn.
                </p>
              }
            }
          }
          <app-plugins-section class="mt-4" [workspaceRowId]="rowId()" />
        }
      }
    </section>
  `,
})
export class AgentTerminalPage {
  private readonly agents = inject(AgentsStore);
  private readonly harnesses = inject(AgentHarnessStore);
  private readonly signIn = inject(AgentSignInStore);
  private readonly plugins = inject(AgentPluginsStore);
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

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

  private readonly harness = computed(() =>
    this.rowId() ? this.harnesses.harnessOf(this.rowId(), this.agentId()) : undefined,
  );

  /** What the tab shows: a read in flight or failed, or the harness's kind. */
  protected readonly view = computed(() => {
    const harness = this.harness();
    if (!harness || harness.status === 'loading') return 'loading';
    if (harness.status === 'error') return 'error';
    if (harness.status === 'missing' || !harness.running) return 'none';
    return harness.kind;
  });

  /** The sign-in terminal somebody opened in the slot's container, while it is open. */
  protected readonly signInCommand = computed(() =>
    this.rowId() ? (this.signIn.signInOf(this.rowId())?.commandId ?? null) : null,
  );

  /**
   * The command the screen attaches to: an open sign-in terminal first (the agent cannot start
   * without it), else the harness's terminal.
   */
  private readonly commandId = computed(
    () =>
      this.signInCommand() ??
      (this.view() === 'terminal' ? (this.harness()?.commandId ?? null) : null),
  );

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /**
   * `<slot row id>/<sign-in|harness>/<command id>` of the socket on hand: a new command is a new
   * socket.
   */
  private socketFor: string | null = null;

  /** Whether the socket on hand is the sign-in terminal's. */
  private readonly onSignIn = signal(false);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    effect(() => {
      const rowId = this.rowId();
      const agentId = this.agentId();
      if (rowId && agentId) untracked(() => void this.harnesses.load(rowId, agentId));
    });
    effect(() => {
      const rowId = this.rowId();
      if (rowId) {
        untracked(() => {
          void this.signIn.loadReport(rowId);
          void this.plugins.load(rowId);
        });
      }
    });
    effect(() => {
      const rowId = this.rowId();
      const commandId = this.commandId();
      const signIn = !!this.signInCommand();
      untracked(() => this.attach(rowId, commandId, signIn));
    });
    // A sign-in terminal whose command ended (a clean close) is let go of, notice and all.
    effect(() => {
      const signIn = this.signInCommand();
      if (signIn && this.onSignIn() && this.link() === 'disconnected') {
        untracked(() => void this.signIn.finished(this.rowId()));
      }
    });
    this.agents.follow(
      destroy,
      () => ({
        agentId: this.agentId() || undefined,
        workspaceId: this.rowId() ? String(this.rowId()) : undefined,
      }),
      (events) => this.reload(events),
      HARNESS_EVENTS,
    );
    destroy.onDestroy(() => this.detach());
  }

  /** The agent layout's route, which holds `:agentId`. */
  private layoutRoute(): ActivatedRoute {
    const route = inject(ActivatedRoute);
    return route.parent ?? route;
  }

  /** Reads the harness again; after a burst that can have changed them, the sign-in and plugins. */
  protected reload(events: readonly DomainEvent[] = []): void {
    const rowId = this.rowId();
    const agentId = this.agentId();
    if (rowId && agentId) void this.harnesses.load(rowId, agentId);
    if (!rowId) return;
    const started = events.some((event) => event.name === 'WorkspaceStarted');
    if (started || events.some((event) => event.name === 'AgentStartRefused')) {
      void this.signIn.loadReport(rowId);
    }
    if (started) void this.plugins.load(rowId);
  }

  protected rearm(): void {
    this.socket()?.rearm();
  }

  private attach(rowId: number, commandId: string | null, signIn: boolean): void {
    const key =
      commandId && rowId ? `${rowId}/${signIn ? 'sign-in' : 'harness'}/${commandId}` : null;
    if (key === this.socketFor) return;
    this.detach();
    if (!key || !commandId) return;
    const socket = new TerminalSocket(
      terminalSocketUrl(this.origins.api('workspaces'), rowId, commandId),
      this.openSocket,
      this.document,
    );
    this.socketFor = key;
    this.onSignIn.set(signIn);
    this.socket.set(socket);
    socket.connect();
  }

  private detach(): void {
    this.socket()?.close();
    this.socket.set(null);
    this.onSignIn.set(false);
    this.socketFor = null;
  }
}
