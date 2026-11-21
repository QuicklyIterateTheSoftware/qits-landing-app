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
import { exit, outcomes, QitsExit } from '@qits/angular';
import { refreshOn } from '$core/events/refresh-on';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { SelectedProject } from '$core/projects/selected-project';
import { OPEN_AGENT } from '$core/workspaces/open-agent';
import { concerns, WORKSPACE_REFRESH_DEBOUNCE_MS } from '$core/workspaces/workspace-events';
import {
  agentTerminalSocketUrl,
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** What the status line says about the socket. */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached. Click the terminal and type: input goes straight to the agent.',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'Closed: the harness has ended.',
  lost: 'Closed: could not attach.',
};

/**
 * An agent's Terminal tab, at `/projects/<slug>/agents/<agent id>/terminal` (epic qits-1230; by the
 * agent's id since epic qits-1681): the agent's harness, live, ported from
 * qits-workspaces-frontend's Terminal tab.
 *
 * Everything is asked of the agent (epic qits-1667), never of its slot. Whether there is a harness
 * to attach to is the agent's own run state (`OPEN_AGENT`, the layout's `getAgent`, qits-2146):
 * while it is RUNNING, the screen attaches to the agent's terminal on qits-workspaces' agent proxy
 * (`agentTerminalSocketUrl`, `/workspaces/agent/<agent id>/terminal`, through `WEB_SOCKET`), which
 * the service joins to the agent's running harness command wherever the agent is placed, signed in
 * with the bearer as a subprotocol (`@qits/angular`'s `BearerWebSocket`). A socket that closes says
 * so on the status line and attaches again (`TerminalSocket`); once the attempts are spent, a
 * button tries again. A harness started again (`AgentStarted`, a restart) is a new socket. Leaving
 * the tab only detaches: the harness keeps running.
 *
 * The harness install — its sign-in and the plugins on the shared agent home — is the slot's
 * container's, not the agent's, so it is on the workspace's page, which this tab links to.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the agent (the layout's `refreshOn`, quietly), whose run state attaches or
 * detaches the screen; of them, `AgentStarted` attaches it anew (`refreshOn`, the tab's own).
 *
 * In the browser only: the server renders the tab without connecting.
 */
@Component({
  selector: 'app-agent-terminal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit, TerminalScreen],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-label="Terminal">
      @if (agent(); as agent) {
        @if (!rowId()) {
          <p class="m-0 text-fg-soft">This agent has no workspace yet, so there is no terminal.</p>
        } @else {
          @if (running()) {
            <p
              class="m-0 flex items-center gap-3"
              [class.text-fg-soft]="link() === 'open' || link() === 'connecting'"
              [class.text-danger]="link() !== 'open' && link() !== 'connecting'"
              role="status"
            >
              {{ linkLabel() }}
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
              label="Agent terminal"
              (data)="socket()?.send($event)"
              (resized)="socket()?.resize($event.cols, $event.rows)"
            />
          } @else if (agent.runState === 'STOPPED') {
            <p class="m-0 text-fg-soft">
              The agent was stopped, so its harness is not running. Restart it, or prompt it, to
              bring its terminal back.
            </p>
          } @else {
            <p class="m-0 text-fg-soft">
              The agent’s harness is not running. The service starts it again when the agent gets
              its turn.
            </p>
          }
          @if (slotLink(); as params) {
            <p class="m-0 mt-2 text-fg-soft">
              The harness sign-in and the plugins belong to the workspace’s container: they are on
              <a class="text-accent" [qitsExit]="opening.workspace" [exitParams]="params"
                >the workspace’s page</a
              >.
            </p>
          }
        }
      }
    </section>
  `,
})
export class AgentTerminalPage {
  private readonly open = inject(OPEN_AGENT);
  private readonly selected = inject(SelectedProject);
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The agent's id, the agent layout's `:agentId`. */
  private readonly agentId = this.open.agentId;

  /** The agent, as the layout read it (`OPEN_AGENT`). */
  protected readonly agent = this.open.agent;

  protected readonly rowId = computed(() => this.agent()?.workspaceRowId ?? 0);

  /** Whether the agent's harness runs, so there is a terminal to attach to. */
  protected readonly running = computed(
    () => !!this.rowId() && this.agent()?.runState === 'RUNNING',
  );

  /** The workspace's page, where the harness install is (epic qits-2000). */
  protected readonly opening = outcomes('open-terminal-workspace', {
    workspace: exit('projects/:slug/workspaces/:slotId'),
  });

  /** The workspace page's exit params; none without the slug or a slot. */
  protected readonly slotLink = computed(() => {
    const slug = this.selected.slug();
    return slug && this.rowId() ? { slug, slotId: this.rowId() } : null;
  });

  /** Bumped by every harness start: a new harness is a new socket. */
  private readonly started = signal(0);

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** `<agent id>/<start>` of the socket on hand. */
  private socketFor: string | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    effect(() => {
      const agentId = this.agentId();
      const key = this.running() ? `${agentId}/${this.started()}` : null;
      untracked(() => this.attach(agentId, key));
    });
    // A harness start is a new socket; the layout reads the agent (its run state) again itself.
    refreshOn(
      {
        names: ['AgentStarted'],
        when: (event) =>
          concerns(event, {
            agentId: this.agentId() || undefined,
            workspaceId: this.rowId() ? String(this.rowId()) : undefined,
          }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
        refresh: () => this.started.update((n) => n + 1),
      },
      destroy,
    );
    destroy.onDestroy(() => this.detach());
  }

  protected rearm(): void {
    this.socket()?.rearm();
  }

  private attach(agentId: string, key: string | null): void {
    if (key === this.socketFor) return;
    this.detach();
    if (!key || !agentId) return;
    const socket = new TerminalSocket(
      agentTerminalSocketUrl(this.origins.api('workspaces'), agentId),
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
