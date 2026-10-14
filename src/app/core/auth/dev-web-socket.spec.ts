import { TestBed } from '@angular/core/testing';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { provideDevBearer } from './dev-bearer';
import { DevTokens } from './dev-tokens';
import { BEARER_PROTOCOL, DevWebSocket } from './dev-web-socket';

const URL = 'wss://workspaces.qits.example/workspaces/container/7/terminal/commands/c1';

/** A socket the spec drives by hand: what it was opened with, what was sent, when it closes. */
class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  closes = 0;
  constructor(
    readonly url: string,
    readonly protocols: string[] | undefined,
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closes++;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('DevWebSocket', () => {
  let opened: FakeSocket[];
  const open = (url: string, protocols?: string[]) => {
    const socket = new FakeSocket(url, protocols);
    opened.push(socket);
    return socket;
  };

  beforeEach(() => (opened = []));

  it('offers the bearer as a subprotocol, after the token is at hand', async () => {
    const socket = new DevWebSocket(URL, async () => 'A1', open);
    expect(socket.readyState).toBe(0);
    expect(opened).toEqual([]);
    await settle();
    expect(opened.map((s) => [s.url, s.protocols])).toEqual([[URL, [BEARER_PROTOCOL, 'A1']]]);
  });

  it('offers the other protocols after the bearer', async () => {
    new DevWebSocket(URL, async () => 'A1', open, ['chat.v1']);
    await settle();
    expect(opened[0].protocols).toEqual(['qits.bearer', 'A1', 'chat.v1']);
  });

  it('passes the socket through: state, handlers and send', async () => {
    const socket = new DevWebSocket(URL, async () => 'A1', open);
    const seen: string[] = [];
    socket.onopen = () => seen.push('open');
    socket.onmessage = (event) => seen.push(`message ${event.data}`);
    socket.onclose = (event) => seen.push(`close ${event.code}`);
    await settle();
    const real = opened[0];
    real.readyState = WEB_SOCKET_OPEN;
    real.onopen!(new Event('open'));
    expect(socket.readyState).toBe(WEB_SOCKET_OPEN);
    socket.send('{"type":"data","data":"ls\\r"}');
    expect(real.sent).toEqual(['{"type":"data","data":"ls\\r"}']);
    real.onmessage!(new MessageEvent('message', { data: 'out' }));
    real.onclose!(new CloseEvent('close', { code: 1011 }));
    socket.close();
    expect(seen).toEqual(['open', 'message out', 'close 1011']);
    expect(real.closes).toBe(1);
  });

  it('opens nothing when closed before the token arrives, and reports the close', async () => {
    const socket = new DevWebSocket(URL, async () => 'A1', open);
    const codes: number[] = [];
    socket.onclose = (event) => codes.push(event.code);
    socket.close();
    await settle();
    expect(opened).toEqual([]);
    expect(socket.readyState).toBe(3);
    expect(codes).toEqual([1006]);
  });

  it('fails like a refused handshake without a token', async () => {
    const socket = new DevWebSocket(URL, async () => null, open);
    const seen: string[] = [];
    socket.onerror = () => seen.push('error');
    socket.onclose = (event) => seen.push(`close ${event.code}`);
    await settle();
    expect(opened).toEqual([]);
    expect(seen).toEqual(['error', 'close 1006']);
    expect(socket.readyState).toBe(3);
  });
});

describe('provideDevBearer', () => {
  it('makes WEB_SOCKET offer the current dev access token', async () => {
    const real = vi.fn(function (this: object, url: string, protocols: string[]) {
      Object.assign(this, { url, protocols, readyState: 0 });
    });
    vi.stubGlobal('WebSocket', real);
    try {
      TestBed.configureTestingModule({
        providers: [
          provideDevBearer(),
          { provide: DevTokens, useValue: { accessToken: async () => 'A1' } },
        ],
      });
      TestBed.inject(WEB_SOCKET)(URL);
      await settle();
      expect(real).toHaveBeenCalledWith(URL, ['qits.bearer', 'A1']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
