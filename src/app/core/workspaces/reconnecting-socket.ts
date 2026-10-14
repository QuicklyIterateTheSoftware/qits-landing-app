import { signal, type Signal } from '@angular/core';
import {
  WEB_SOCKET_OPEN,
  type WebSocketFactory,
  type WebSocketLike,
} from '$core/platform/web-socket';
import { containerBase } from './agent-harness.store';

/** The wait before each reconnect. Five attempts, then the socket is `lost`. */
export const RECONNECT_BACKOFF_MS: readonly number[] = [500, 1000, 2000, 4000, 4000];

/** Whether the socket is attached, coming back, finished (`disconnected`), or given up on (`lost`). */
export type SocketLink = 'connecting' | 'open' | 'reconnecting' | 'disconnected' | 'lost';

/** A close code of 1000 from the server: the command is gone. Final. */
const CLEAN_CLOSE = 1000;

/**
 * One of the daemon's sockets for a command (`terminal` or `chat`), through qits-workspaces'
 * container proxy: `wss://workspaces.<domain>/workspaces/container/<slot row id>/<channel>/commands/
 * <command id>` (`ws:` when qits-workspaces' origin is `http:`).
 */
export function commandSocketUrl(
  origin: string,
  workspaceRowId: number,
  channel: 'terminal' | 'chat',
  commandId: string,
): string {
  const base = containerBase(origin, workspaceRowId).replace(/^http(s?):/, 'ws$1:');
  return `${base}/${channel}/commands/${encodeURIComponent(commandId)}`;
}

/** What a socket's user does with each attachment. */
export interface SocketHandlers {
  /** A new attempt starts (before it opens). */
  readonly attaching?: () => void;
  /** The attempt opened: `send` reaches the daemon from here on. */
  readonly opened?: () => void;
  /** A frame of the open attempt. */
  readonly received: (data: string) => void;
}

/**
 * The reconnect machinery the agent's Terminal and Chat tabs share (epic qits-1230), from
 * qits-workspaces-frontend, where every rule was learned from a failure:
 *
 * - **Opening re-attaches and the daemon replays what it holds; closing only detaches.** The process
 *   outlives a refresh, a tab switch and this object.
 * - **A clean server close (1000) is final**: the command is gone, so the link is `disconnected`
 *   and nothing reconnects.
 * - **Any other close reconnects** after 0.5, 1, 2, 4 and 4 seconds, then the link is `lost`
 *   (`rearm()` tries again: a page's button, and the document's `visibilitychange` and the window's
 *   `online`, since a laptop's sleep outlasts the waits). `attachNow()` skips the wait (a chat
 *   message typed while the socket is away).
 * - **One socket per command id.** A relaunch is a new command, and a new socket.
 */
export class ReconnectingSocket {
  private readonly link = signal<SocketLink>('connecting');

  /** Where the attachment is. */
  readonly status: Signal<SocketLink> = this.link.asReadonly();

  private socket: WebSocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = false;

  private readonly wake = () => this.rearm();

  constructor(
    private readonly url: string,
    private readonly open: WebSocketFactory,
    private readonly document: Document,
    private readonly handlers: SocketHandlers,
  ) {}

  /** Attach, and keep re-attaching until {@link close} or a clean server close. */
  connect(): void {
    this.stopped = false;
    this.attempt = 0;
    this.document.addEventListener('visibilitychange', this.wake);
    this.document.defaultView?.addEventListener('online', this.wake);
    this.attach();
  }

  /** Detach for good. The process keeps running. */
  close(): void {
    this.stopped = true;
    this.clearTimer();
    this.document.removeEventListener('visibilitychange', this.wake);
    this.document.defaultView?.removeEventListener('online', this.wake);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.link.set('disconnected');
  }

  /** Writes `frame` when the socket is open; answers whether it did. */
  send(frame: string): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WEB_SOCKET_OPEN) return false;
    socket.send(frame);
    return true;
  }

  /** Try again now, once the reconnects are spent. */
  rearm(): void {
    if (this.stopped || this.link() !== 'lost') return;
    this.attempt = 0;
    this.attach();
  }

  /** Attach now instead of after the wait, unless a socket is already attaching or finished. */
  attachNow(): void {
    const link = this.link();
    if (this.stopped || this.socket || link === 'disconnected') return;
    this.attempt = 0;
    this.attach();
  }

  private attach(): void {
    this.clearTimer();
    this.socket?.close();
    this.handlers.attaching?.();
    this.link.set(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.open(this.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.link.set('open');
      this.handlers.opened?.();
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.handlers.received(event.data);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.closed(event);
    };
    // An error is always followed by a close, and the close is where the retry lives.
    socket.onerror = () => undefined;
  }

  private closed(event: CloseEvent): void {
    this.socket = null;
    if (this.stopped || event?.code === CLEAN_CLOSE) {
      this.link.set('disconnected');
      return;
    }
    const wait = RECONNECT_BACKOFF_MS[this.attempt];
    if (wait === undefined) {
      this.link.set('lost');
      return;
    }
    this.attempt += 1;
    this.link.set('reconnecting');
    this.timer = setTimeout(() => this.attach(), wait);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
