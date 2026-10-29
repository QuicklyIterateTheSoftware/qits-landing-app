import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../api/workspace-daemon/client/client.gen';
import type { DomainEvent } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { AgentsStore } from '$core/workspaces/agents.store';
import { HARNESS_EVENTS } from '$core/workspaces/workspace-events';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
} from '../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { HarnessSetup } from './harness-setup';

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

const settle = () => new Promise((resolve) => setTimeout(resolve));

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const PLUGINS = 'a workspace daemon with plugins installed';
const ORIGIN = 'https://workspaces.qits.example';
const ROW = Number(
  workspaceDaemonGoldenMasters.operation(SIGNED_OUT, 'availableAgents').params['workspaceRowId'],
);
const BASE = `${ORIGIN}/workspaces/container/${ROW}`;

@Component({
  imports: [HarnessSetup],
  template: `<app-harness-setup [workspaceRowId]="row" harness="CLAUDE" />`,
})
class Host {
  readonly row = ROW;
}

/** `HarnessSetup` on qits-workspace-daemon's recorded states: the slot's harness install. */
describe('HarnessSetup', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let followed: unknown[][];
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    sockets = [];
    followed = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: AgentsStore,
          useValue: { follow: (...args: unknown[]) => followed.push(args) },
        },
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

  afterEach(() => http.verify());

  const element = () => fixture.nativeElement as HTMLElement;
  const text = () => element().textContent ?? '';
  const button = (label: string) =>
    Array.from(element().querySelectorAll('button')).find((b) => b.textContent?.includes(label))!;

  async function open(report = SIGNED_IN) {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(report, 'availableAgents'));
    http
      .expectOne(`${BASE}/agent-plugins`)
      .flush(workspaceDaemonGoldenMaster(PLUGINS, 'listPlugins'));
    await settle();
    fixture.detectChanges();
  }

  it('shows no sign-in notice while the harness is signed in, and lists the plugins', async () => {
    await open();
    expect(text()).not.toContain('Nobody has signed');
    expect(text()).toContain('Plugins');
    expect(text()).toContain('Java language server');
    expect(text()).toContain('installed, switched off');
    expect(sockets).toEqual([]);
  });

  it('says nobody signed the harness in, and attaches to the sign-in terminal it opens', async () => {
    await open(SIGNED_OUT);
    expect(text()).toContain('Nobody has signed Claude Code in');
    button('Open the sign-in terminal').click();
    await settle();
    const request = http.expectOne(`${BASE}/agents/sign-in`);
    expect(request.request.body).toEqual({ agentType: 'CLAUDE' });
    const terminal = workspaceDaemonGoldenMaster(SIGNED_OUT, 'openSignInTerminal');
    request.flush(terminal);
    await settle();
    fixture.detectChanges();
    expect(text()).toContain('The sign-in terminal.');
    expect(text()).not.toContain('Nobody has signed');
    // A command of the slot's own: reached by the slot and the command.
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://workspaces.qits.example/workspaces/container/${ROW}/terminal/commands/${terminal.command.id}`,
    ]);
    // The sign-in ends: the terminal goes and the report is read again.
    sockets[0].open();
    sockets[0].serverClose(1000);
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`${BASE}/agents/available`)
      .flush(workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents'));
    await settle();
    fixture.detectChanges();
    expect(text()).not.toContain('The sign-in terminal.');
    expect(element().querySelector('ui-terminal-screen')).toBeNull();
    expect(sockets).toHaveLength(1);
  });

  it('says why the sign-in terminal did not open', async () => {
    await open(SIGNED_OUT);
    button('Open the sign-in terminal').click();
    await settle();
    // No refused sign-in is recorded; an error answer is only a status and its message.
    http
      .expectOne(`${BASE}/agents/sign-in`)
      .flush({ message: 'Coding agents are not wired yet.' }, { status: 503, statusText: 'No' });
    await settle();
    fixture.detectChanges();
    expect(text()).toContain('The sign-in terminal did not open — 503 Coding agents are not wired');
  });

  it('installs a plugin and shows the refreshed list', async () => {
    await open();
    const install = Array.from(element().querySelectorAll('li')).find((li) =>
      li.textContent?.includes('Python language server'),
    )!;
    install.querySelector('button')!.click();
    await settle();
    http
      .expectOne(`${BASE}/agent-plugins/pyright-lsp/install`)
      .flush(workspaceDaemonGoldenMaster(PLUGINS, 'installPlugin'));
    await settle();
    fixture.detectChanges();
    const row = Array.from(element().querySelectorAll('li')).find((li) =>
      li.textContent?.includes('Python language server'),
    )!;
    expect(row.textContent).toContain('installed');
    expect(row.querySelector('button')).toBeNull();
  });

  describe('after lifecycle events (qits-1270)', () => {
    /** Runs the component's `follow` refresh with a burst of `names`. */
    async function burst(...names: string[]) {
      const [, scope, refresh, events] = followed[0] as [
        unknown,
        () => object,
        (burst: readonly DomainEvent[]) => void,
        readonly string[],
      ];
      expect(events).toEqual(HARNESS_EVENTS);
      expect(scope()).toEqual({ workspaceId: String(ROW) });
      refresh(names.map((name) => ({ name })));
      await settle();
    }

    it('reads nothing again after a harness exit', async () => {
      await open();
      await burst('AgentHarnessExited');
      http.expectNone(`${BASE}/agents/available`);
      http.expectNone(`${BASE}/agent-plugins`);
    });

    it('reads the sign-in report and the plugins again after the container started', async () => {
      await open();
      await burst('WorkspaceStarted');
      http
        .expectOne(`${BASE}/agents/available`)
        .flush(workspaceDaemonGoldenMaster(SIGNED_IN, 'availableAgents'));
      http
        .expectOne(`${BASE}/agent-plugins`)
        .flush(workspaceDaemonGoldenMaster(PLUGINS, 'listPlugins'));
    });

    it('reads the sign-in report again after a refused start', async () => {
      await open();
      await burst('AgentStartRefused');
      http
        .expectOne(`${BASE}/agents/available`)
        .flush(workspaceDaemonGoldenMaster(SIGNED_OUT, 'availableAgents'));
      http.expectNone(`${BASE}/agent-plugins`);
    });
  });
});
