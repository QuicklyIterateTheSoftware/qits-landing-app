import { signal, type Signal } from '@angular/core';
import type { WebSocketFactory } from '$core/platform/web-socket';
import { agentSocketUrl } from './agent-proxy';
import {
  commandSocketUrl,
  RECONNECT_BACKOFF_MS,
  ReconnectingSocket,
  type SocketLink,
} from './reconnecting-socket';

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
export const TERMINAL_BACKOFF_MS = RECONNECT_BACKOFF_MS;

/** Whether the PTY is attached, coming back, finished (`disconnected`), or given up on (`lost`). */
export type TerminalLink = SocketLink;

/**
 * An agent's harness terminal, through qits-workspaces' agent proxy (epic qits-1667):
 * `wss://workspaces.<domain>/workspaces/agent/<agent id>/terminal` (`ws:` when qits-workspaces'
 * origin is `http:`). The service attaches it to the agent's running harness command, wherever the
 * agent is placed.
 */
export function agentTerminalSocketUrl(origin: string, agentId: string): string {
  return agentSocketUrl(origin, agentId, 'terminal');
}

/**
 * The daemon's terminal socket for one command, `WS /terminal/commands/{id}`, through
 * qits-workspaces' container proxy: `wss://workspaces.<domain>/workspaces/container/<slot row
 * id>/terminal/commands/<command id>` (`ws:` when qits-workspaces' origin is `http:`). Only for a
 * command of the slot's own, not an agent's: the sign-in terminal.
 */
export function terminalSocketUrl(origin: string, workspaceRowId: number, commandId: string) {
  return commandSocketUrl(origin, workspaceRowId, 'terminal', commandId);
}

/**
 * One attachment to a command's PTY, ported from qits-workspaces-frontend (epic qits-1230). The
 * reconnects are `ReconnectingSocket`'s (a clean server close is final, any other reconnects after
 * 0.5, 1, 2, 4 and 4 seconds, then `lost` until `rearm()`). Each attempt starts a new generation
 * of frames: the daemon replays 256 KB of scrollback, which repaints the screen, so the screen is
 * cleared first.
 *
 * Keystrokes are `{"type":"data","data":…}`, sizes `{"type":"resize","cols":…,"rows":…}` (sent
 * again on every open); the daemon's frames are raw text. Keystrokes while detached are dropped:
 * a terminal has no send queue.
 */
export class TerminalSocket {
  private readonly received = signal<TerminalFrames>(EMPTY_TERMINAL_FRAMES);
  private readonly socket: ReconnectingSocket;
  private cols = DEFAULT_COLS;
  private rows = DEFAULT_ROWS;

  /** Raw frames for the terminal. */
  readonly frames: Signal<TerminalFrames> = this.received.asReadonly();

  /** Where the attachment is. */
  readonly status: Signal<TerminalLink>;

  constructor(url: string, open: WebSocketFactory, document: Document) {
    this.socket = new ReconnectingSocket(url, open, document, {
      attaching: () =>
        this.received.update(({ generation }) => ({ generation: generation + 1, chunks: [] })),
      opened: () => this.sendSize(),
      received: (data) =>
        this.received.update((current) => ({ ...current, chunks: [...current.chunks, data] })),
    });
    this.status = this.socket.status;
  }

  /** Attach, and keep re-attaching until {@link close} or a clean server close. */
  connect(): void {
    this.socket.connect();
  }

  /** Detach for good. The process keeps running. */
  close(): void {
    this.socket.close();
  }

  /** Keystrokes, written to the PTY. Dropped while detached. */
  send(data: string): void {
    this.socket.send(JSON.stringify({ type: 'data', data }));
  }

  /** Tell the PTY how big it is; remembered for the next attachment. */
  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, Math.floor(cols));
    this.rows = Math.max(1, Math.floor(rows));
    this.sendSize();
  }

  /** Try again now, once the reconnects are spent. */
  rearm(): void {
    this.socket.rearm();
  }

  private sendSize(): void {
    this.socket.send(JSON.stringify({ type: 'resize', cols: this.cols, rows: this.rows }));
  }
}
