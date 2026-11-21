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
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
  stay,
} from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import { isMissing } from '$core/resources/resource-family';
import { shortContainerId } from '$core/system/node-container-rows';
import { systemTerminalSocketUrl } from '$core/system/terminal-socket-url';
import type { SystemTerminal } from '$core/system/terminals.consumes';
import { CLOSE_SYSTEM_TERMINAL, SYSTEM_TERMINAL } from '$core/system/terminals.operations';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** What the status line says about the socket, worded for a shell in a container. */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached. Click the terminal and type: input goes straight to the container.',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'This terminal is no longer running.',
  lost: 'Closed: could not attach.',
};

/** The heading of a terminal: `<shell> in <container>` for an exec, `glances` for the overview's. */
export function terminalTitle(terminal: SystemTerminal | undefined): string {
  if (!terminal) return 'Terminal';
  if (terminal.kind === 'GLANCES') return 'glances';
  return `${terminal.shell ?? ''} in ${terminal.container?.name ?? ''}`;
}

/**
 * One of qits-system's terminals (qits-2356), at `/system/terminals/<id>`: an interactive shell in
 * a container of the node qits-system runs on, opened by a running row's `bash`/`sh` on a node's
 * Containers tab, which carries the node as `?node=`. It replaces qits-system-frontend's
 * `terminals/:id`, which hands off here (an entry point).
 *
 * **Load budget: 1, then the socket.** `SYSTEM_TERMINAL` (`getTerminal`), keyed on `:id`, in the
 * browser only (the server renders the page without reading or connecting). Only after it answers
 * 200 does the screen attach, keyed on the terminal's id, to qits-system's socket
 * (`systemTerminalSocketUrl`, `wss://system.<domain>/system/api/terminals/<id>`, through
 * `WEB_SOCKET`, the bearer as a subprotocol), whose wire and reconnects are `TerminalSocket`'s (a
 * close with 1000 is final: the shell has ended). Leaving the page only detaches; it never ends the
 * terminal.
 *
 * - Title: `<shell> in <container name>` (`glances` for the overview's terminal), `Terminal` while
 *   the read is open or failed. Below it, in monospace: the container's 12-character id (the full
 *   id as its title), who opened it and how long ago (the instant as its title).
 * - The back link (`leave-system-terminal`): "Back to the containers" of `?node=`'s Containers tab,
 *   else "Back to the nodes".
 * - The status line says where the socket is; once the attempts are spent, Try to attach again.
 * - Terminate (`terminate-system-terminal`), one press: `CLOSE_SYSTEM_TERMINAL`; a 204, or a 404
 *   (it had ended already), goes where the back link goes; any other failure says so and stays.
 *   Disabled while it runs, and once the socket says the terminal is no longer running.
 *
 * States: a terminal lives in qits-system's memory only and ends a minute after its last viewer
 * detaches (`qits.system.terminals.linger`) and on every restart, so an old address is the usual
 * way to land here: a 404 is the page's empty state, a note with the back link, no socket and no
 * Terminate. A 403 names the admin role; any other failure (a 503) cannot read the terminal right
 * now, with Retry, and no socket.
 *
 * Marks (qits-2141): the header block is the terminal's entity by its `id`, each value its field or
 * the fields it is derived from.
 *
 * Staleness (qits-1270): no `refreshOn`. No event names a terminal (qits-system publishes target
 * events only), so the row is read once; the socket is the live part.
 */
@Component({
  selector: 'app-system-terminal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsExit,
    QitsField,
    Spinner,
    TerminalScreen,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [actions]="actions()">
        <div slot="header" class="min-w-0">
          @if (terminal(); as terminal) {
            <div [qitsEntity]="terminal" entityKey="id" data-terminal>
              <h1 class="m-0 text-3xl leading-[1.1] font-bold break-all">
                @if (terminal.kind === 'GLANCES') {
                  <span [fieldOf]="terminal" [qitsField]="marks.glances">glances</span>
                } @else {
                  <span [fieldOf]="terminal" qitsField="shell">{{ terminal.shell }}</span> in
                  <span [fieldOf]="terminal" qitsField="container.name">{{
                    terminal.container?.name
                  }}</span>
                }
              </h1>
              <p class="m-0 mt-1 font-mono text-xs text-fg-muted" data-lede>
                @if (terminal.container?.id; as containerId) {
                  <span
                    [attr.title]="containerId"
                    [fieldOf]="terminal"
                    [qitsField]="marks.containerId"
                    data-container-id
                    >{{ shortId(containerId) }}</span
                  >
                  ·
                }
                <span [fieldOf]="terminal" qitsField="createdBy" data-created-by
                  >opened by {{ terminal.createdBy }}</span
                >
                ·
                <span
                  [attr.title]="instant(terminal.createdAt)"
                  [fieldOf]="terminal"
                  [qitsField]="marks.createdAt"
                  data-created
                  >{{ ago(terminal.createdAt) }}</span
                >
              </p>
            </div>
          } @else {
            <h1 class="m-0 text-3xl leading-[1.1] font-bold">Terminal</h1>
          }
        </div>

        <p class="mt-0 mb-3 text-sm">
          @if (node(); as node) {
            <a
              class="font-semibold text-accent no-underline hover:underline"
              [qitsExit]="leaving.containers"
              [exitParams]="{ id: node }"
              [exitCurrent]="null"
              data-back
              ><span aria-hidden="true">← </span>Back to the containers</a
            >
          } @else {
            <a
              class="font-semibold text-accent no-underline hover:underline"
              [qitsExit]="leaving.nodes"
              [exitCurrent]="null"
              data-back
              ><span aria-hidden="true">← </span>Back to the nodes</a
            >
          }
        </p>

        @if (endFailed()) {
          <p
            role="alert"
            class="mt-0 mb-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            data-end-failed
          >
            The terminal could not be ended right now.
          </p>
        }

        @if (gone()) {
          <p
            role="status"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
            data-gone
          >
            This terminal is no longer running. A terminal ends a minute after its last viewer
            leaves, and when qits-system restarts.
          </p>
        } @else if (refusal()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Opening a terminal needs an admin role.
          </p>
        } @else {
          <ui-load-failure
            message="The terminal cannot be read right now."
            [class.hidden]="state() !== 'error'"
            (retry)="read.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
            @if (terminal(); as terminal) {
              <section
                class="flex flex-col gap-2 text-sm"
                aria-label="Terminal"
                [qitsEntity]="terminal"
                entityKey="id"
              >
                <p
                  class="m-0 flex items-center gap-3"
                  [class.text-fg-soft]="link() === 'open' || link() === 'connecting'"
                  [class.text-danger]="link() !== 'open' && link() !== 'connecting'"
                  role="status"
                  data-link
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
                  [label]="title()"
                  [fieldOf]="terminal"
                  [qitsField]="marks.title"
                  (data)="socket()?.send($event)"
                  (resized)="socket()?.resize($event.cols, $event.rows)"
                />
              </section>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SystemTerminalPage {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The back link: the containers tab the terminal was opened from, else the nodes list. */
  protected readonly leaving = outcomes('leave-system-terminal', {
    containers: exit('system/swarm/nodes/:id/containers'),
    nodes: exit('system/swarm/nodes'),
  });

  /** Terminate: where the back link goes once the terminal has ended, or the page kept. */
  protected readonly terminating = outcomes('terminate-system-terminal', {
    containers: exit('system/swarm/nodes/:id/containers'),
    nodes: exit('system/swarm/nodes'),
    refused: stay(),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The terminal the address names. */
  protected readonly id = computed(() => this.params().get('id') ?? '');

  /** The node whose containers the terminal was opened from (`?node=`); none without it. */
  protected readonly node = computed(() => this.query().get('node') || null);

  /** The terminal, read once (no event names one); in the browser only. */
  protected readonly read = qitsResource(SYSTEM_TERMINAL, () => {
    const id = this.id();
    return this.browser && id ? { path: { id } } : undefined;
  });

  private readonly closing = qitsMutation(CLOSE_SYSTEM_TERMINAL);

  /** The terminal as the page shows it; none while the read has none. */
  protected readonly terminal = computed((): SystemTerminal | undefined =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  protected readonly title = computed(() => terminalTitle(this.terminal()));

  /** A 404: the terminal has ended (its linger ran out, or qits-system restarted). */
  protected readonly gone = computed(() => isMissing(this.read));

  /** A 403: the viewer's roles may not open a terminal. */
  protected readonly refusal = computed(() => {
    if (this.read.status() !== 'error') return false;
    const error = this.read.error();
    return error instanceof QitsApiError && error.status === 403;
  });

  protected readonly state = computed((): LoadState => loadState(this.read));

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  /** Terminate is on its way. */
  private readonly ending = signal(false);

  /** Terminate failed with something other than a 404. */
  protected readonly endFailed = signal(false);

  /** Terminate, once the terminal is read; disabled while it runs and once the shell has ended. */
  protected readonly actions = computed((): readonly Action[] =>
    this.terminal()
      ? [
          {
            label: 'Terminate',
            variant: 'muted',
            disabled: this.ending() || this.link() === 'disconnected',
            outcomes: [
              this.node() ? this.terminating.containers : this.terminating.nodes,
              this.terminating.refused,
            ],
            callback: () => void this.terminate(),
          },
        ]
      : [],
  );

  protected readonly marks = MARKS;
  protected readonly shortId = shortContainerId;
  protected readonly instant = formatInstant;

  /** The id of the socket on hand. */
  private socketFor: string | null = null;

  constructor() {
    if (!this.browser) return;
    effect(() => {
      // Attached only once the terminal answered 200, and keyed on its id.
      const id = this.terminal()?.id ?? null;
      untracked(() => this.attach(id));
    });
    inject(DestroyRef).onDestroy(() => this.detach());
  }

  /** How long ago the terminal was opened. */
  protected ago(iso: string | undefined): string {
    return formatRelativeTime(iso);
  }

  protected rearm(): void {
    this.socket()?.rearm();
  }

  /** Terminate: ends the terminal, then goes where the back link goes; a 404 had ended already. */
  protected async terminate(): Promise<void> {
    const id = this.id();
    if (!id || this.ending()) return;
    this.ending.set(true);
    this.endFailed.set(false);
    const ended = await this.closing.run({ path: { id } }).then(
      () => true,
      (error: unknown) => error instanceof QitsApiError && error.status === 404,
    );
    this.ending.set(false);
    if (!ended) {
      this.terminating.refused.reach();
      this.endFailed.set(true);
      return;
    }
    this.detach();
    const node = this.node();
    if (node) {
      void this.terminating.containers.go({ id: node });
    } else {
      void this.terminating.nodes.go();
    }
  }

  private attach(id: string | null): void {
    if (id === this.socketFor) return;
    this.detach();
    if (!id) return;
    const socket = new TerminalSocket(
      systemTerminalSocketUrl(this.origins.api('system'), id),
      this.openSocket,
      this.document,
    );
    this.socketFor = id;
    this.socket.set(socket);
    socket.connect();
  }

  private detach(): void {
    this.socket()?.close();
    this.socket.set(null);
    this.socketFor = null;
  }
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  title: { derived: ['kind', 'shell', 'container.name'] },
  glances: { derived: ['kind'] },
  containerId: { derived: ['container.id'] },
  createdAt: { derived: ['createdAt'] },
} as const;
