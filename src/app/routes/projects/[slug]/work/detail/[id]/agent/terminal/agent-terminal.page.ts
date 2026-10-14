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
import { SelectedWork } from '$core/work/selected-work';
import { AgentTerminalStore } from '$core/workspaces/agent-terminal.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  terminalSocketUrl,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
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
 * A work item's agent's Terminal tab, at `/projects/<slug>/work/detail/<qualified id>/agent/terminal`
 * (epic qits-1230): the agent's harness, live, when it runs in a terminal, ported from
 * qits-workspaces-frontend's Terminal tab.
 *
 * The agent is the layout's (`AgentsStore.itemOf`, by the item's id); its harness's command comes
 * from its slot's daemon (`AgentTerminalStore`), read again after a lifecycle event about the agent
 * or its slot (a restart is a new command). The screen attaches to that command's PTY socket on
 * qits-workspaces' origin (`terminalSocketUrl`, through `WEB_SOCKET`): deployed with the session
 * cookie, under `ng serve` with the bearer as a subprotocol. A socket that closes says so on the
 * status line and attaches again (`TerminalSocket`); once the attempts are spent, a button tries
 * again. Leaving the tab only detaches: the harness keeps running.
 *
 * In the browser only: the server renders the tab without reading or connecting.
 */
@Component({
  selector: 'app-agent-terminal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TerminalScreen],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-label="Terminal">
      @if (agent(); as agent) {
        @if (!rowId()) {
          <p class="m-0 text-charcoal-brown-600">
            This agent has no workspace yet, so there is no terminal.
          </p>
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
                The agent’s harness is not running. The service starts it again when the agent gets
                its turn.
              </p>
            }
            @case ('terminal') {
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
                label="Agent terminal"
                (data)="socket()?.send($event)"
                (resized)="socket()?.resize($event.cols, $event.rows)"
              />
            }
          }
        }
      }
    </section>
  `,
})
export class AgentTerminalPage {
  private readonly work = inject(SelectedWork);
  private readonly agents = inject(AgentsStore);
  private readonly harnesses = inject(AgentTerminalStore);
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The work item's qualified id, the agent layout's `:id`. */
  private readonly id = toSignal(
    this.layoutRoute().paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  private readonly workId = computed(
    () => this.work.entries().find((e) => e.qualifiedId === this.id())?.id,
  );

  protected readonly agent = computed(() => {
    const id = this.workId();
    return id ? this.agents.itemOf(id)?.agent : undefined;
  });

  protected readonly rowId = computed(() => this.agent()?.workspaceRowId ?? 0);
  private readonly agentId = computed(() => this.agent()?.agentId ?? '');

  private readonly harness = computed(() =>
    this.rowId() ? this.harnesses.harnessOf(this.rowId(), this.agentId()) : undefined,
  );

  /** What the tab shows: a read in flight or failed, or the harness's kind. */
  protected readonly view = computed(() => {
    const harness = this.harness();
    if (!harness || harness.status === 'loading') return 'loading';
    if (harness.status === 'error') return 'error';
    if (harness.status === 'missing') return 'none';
    return harness.kind;
  });

  /** The command the screen attaches to. */
  private readonly commandId = computed(() =>
    this.view() === 'terminal' ? (this.harness()?.commandId ?? null) : null,
  );

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** `<slot row id>/<command id>` of the socket on hand: a new command is a new socket. */
  private socketFor: string | null = null;

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
      const commandId = this.commandId();
      untracked(() => this.attach(rowId, commandId));
    });
    this.agents.follow(
      destroy,
      () => ({
        agentId: this.agentId() || undefined,
        workspaceId: this.rowId() ? String(this.rowId()) : undefined,
      }),
      () => this.reload(),
    );
    destroy.onDestroy(() => this.detach());
  }

  /** The agent layout's route, which holds `:id`. */
  private layoutRoute(): ActivatedRoute {
    const route = inject(ActivatedRoute);
    return route.parent ?? route;
  }

  protected reload(): void {
    const rowId = this.rowId();
    const agentId = this.agentId();
    if (rowId && agentId) void this.harnesses.load(rowId, agentId);
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
      terminalSocketUrl(this.origins.api('workspaces'), rowId, commandId),
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
