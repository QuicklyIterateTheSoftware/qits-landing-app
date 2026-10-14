import { signal, type Signal } from '@angular/core';
import {
  WEB_SOCKET_OPEN,
  type WebSocketFactory,
  type WebSocketLike,
} from '$core/platform/web-socket';
import { containerBase } from './agent-terminal.store';

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

/** Raw PTY frames since the latest attachment. The terminal, not the socket, interprets them. */
export interface TerminalFrames {
  /** A new generation means: clear the screen, then write its chunks. */
  readonly generation: number;
  readonly chunks: readonly string[];
}

export const EMPTY_TERMINAL_FRAMES: TerminalFrames = { generation: 0, chunks: [] };

/** The wait before each reconnect. Five attempts, then the socket is `lost`. */
export const TERMINAL_BACKOFF_MS: readonly number[] = [500, 1000, 2000, 4000, 4000];

/** Whether the PTY is attached, coming back, finished (`disconnected`), or given up on (`lost`). */
export type TerminalLink = 'connecting' | 'open' | 'reconnecting' | 'disconnected' | 'lost';

/** A close code of 1000 from the server: the command is gone. Final. */
const CLEAN_CLOSE = 1000;

/**
 * The daemon's terminal socket for one command, `WS /terminal/commands/{id}`, through
 * qits-workspaces' container proxy: `wss://workspaces.<domain>/workspaces/container/<slot row
 * id>/terminal/commands/<command id>` (`ws:` when qits-workspaces' origin is `http:`).
 */
export function terminalSocketUrl(origin: string, workspaceRowId: number, commandId: string) {
  const base = containerBase(origin, workspaceRowId).replace(/^http(s?):/, 'ws$1:');
  return `${base}/terminal/commands/${encodeURIComponent(commandId)}`;
}

/**
 * One attachment to a command's PTY, ported from qits-workspaces-frontend (epic qits-1230), where
 * every rule was learned from a failure:
 *
 * - **Opening re-attaches and the daemon replays 256 KB of scrollback; closing only detaches.** The
 *   process outlives a refresh, a tab switch and this object.
 * - **A clean server close (1000) is final**: the command is gone, so the link is `disconnected`
 *   and nothing reconnects (the daemon has written its own line about it into the screen).
 * - **Any other close reconnects** after 0.5, 1, 2, 4 and 4 seconds, then the link is `lost`
 *   (`rearm()` tries again: the page's button, and the document's `visibilitychange` and the
 *   window's `online`, since a laptop's sleep outlasts the waits). Each attempt starts a new
 *   generation of frames: the replay repaints the screen, so the screen is cleared first.
 * - **One socket per command id.** A relaunch is a new command, and a new socket.
 *
 * Keystrokes are `{"type":"data","data":…}`, sizes `{"type":"resize","cols":…,"rows":…}` (sent
 * again on every open); the daemon's frames are raw text. Keystrokes while detached are dropped:
 * a terminal has no send queue.
 */
export class TerminalSocket {
  private readonly received = signal<TerminalFrames>(EMPTY_TERMINAL_FRAMES);
  private readonly link = signal<TerminalLink>('connecting');

  /** Raw frames for the terminal. */
  readonly frames: Signal<TerminalFrames> = this.received.asReadonly();

  /** Where the attachment is. */
  readonly status: Signal<TerminalLink> = this.link.asReadonly();

  private socket: WebSocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = false;
  private cols = DEFAULT_COLS;
  private rows = DEFAULT_ROWS;

  private readonly wake = () => this.rearm();

  constructor(
    private readonly url: string,
    private readonly open: WebSocketFactory,
    private readonly document: Document,
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

  /** Keystrokes, written to the PTY. Dropped while detached. */
  send(data: string): void {
    const socket = this.socket;
    if (socket && socket.readyState === WEB_SOCKET_OPEN) {
      socket.send(JSON.stringify({ type: 'data', data }));
    }
  }

  /** Tell the PTY how big it is; remembered for the next attachment. */
  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, Math.floor(cols));
    this.rows = Math.max(1, Math.floor(rows));
    const socket = this.socket;
    if (socket && socket.readyState === WEB_SOCKET_OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols: this.cols, rows: this.rows }));
    }
  }

  /** Try again now, once the reconnects are spent. */
  rearm(): void {
    if (this.stopped || this.link() !== 'lost') return;
    this.attempt = 0;
    this.attach();
  }

  private attach(): void {
    this.clearTimer();
    this.socket?.close();
    this.received.update(({ generation }) => ({ generation: generation + 1, chunks: [] }));
    this.link.set(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.open(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.link.set('open');
      socket.send(JSON.stringify({ type: 'resize', cols: this.cols, rows: this.rows }));
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.received.update((current) => ({ ...current, chunks: [...current.chunks, event.data] }));
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
    const wait = TERMINAL_BACKOFF_MS[this.attempt];
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
