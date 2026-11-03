import { TestBed } from '@angular/core/testing';
import { BearerWebSocket, provideQitsBearerSignIn, QITS_WEB_SOCKET } from '@qits/angular';
import { WEB_SOCKET } from './web-socket';

describe('WEB_SOCKET', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is @qits/angular's QITS_WEB_SOCKET", () => {
    expect(WEB_SOCKET).toBe(QITS_WEB_SOCKET);
  });

  it('opens a socket that offers the bearer under the bearer sign-in', () => {
    vi.stubGlobal('WebSocket', vi.fn());
    TestBed.configureTestingModule({
      providers: [provideQitsBearerSignIn({ clientId: 'c', platformDomain: 'qits.example' })],
    });
    const socket = TestBed.inject(WEB_SOCKET)('wss://workspaces.qits.example/x');
    expect(socket).toBeInstanceOf(BearerWebSocket);
    socket.close();
  });
});
