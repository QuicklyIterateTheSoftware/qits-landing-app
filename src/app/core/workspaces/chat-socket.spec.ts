import { WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { agentChatSocketUrl, ChatSocket } from './chat-socket';
import { RECONNECT_BACKOFF_MS } from './reconnecting-socket';

class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  closedByClient = false;
  readonly sent: string[] = [];

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
  }

  connect(): void {
    this.readyState = WEB_SOCKET_OPEN;
    this.onopen?.(new Event('open'));
  }

  deliver(text: string): void {
    this.onmessage?.(new MessageEvent<string>('message', { data: text }));
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

/** A user turn as the daemon echoes it, and an agent line: the chat's wire, one JSON per line. */
const echo = (text: string) => JSON.stringify({ type: 'user', text });
const said = (text: string) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

/**
 * The chat attachment (ported from qits-workspaces-frontend): the replay rebuilds the conversation
 * on every open, lines are whole lines, and a message typed while the socket is away waits for it.
 */
describe('ChatSocket', () => {
  let sockets: FakeSocket[];
  let chats: ChatSocket[];
  const open = (url: string) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  const latest = () => sockets[sockets.length - 1];

  beforeEach(() => {
    sockets = [];
    chats = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    chats.forEach((chat) => chat.close());
    vi.useRealTimers();
  });

  const attach = () => {
    const chat = new ChatSocket('ws://host/chat/commands/c1', open, document);
    chats.push(chat);
    chat.connect();
    return chat;
  };

  it('collects whole lines, holding a partial one back until its newline', () => {
    const chat = attach();
    latest().connect();
    latest().deliver(`${echo('Fix the login')}\n${said('Reading')}`);
    expect(chat.lines()).toEqual([echo('Fix the login')]);
    latest().deliver('\n\n');
    expect(chat.lines()).toEqual([echo('Fix the login'), said('Reading')]);
  });

  it('rebuilds from the replay on every open, keeping the old lines while away', () => {
    const chat = attach();
    latest().connect();
    latest().deliver(`${echo('one')}\n`);
    latest().serverClose(1006);
    expect(chat.status()).toBe('reconnecting');
    expect(chat.lines()).toEqual([echo('one')]);
    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[0]);
    latest().connect();
    expect(chat.lines()).toEqual([]);
    latest().deliver(`${echo('one')}\n${echo('two')}\n`);
    expect(chat.lines()).toEqual([echo('one'), echo('two')]);
  });

  it('sends a turn as a user frame, and nothing blank', () => {
    const chat = attach();
    latest().connect();
    chat.send('   ');
    chat.send('Carry on.');
    expect(latest().sent).toEqual([echo('Carry on.')]);
  });

  it('queues a turn typed while away, attaches at once, and flushes it on open', () => {
    const chat = attach();
    latest().connect();
    latest().serverClose(1006);
    chat.send('Carry on.');
    expect(chat.queued()).toBe(1);
    // No wait: the person is right there.
    expect(sockets.length).toBe(2);
    latest().connect();
    expect(latest().sent).toEqual([echo('Carry on.')]);
    expect(chat.queued()).toBe(0);
  });

  it('treats a clean server close as final', () => {
    const chat = attach();
    latest().connect();
    latest().serverClose(1000);
    vi.advanceTimersByTime(60_000);
    expect(chat.status()).toBe('disconnected');
    expect(sockets.length).toBe(1);
  });

  it('closing detaches; it terminates nothing', () => {
    const chat = attach();
    latest().connect();
    chat.close();
    expect(latest().closedByClient).toBe(true);
    expect(latest().sent).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(1);
  });
});

describe('agentChatSocketUrl', () => {
  it('is the agent’s chat behind qits-workspaces’ agent proxy, as ws(s)', () => {
    expect(agentChatSocketUrl('https://workspaces.qits.example', 'a 1')).toBe(
      'wss://workspaces.qits.example/workspaces/agent/a%201/chat',
    );
    expect(agentChatSocketUrl('http://localhost:8080', 'a1')).toBe(
      'ws://localhost:8080/workspaces/agent/a1/chat',
    );
  });
});
