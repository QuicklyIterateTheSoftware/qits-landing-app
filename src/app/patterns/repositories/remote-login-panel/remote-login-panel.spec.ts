import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { TERMINAL_BACKOFF_MS } from '$core/workspaces/terminal-socket';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { RemoteLoginPanel } from './remote-login-panel';

/** A socket the spec drives by hand. */
class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  closed = false;
  readonly sent: string[] = [];
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = WEB_SOCKET_OPEN;
    this.onopen?.(new Event('open'));
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

@Component({
  imports: [RemoteLoginPanel],
  template: `@if (shown()) {
    <app-remote-login-panel
      [repositoryId]="repositoryId()"
      (ended)="ended = ended + 1"
      (closed)="closed = closed + 1; shown.set(false)"
    />
  }`,
})
class Host {
  readonly shown = signal(true);
  readonly repositoryId = signal('r1');
  ended = 0;
  closed = 0;
}

describe('RemoteLoginPanel', () => {
  let sockets: FakeSocket[];

  beforeEach(() => {
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideTestPlatformOrigins({ projects: 'https://projects.qits.example' }),
        {
          provide: WEB_SOCKET,
          useValue: (url: string) => {
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket;
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const close = () =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')!;
    return { fixture, host: fixture.componentInstance, close };
  }

  it('attaches to the repository’s remote-login socket on qits-projects’ origin', () => {
    render();
    expect(sockets.map((s) => s.url)).toEqual([
      'wss://projects.qits.example/projects/api/repositories/r1/remote-login',
    ]);
  });

  it('says ended once when the server closes cleanly, and does not reattach', () => {
    vi.useFakeTimers();
    const { fixture, host } = render();
    sockets[0].open();
    sockets[0].serverClose(1000);
    fixture.detectChanges();
    fixture.detectChanges();
    vi.advanceTimersByTime(30_000);
    expect(host.ended).toBe(1);
    expect(sockets).toHaveLength(1);
  });

  it('reattaches after a dirty close, which ends nothing', () => {
    vi.useFakeTimers();
    const { fixture, host } = render();
    sockets[0].open();
    sockets[0].serverClose(1006);
    vi.advanceTimersByTime(TERMINAL_BACKOFF_MS[0]);
    fixture.detectChanges();
    expect(sockets).toHaveLength(2);
    expect(host.ended).toBe(0);
  });

  it('Close detaches, says ended and closed once each', () => {
    const { fixture, host, close } = render();
    sockets[0].open();
    close().click();
    fixture.detectChanges();
    expect(sockets[0].closed).toBe(true);
    expect(host.ended).toBe(1);
    expect(host.closed).toBe(1);
  });
});
