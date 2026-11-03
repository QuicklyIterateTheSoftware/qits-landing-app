import { QITS_WEB_SOCKET } from '@qits/angular';

/**
 * The part of `WebSocket` the app uses, named so a spec can hand over a fake (`@qits/angular`'s):
 * a socket is opened by the browser and never goes through `HttpClient`, so
 * `HttpTestingController` has nothing to intercept.
 */
export type { WebSocketFactory, WebSocketLike } from '@qits/angular';

/** `WebSocket.CONNECTING`, `OPEN` and `CLOSED`, without reading the global (absent on the server). */
export { WEB_SOCKET_CLOSED, WEB_SOCKET_CONNECTING, WEB_SOCKET_OPEN } from '@qits/angular';

/**
 * How the app opens a WebSocket on a platform host: `@qits/angular`'s `QITS_WEB_SOCKET`, the same
 * token under the name the app uses. With the bearer sign-in (`app.config.ts`) it opens a
 * `BearerWebSocket`, which offers the bearer as a subprotocol (`qits.bearer`, then the token),
 * since a browser WebSocket cannot send a header. Only ever give it a platform URL.
 */
export const WEB_SOCKET = QITS_WEB_SOCKET;
