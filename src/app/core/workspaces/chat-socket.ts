import { signal, type Signal } from '@angular/core';
import type { WebSocketFactory } from '$core/platform/web-socket';
import { commandSocketUrl, ReconnectingSocket, type SocketLink } from './reconnecting-socket';

/** Whether the conversation is attached, coming back, finished, or given up on. */
export type ChatLink = SocketLink;

/**
 * The daemon's chat socket for one command, `WS /chat/commands/{id}`, through qits-workspaces'
 * container proxy: `wss://workspaces.<domain>/workspaces/container/<slot row id>/chat/commands/
 * <command id>` (`ws:` when qits-workspaces' origin is `http:`).
 */
export function chatSocketUrl(origin: string, workspaceRowId: number, commandId: string): string {
  return commandSocketUrl(origin, workspaceRowId, 'chat', commandId);
}

/**
 * One attachment to a chat command's conversation, ported from qits-workspaces-frontend (epic
 * qits-1230). The reconnects are `ReconnectingSocket`'s, as the terminal's are.
 *
 * **Opening replays everything, so re-attaching is the recovery.** The daemon replays the whole
 * conversation on attach (the imported transcript stitched to its 256 KB ring tail, every event
 * exactly once), so `lines` is reset on every open and rebuilt from the replay: no diffing, no
 * resume token. The old lines stay on screen while the socket is away ("stale, not wrong").
 *
 * **The wire is one JSON object per line.** A frame is no promise about line boundaries, so a
 * partial line is held back until its newline arrives.
 *
 * **A message sent while down is queued, not lost**, and provokes an immediate attach rather than
 * waiting out the delay; the queue flushes on open, in order. `{"type":"user","text":…}` is the only
 * frame the daemon acts on.
 *
 * **The user's turn is never rendered from here.** `send` writes and nothing else: the turn appears
 * when the daemon echoes it back as a `user` line, so the live view and a later replay agree.
 */
export class ChatSocket {
  private readonly received = signal<readonly string[]>([]);
  private readonly waiting = signal(0);
  private readonly socket: ReconnectingSocket;
  private readonly queue: string[] = [];
  private partial = '';

  /** Every line of the current attachment's replay-plus-live stream, in order. */
  readonly lines: Signal<readonly string[]> = this.received.asReadonly();

  /** How many messages wait for the socket to come back. */
  readonly queued: Signal<number> = this.waiting.asReadonly();

  /** Where the attachment is. `reconnecting` means stale, not wrong. */
  readonly status: Signal<ChatLink>;

  constructor(url: string, open: WebSocketFactory, document: Document) {
    this.socket = new ReconnectingSocket(url, open, document, {
      attaching: () => {
        this.partial = '';
      },
      opened: () => this.opened(),
      received: (data) => this.receive(data),
    });
    this.status = this.socket.status;
  }

  /** Attach, and keep re-attaching until {@link close} or a clean server close. */
  connect(): void {
    this.socket.connect();
  }

  /** Detach for good. The agent keeps running. */
  close(): void {
    this.socket.close();
  }

  /** Try again now, once the reconnects are spent. */
  rearm(): void {
    this.socket.rearm();
  }

  /** Send a user turn; queued (and an attach provoked) while the socket is away. */
  send(text: string): void {
    if (!text.trim()) return;
    const frame = JSON.stringify({ type: 'user', text });
    if (this.socket.send(frame)) return;
    this.queue.push(frame);
    this.waiting.set(this.queue.length);
    if (this.status() === 'lost') this.socket.rearm();
    else this.socket.attachNow();
  }

  private opened(): void {
    // The replay is about to rebuild the conversation.
    this.received.set([]);
    this.partial = '';
    const pending = this.queue.splice(0, this.queue.length);
    this.waiting.set(0);
    for (const frame of pending) this.socket.send(frame);
  }

  private receive(data: string): void {
    const parts = (this.partial + data).split('\n');
    this.partial = parts.pop() ?? '';
    const complete = parts.filter((line) => line.trim().length > 0);
    if (complete.length > 0) this.received.update((lines) => [...lines, ...complete]);
  }
}
