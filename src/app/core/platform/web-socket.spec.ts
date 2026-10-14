import { TestBed } from '@angular/core/testing';
import { WEB_SOCKET } from './web-socket';

describe('WEB_SOCKET', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the browser's own WebSocket, with no bearer offered", () => {
    const real = vi.fn();
    vi.stubGlobal('WebSocket', real);
    TestBed.inject(WEB_SOCKET)('wss://workspaces.qits.example/x');
    expect(real).toHaveBeenCalledWith('wss://workspaces.qits.example/x', undefined);
  });
});
