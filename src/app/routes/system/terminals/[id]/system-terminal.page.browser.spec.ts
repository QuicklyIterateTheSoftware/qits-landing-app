import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';

const SYSTEM = 'qits-system';
const OPEN = 'an open exec terminal';

/** The terminal "an open exec terminal" records (its `terminalId`). */
const ID = '00000000-0000-4000-8000-000000000003';

/** The node "a single-node swarm" records, the one qits-system runs on. */
const NODE = 'iwbwrdui2z0n62kqcjfo1erwh';

const READ = `/system/api/terminals/${ID}`;
const SOCKET = `wss://system.qits.example.test/system/api/terminals/${ID}`;
const NOW = new Date('2026-01-01T00:04:00Z');

/** A socket the spec drives by hand. */
class FakeSocket implements WebSocketLike {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  readonly sent: string[] = [];
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = WEB_SOCKET_OPEN;
    this.onopen?.(new Event('open'));
  }
  deliver(text: string) {
    this.onmessage?.(new MessageEvent('message', { data: text }));
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

/**
 * Screenshots of one of qits-system's terminals (qits-2356), at `system/terminals/<id>`, inside the
 * shell (`openRoute`) with no project open. The terminal is qits-system's `getTerminal` of "an open
 * exec terminal" (`sh` in `dev-qits-ci.1.…`, opened by `an-operator`); a terminal that has ended
 * (404), a read still open, a 503 and a 403 are statuses only, as are Terminate's answers (its
 * 204 is "an open exec terminal"'s `closeTerminal`, which has no body).
 *
 * The socket is a fake (`WEB_SOCKET`): it opens when told and delivers a few lines of shell output,
 * raw terminal text that no golden master records. qits-system's origin is fixed
 * (`https://system.qits.example.test`), beside the page origins `provideAppRoute()` fixes, so the
 * socket's address is the deployed one's shape. The event streams never connect.
 *
 * The back link and Terminate leave for a node's Containers tab (`?node=`) or the nodes list; the
 * pages they reach are their own specs', so their reads are answered with a 404 (`leftFor`).
 */
describe('SystemTerminalPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        // The page origins `provideAppRoute()` fixes, and qits-system's for the socket.
        provideTestPlatformOrigins(
          { system: 'https://system.qits.example.test' },
          {
            idp: 'https://idp.qits.example.test',
            artifacts: 'https://registry.qits.example.test',
            'network-access': 'https://network-access.qits.example.test',
          },
        ),
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
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** The page at `url`, its read still open; wide as the page is, plus the sidebar. */
  async function open(url = `/system/terminals/${ID}?node=${NODE}`) {
    await page.viewport(1140, 900);
    const opened = await openRoute(url);
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The page with its terminal answered from "an open exec terminal". */
  async function render(url?: string) {
    const { opened, view } = await open(url);
    http.expectOne(READ).flush(await goldenMaster(OPEN, 'getTerminal', SYSTEM));
    await opened.settled();
    return { opened, view };
  }

  /** The page's status line about the socket. */
  const linkLine = (opened: OpenedRoute) =>
    page.elementLocator(opened.page.querySelector('[data-link]')!);

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's. Answers in rounds,
   * until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('shows the terminal, attached, with its output, and sends what is typed', async () => {
    const { opened, view } = await render();
    await expect
      .element(view.getByRole('heading', { level: 1 }))
      .toHaveTextContent('sh in dev-qits-ci.1.k4g0nn1ld7o272jl7fciatg6m');
    await expect
      .element(view.getByText('b248472f7a8e', { exact: true }))
      .toHaveAttribute('title', 'b248472f7a8e00bba8cd036232373baed8856d90eb77b06c53f3eb0b321fdb17');
    await expect.element(view).toMatchTextContent('opened by an-operator');
    expect(sockets.map((s) => s.url)).toEqual([SOCKET]);
    sockets[0].open();
    sockets[0].deliver(
      '\x1b[1;32mroot@b248472f7a8e\x1b[0m:/work# ls\r\n' +
        'qits-ci  config\r\n' +
        '\x1b[1;32mroot@b248472f7a8e\x1b[0m:/work# ',
    );
    await opened.settled();
    await expect.element(linkLine(opened)).toMatchTextContent('Attached.');
    await expect
      .poll(() => opened.page.querySelector('.xterm-rows')?.textContent ?? '')
      .toContain('qits-ci  config');
    // The size goes out on open.
    expect(sockets[0].sent.some((frame) => JSON.parse(frame).type === 'resize')).toBe(true);
    // The root sidebar's System stays current below the section, and Nodes on a terminal's page.
    const navigation = page.elementLocator(opened.frame).getByRole('navigation', { name: 'qits' });
    await expect
      .element(navigation.getByRole('link', { name: 'System', exact: true }))
      .toHaveAttribute('aria-current', 'true');
    await expect
      .element(navigation.getByRole('link', { name: 'Nodes', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByRole('button', { name: 'Terminate' })).toBeEnabled();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('attached', { kind: 'DATA' });
    await shootShellMenus(opened, 'attached');
    // Typing goes to the container as data frames.
    await userEvent.click(page.elementLocator(opened.page.querySelector('.xterm')!));
    await userEvent.keyboard('x');
    await expect
      .poll(() => sockets[0].sent.map((frame) => JSON.parse(frame)))
      .toContainEqual({ type: 'data', data: 'x' });
  });

  it('says a terminal that has ended is no longer running, with no socket', async () => {
    const { opened, view } = await open();
    http.expectOne(READ).flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await expect
      .element(view.getByRole('status'))
      .toHaveTextContent(
        'This terminal is no longer running. A terminal ends a minute after its last viewer leaves, and when qits-system restarts.',
      );
    await expect.element(view.getByRole('heading', { level: 1 })).toHaveTextContent('Terminal');
    await expect.element(view.getByRole('link', { name: 'Back to the containers' })).toBeVisible();
    expect(view.getByRole('button', { name: 'Terminate' }).elements()).toHaveLength(0);
    expect(sockets).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('gone', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says the terminal cannot be read, with Retry', async () => {
    const { opened, view } = await open();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(READ).flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The terminal cannot be read right now.');
    expect(sockets).toHaveLength(0);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('unavailable', { kind: 'ERROR' });
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    http.expectOne(READ).flush(await goldenMaster(OPEN, 'getTerminal', SYSTEM));
    await opened.settled();
    expect(sockets.map((s) => s.url)).toEqual([SOCKET]);
  });

  it('says opening a terminal needs an admin role on a 403', async () => {
    const { opened, view } = await open();
    http.expectOne(READ).flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('Opening a terminal needs an admin role.');
    expect(sockets).toHaveLength(0);
  });

  it('says the terminal is no longer running once the server closes it, Terminate disabled', async () => {
    const { opened, view } = await render();
    sockets[0].open();
    sockets[0].serverClose(1000);
    await opened.settled();
    await expect
      .element(linkLine(opened))
      .toMatchTextContent('This terminal is no longer running.');
    await expect.element(view.getByRole('button', { name: 'Terminate' })).toBeDisabled();
    expect(sockets).toHaveLength(1);
  });

  it('shows a socket that cannot attach as closed, and attaches again on the button', async () => {
    const { opened, view } = await render();
    // Every attempt closes before it opens; the waits are the socket's own.
    for (let attempt = 0; attempt < 6; attempt++) {
      await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(attempt + 1);
      sockets[attempt].serverClose(1006);
    }
    await opened.settled();
    await expect.element(linkLine(opened)).toMatchTextContent('Closed: could not attach.');
    const again = view.getByRole('button', { name: 'Try to attach again' });
    await expect.element(again).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('lost', { kind: 'ERROR' });
    await again.click();
    await expect.poll(() => sockets.length).toBe(7);
    expect(sockets[6].url).toBe(SOCKET);
  }, 30_000);

  it('terminate-system-terminal containers: Terminate ends it and goes back to the containers', async () => {
    const { opened, view } = await render();
    sockets[0].open();
    await opened.settled();
    await view.getByRole('button', { name: 'Terminate' }).click();
    await opened.idle();
    const close = http.expectOne((request) => request.method === 'DELETE');
    expect(close.request.url).toBe(READ);
    // "an open exec terminal"'s `closeTerminal`: a 204, no body.
    close.flush(null, { status: 204, statusText: 'No Content' });
    await leftFor(opened);
    expect(reached()).toEqual(['terminate-system-terminal:containers']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/containers`);
  });

  it('terminate-system-terminal nodes: without ?node= Terminate goes to the nodes', async () => {
    const { opened, view } = await render(`/system/terminals/${ID}`);
    await view.getByRole('button', { name: 'Terminate' }).click();
    await opened.idle();
    // A terminal that had ended already is ended all the same.
    http
      .expectOne((request) => request.method === 'DELETE')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await leftFor(opened);
    expect(reached()).toEqual(['terminate-system-terminal:nodes']);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/nodes');
  });

  it('terminate-system-terminal refused: a failed Terminate says so and stays', async () => {
    const { opened, view } = await render();
    await view.getByRole('button', { name: 'Terminate' }).click();
    await opened.idle();
    http
      .expectOne((request) => request.method === 'DELETE')
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await opened.settled();
    expect(reached()).toEqual(['terminate-system-terminal:refused']);
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('The terminal could not be ended right now.');
    expect(TestBed.inject(Router).url).toBe(`/system/terminals/${ID}?node=${NODE}`);
    await expect.element(view.getByRole('button', { name: 'Terminate' })).toBeEnabled();
  });

  it('leave-system-terminal containers: the back link opens the containers of ?node=', async () => {
    const { opened, view } = await render();
    await view.getByRole('link', { name: 'Back to the containers' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-system-terminal:containers']);
    expect(TestBed.inject(Router).url).toBe(`/system/swarm/nodes/${NODE}/containers`);
  });

  it('leave-system-terminal nodes: without ?node= the back link opens the nodes', async () => {
    const { opened, view } = await render(`/system/terminals/${ID}`);
    await view.getByRole('link', { name: 'Back to the nodes' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-system-terminal:nodes']);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/nodes');
  });
});
