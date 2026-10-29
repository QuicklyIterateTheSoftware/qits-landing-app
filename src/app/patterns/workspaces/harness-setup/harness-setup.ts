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
import type { DomainEvent } from '$core/events/domain-events';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { AgentPluginsStore } from '$core/workspaces/agent-plugins.store';
import { AgentSignInStore } from '$core/workspaces/agent-sign-in.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import { containerTerminalSocketUrl } from '$core/workspaces/container-proxy';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
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
 * A slot's harness install (epic qits-1667, moved from the agent's Terminal tab, epic qits-1230): it
 * is the container's, shared by every agent the slot hosts, so it sits on the workspace's page,
 * where the container proxy (`/workspaces/container/<slot row id>/…`) is the slot's own address.
 *
 * - The sign-in notice (`app-sign-in-notice`): the slot's daemon reports a harness nobody signed in
 *   (`AgentSignInStore`), and offers the sign-in terminal; once it is open, the screen attaches to
 *   it (`containerTerminalSocketUrl`, a command of the slot's own) until its command ends, when the
 *   report is read again.
 * - The plugins on the shared agent home (`app-plugins-section`, `AgentPluginsStore`).
 *
 * Staleness (qits-1270): `HARNESS_EVENTS` naming the slot (`workspaceId`): `WorkspaceStarted` (a new
 * container, a new daemon) and `AgentStartRefused` (a daemon refusing a start, often a harness
 * nobody signed in) → the sign-in report (`AgentSignInStore.loadReport`); `WorkspaceStarted` → the
 * plugins (`AgentPluginsStore.load`). Not announced: a sign-in finished or a plugin installed from
 * another page or slot (the daemon emits nothing on qits-events for either).
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
      <h2 id="harness-setup" class="m-0 text-base font-semibold text-charcoal-brown-900">
        Harness
      </h2>
      <app-sign-in-notice [workspaceRowId]="workspaceRowId()" [harness]="harness()" />
      @if (signInCommand()) {
        <p
          class="m-0 flex items-center gap-3"
          [class.text-charcoal-brown-600]="link() === 'open' || link() === 'connecting'"
          [class.text-cinnabar-700]="link() !== 'open' && link() !== 'connecting'"
          role="status"
        >
          The sign-in terminal. {{ linkLabel() }}
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
  private readonly signIn = inject(AgentSignInStore);
  private readonly plugins = inject(AgentPluginsStore);
  private readonly agents = inject(AgentsStore);
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The slot whose container this is. */
  readonly workspaceRowId = input.required<number>();
  /** The harness the slot's agents run, so the notice names the one that matters; any when unknown. */
  readonly harness = input<string | null | undefined>(null);

  /** The sign-in terminal somebody opened in the slot's container, while it is open. */
  protected readonly signInCommand = computed(
    () => this.signIn.signInOf(this.workspaceRowId())?.commandId ?? null,
  );

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** `<slot row id>/<command id>` of the socket on hand. */
  private socketFor: string | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    effect(() => {
      const rowId = this.workspaceRowId();
      if (rowId) {
        untracked(() => {
          void this.signIn.loadReport(rowId);
          void this.plugins.load(rowId);
        });
      }
    });
    effect(() => {
      const rowId = this.workspaceRowId();
      const commandId = this.signInCommand();
      untracked(() => this.attach(rowId, commandId));
    });
    // A sign-in terminal whose command ended (a clean close) is let go of, notice and all.
    effect(() => {
      if (this.signInCommand() && this.link() === 'disconnected') {
        untracked(() => void this.signIn.finished(this.workspaceRowId()));
      }
    });
    this.agents.follow(
      destroy,
      () => ({ workspaceId: String(this.workspaceRowId()) }),
      (events) => this.reload(events),
      HARNESS_EVENTS,
    );
    destroy.onDestroy(() => this.detach());
  }

  /** After a burst that can have changed them: the sign-in report and the plugins. */
  private reload(events: readonly DomainEvent[]): void {
    const rowId = this.workspaceRowId();
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
