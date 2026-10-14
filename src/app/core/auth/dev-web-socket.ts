import {
  WEB_SOCKET_CLOSED,
  WEB_SOCKET_CONNECTING,
  type WebSocketFactory,
  type WebSocketLike,
} from '$core/platform/web-socket';

/**
 * The subprotocol that marks the bearer offer. qits-edge (qits-1246) accepts it only from
 * `http://localhost[:port]` or `http://127.0.0.1[:port]`: it moves the next offered protocol, the
 * token, into `Authorization: Bearer`, strips both from what it forwards, and answers the
 * handshake with `Sec-WebSocket-Protocol: qits.bearer`.
 */
export const BEARER_PROTOCOL = 'qits.bearer';

/**
 * `ng serve` ONLY (`provideDevBearer`): a WebSocket that signs in with the bearer, since the
 * session cookie never reaches localhost and a browser WebSocket cannot send a header. It offers
 * `['qits.bearer', <access token>, ...protocols]`.
 *
 * The token is fetched first (`DevTokens.accessToken()`, which refreshes one that is about to
 * end), so the real socket opens a moment later; until then this is `CONNECTING`, and `send()`
 * is not allowed, as on a real one. A `close()` before then opens nothing and reports the close.
 * Without a token it fails as a refused handshake does: `onerror`, then `onclose` (1006). It does
 * not reconnect by itself; its user does.
 */
export class DevWebSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private socket: WebSocketLike | null = null;
  private closed = false;

  constructor(
    readonly url: string,
    token: () => Promise<string | null>,
    open: WebSocketFactory,
    readonly protocols: readonly string[] = [],
  ) {
    void this.run(token, open);
  }

  get readyState(): number {
    if (this.socket) return this.socket.readyState;
    return this.closed ? WEB_SOCKET_CLOSED : WEB_SOCKET_CONNECTING;
  }

  send(data: string): void {
    if (!this.socket) throw new Error('The socket is not open yet.');
    this.socket.send(data);
  }

  close(): void {
    if (this.socket) {
      this.socket.close();
      return;
    }
    if (this.closed) return;
    this.closed = true;
    this.onclose?.(closeEvent());
  }

  private async run(token: () => Promise<string | null>, open: WebSocketFactory): Promise<void> {
    let bearer: string | null = null;
    try {
      bearer = await token();
    } catch {
      bearer = null;
    }
    if (this.closed) return;
    if (!bearer) {
      this.closed = true;
      this.onerror?.(new Event('error'));
      this.onclose?.(closeEvent());
      return;
    }
    const socket = open(this.url, [BEARER_PROTOCOL, bearer, ...this.protocols]);
    socket.onopen = (event) => this.onopen?.(event);
    socket.onmessage = (event) => this.onmessage?.(event);
    socket.onerror = (event) => this.onerror?.(event);
    socket.onclose = (event) => this.onclose?.(event);
    this.socket = socket;
  }
}

/** What a handshake that never completed closes with: 1006, not clean. */
function closeEvent(): CloseEvent {
  return new CloseEvent('close', { code: 1006, wasClean: false });
}
