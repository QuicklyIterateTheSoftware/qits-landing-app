import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { remoteLoginSocketUrl } from '$core/repositories/remote-login';
import {
  EMPTY_TERMINAL_FRAMES,
  TerminalSocket,
  type TerminalLink,
} from '$core/workspaces/terminal-socket';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { TerminalScreen } from '$ui/components/terminal-screen/terminal-screen';

/** What the status line says about the socket. */
const LINK_LABELS: Readonly<Record<TerminalLink, string>> = {
  connecting: 'Attaching…',
  open: 'Attached. Click the terminal and answer git’s prompts.',
  reconnecting: 'Closed. Attaching again…',
  disconnected: 'The sign-in has ended.',
  lost: 'Closed: could not attach.',
};

/**
 * The backup remote's sign-in terminal (qits-1268), ported from qits-projects-frontend's
 * `RemoteLoginTerminal`: the interactive `git push` that fills the platform's shared credential
 * store, attached to qits-projects' `remote-login` socket for `repositoryId`
 * (`remoteLoginSocketUrl`, through `WEB_SOCKET`). The socket and the screen are the agent Terminal
 * tab's: `TerminalSocket` (a clean server close is final, any other re-attaches, and the server
 * replays the scrollback) and `ui-terminal-screen`.
 *
 * `ended` fires once, when the link is `disconnected`: git exited (the server writes an exit note,
 * then closes with 1000), the server refused in-band, or Close was pressed. It says the terminal
 * ended, not that the sign-in worked, so the page reads the backups again. Close detaches only:
 * the server lingers the session about a minute for a re-attach. `closed` asks the page to remove
 * the panel.
 *
 * In the browser only: the server renders the panel without connecting.
 */
@Component({
  selector: 'app-remote-login-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, TerminalScreen],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm" aria-label="Backup remote sign-in">
      <div class="flex items-center justify-between gap-3">
        <p
          class="m-0 flex items-center gap-3"
          [class.text-charcoal-brown-600]="link() !== 'lost'"
          [class.text-cinnabar-700]="link() === 'lost'"
          role="status"
        >
          {{ linkLabel() }}
          @if (link() === 'lost') {
            <button
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
              (click)="socket()?.rearm()"
            >
              Try to attach again
            </button>
          }
        </p>
        <ui-action-button [action]="closeAction" />
      </div>
      <ui-terminal-screen
        [frames]="frames()"
        [attached]="link() === 'open'"
        label="Backup remote sign-in terminal"
        (data)="socket()?.send($event)"
        (resized)="socket()?.resize($event.cols, $event.rows)"
      />
      <p class="m-0 text-charcoal-brown-600">
        git asks for a username and a password: use a scoped personal access token, not your account
        password. Nothing is echoed at the password prompt.
      </p>
    </section>
  `,
})
export class RemoteLoginPanel {
  private readonly origins = inject(PlatformOrigins);
  private readonly openSocket = inject(WEB_SOCKET);
  private readonly document = inject(DOCUMENT);

  /** The repository whose backup remote the push goes to. */
  readonly repositoryId = input.required<string>();
  /** The session ended (once): read the backups again, as a close is not a success. */
  readonly ended = output<void>();
  /** Close was pressed: the page removes the panel. */
  readonly closed = output<void>();

  protected readonly socket = signal<TerminalSocket | null>(null);
  protected readonly frames = computed(() => this.socket()?.frames() ?? EMPTY_TERMINAL_FRAMES);
  protected readonly link = computed<TerminalLink>(() => this.socket()?.status() ?? 'connecting');
  protected readonly linkLabel = computed(() => LINK_LABELS[this.link()]);

  protected readonly closeAction: Action = {
    label: 'Close',
    variant: 'muted',
    callback: () => {
      this.socket()?.close();
      // Said here rather than left to the effect: the page removes the panel on `closed`, before
      // the effect would see the link go to `disconnected`.
      this.report();
      this.closed.emit();
    },
  };

  /** Whether `ended` fired for the socket on hand. */
  private reported = false;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.repositoryId();
      untracked(() => this.attach(id));
    });
    effect(() => {
      if (this.socket() && this.link() === 'disconnected') untracked(() => this.report());
    });
    inject(DestroyRef).onDestroy(() => this.socket()?.close());
  }

  private report(): void {
    if (this.reported) return;
    this.reported = true;
    this.ended.emit();
  }

  private attach(repositoryId: string): void {
    this.socket()?.close();
    this.socket.set(null);
    this.reported = false;
    if (!repositoryId) return;
    const socket = new TerminalSocket(
      remoteLoginSocketUrl(this.origins.api('projects'), repositoryId),
      this.openSocket,
      this.document,
    );
    this.socket.set(socket);
    socket.connect();
  }
}
