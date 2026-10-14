import { InjectionToken } from '@angular/core';

/**
 * The part of `WebSocket` the app uses, named so a spec can hand over a fake: a socket is opened by
 * the browser and never goes through `HttpClient`, so `HttpTestingController` has nothing to
 * intercept. One handler each is all anything here sets.
 *
 * `close()` takes no code on purpose: only the server's close code is read, and a 1000 from the
 * server (the command is gone) is something the client must not be able to fake.
 */
export interface WebSocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

/** `WebSocket.CONNECTING`, `OPEN` and `CLOSED`, without reading the global (absent on the server). */
export const WEB_SOCKET_CONNECTING = 0;
export const WEB_SOCKET_OPEN = 1;
export const WEB_SOCKET_CLOSED = 3;

/** Opens a socket at an absolute `ws://` or `wss://` URL, offering `protocols` if given. */
export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;

/**
 * How the app opens a WebSocket. Deployed, the browser's own: the session cookie rides the
 * handshake, and a WebSocket needs no CORS. Under `ng serve`, `provideDevBearer` swaps in
 * `devWebSocket`, which offers the bearer as a subprotocol (`core/auth/dev-web-socket.ts`).
 */
export const WEB_SOCKET = new InjectionToken<WebSocketFactory>('WEB_SOCKET', {
  providedIn: 'root',
  factory: () => (url, protocols) => new WebSocket(url, protocols) as WebSocketLike,
});
