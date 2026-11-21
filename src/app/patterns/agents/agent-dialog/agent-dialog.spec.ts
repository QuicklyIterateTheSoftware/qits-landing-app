import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { openedContext, type OpenedContextFields } from '$core/ui-builder/opened-context';
import { goldenMaster } from '../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { AgentDialog } from './agent-dialog';

/**
 * The agent dialog over qits-projects' recording "a project whose named agent is running": the
 * project's `ui-builder` agent IDLE on `ui-builder-command-1`, beside the desk; its start leaves it
 * running. The terminal's socket is a fake (`WEB_SOCKET`), and so is the event stream
 * (`EVENT_SOURCE`), which a case feeds `NamedAgentStateChanged` frames by hand.
 */
const STATE = 'a project whose named agent is running';
const ID = '00000000-0000-4000-8000-000000000001';
const LIST_URL = `/projects/api/projects/${ID}/agents`;
const START_URL = (name: string) => `${LIST_URL}/${name}/start`;
const TERMINAL = (command: string) =>
  `wss://projects.qits.example/projects/container/${ID}/terminal/commands/${command}`;

type Agents = { agents: { name: string; state: string; commandId: string | null }[] };

/** The recorded list, the ui-builder agent STARTING with no command yet (no recording holds it). */
function starting(): Agents {
  const body = goldenMaster<Agents>(STATE, 'listAgents');
  return {
    agents: body.agents.map((agent) =>
      agent.name === 'ui-builder' ? { ...agent, state: 'STARTING', commandId: null } : agent,
    ),
  };
}

/** What the page shows: a DATA freeze, nothing selected. */
const CONTEXT: OpenedContextFields = {
  repository: 'qits-landing-app',
  route: 'projects/:slug/repositories',
  manifestVersion: '2026.1114.15822',
  freeze: { file: 'loaded.html', kind: 'DATA', viewport: 'DESKTOP', colorScheme: 'LIGHT' },
  asked: { viewport: 'DESKTOP', colorScheme: 'LIGHT', network: null },
  selection: null,
};

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
}

/** The event stream the app opens, fed by hand. */
interface FakeStream {
  onmessage: ((message: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
}

@Component({
  imports: [AgentDialog],
  template: `@if (open()) {
    <app-agent-dialog
      [projectId]="projectId"
      [agent]="agent()"
      title="UI builder agent"
      [context]="context()"
      (closed)="closedOnce()"
    />
  }`,
})
class Host {
  readonly open = signal(true);
  readonly projectId = ID;
  readonly agent = signal('ui-builder');
  readonly context = signal<OpenedContextFields | null>(CONTEXT);
  closed = 0;
  closedOnce() {
    this.closed++;
    this.open.set(false);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('AgentDialog', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let streams: FakeStream[];

  beforeEach(() => {
    sockets = [];
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({ projects: 'https://projects.qits.example' }),
        {
          provide: EVENT_SOURCE,
          useValue: () => {
            const stream: FakeStream = {
              onmessage: null,
              onerror: null,
              readyState: 1,
              close: () => {},
            };
            streams.push(stream);
            return stream;
          },
        },
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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

  /** Lets the resources, the effects and the requests run, and draws. */
  async function settle(fixture: ComponentFixture<Host>) {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await wait(0);
    }
    fixture.detectChanges();
  }

  /** The start answered with `started` (the recording's by default), then the list with `agents`. */
  async function open(
    fixture: ComponentFixture<Host>,
    agents: object = goldenMaster(STATE, 'listAgents'),
    started: object = goldenMaster(STATE, 'startAgent'),
  ) {
    await settle(fixture);
    http.expectNone(LIST_URL);
    const start = http.expectOne(START_URL(fixture.componentInstance.agent()));
    expect(start.request.method).toBe('POST');
    start.flush(started);
    await settle(fixture);
    http.expectOne(LIST_URL).flush(agents);
    await settle(fixture);
  }

  /** The dialog open, started and its list answered with `agents`. */
  async function render(
    agents: object = goldenMaster(STATE, 'listAgents'),
    configure: (host: Host) => void = () => {},
    started?: object,
  ) {
    const fixture = TestBed.createComponent(Host);
    configure(fixture.componentInstance);
    await open(fixture, agents, started);
    const element = fixture.nativeElement as HTMLElement;
    const dialog = () => element.querySelector('dialog');
    const text = (selector: string) =>
      element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    const insert = () => element.querySelector<HTMLButtonElement>('button.insert-context');
    return { fixture, host: fixture.componentInstance, element, dialog, text, insert };
  }

  /** Sends a `NamedAgentStateChanged` of the ui-builder agent down the stream. */
  async function announce(payload: object) {
    // The stream opens after `DomainEvents`' reopen debounce.
    await wait(250);
    const stream = streams.at(-1)!;
    stream.onmessage?.({
      data: JSON.stringify({
        name: 'NamedAgentStateChanged',
        payload: JSON.stringify({ projectId: ID, agentName: 'ui-builder', ...payload }),
      }),
    });
  }

  it('opens, reads the agents and attaches to the ui-builder agent’s command', async () => {
    const { dialog, text } = await render();
    expect(dialog()?.hasAttribute('open')).toBe(true);
    expect(sockets.map((socket) => socket.url)).toEqual([TERMINAL('ui-builder-command-1')]);
    expect(text('.agent-state')).toBe('Idle');
    expect(text('.link')).toBe('Attaching…');
    sockets[0].open();
    TestBed.tick();
    expect(text('.link')).toBe('Attached');
  });

  it('closes by its button, detaching only: no further request is made', async () => {
    const { fixture, host, element } = await render();
    sockets[0].open();
    element.querySelector<HTMLButtonElement>('button.close')!.click();
    await settle(fixture);
    expect(sockets[0].closed).toBe(true);
    expect(host.closed).toBe(1);
    expect(element.querySelector('dialog')).toBeNull();
    // `afterEach`'s verify: no stop, interrupt or discard was asked.
  });

  it('closes by Escape and by a click on the backdrop', async () => {
    const first = await render();
    first.dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(first.fixture);
    expect(first.host.closed).toBe(1);
    expect(sockets[0].closed).toBe(true);

    first.host.open.set(true);
    await open(first.fixture);
    first.dialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(first.fixture);
    expect(first.host.closed).toBe(2);
    expect(sockets[1].closed).toBe(true);
  });

  it('attaches to the same command when opened again', async () => {
    const { fixture, host, element } = await render();
    element.querySelector<HTMLButtonElement>('button.close')!.click();
    await settle(fixture);
    host.open.set(true);
    await open(fixture);
    expect(sockets.map((socket) => socket.url)).toEqual([
      TERMINAL('ui-builder-command-1'),
      TERMINAL('ui-builder-command-1'),
    ]);
    expect(sockets[0].closed).toBe(true);
    expect(sockets[1].closed).toBe(false);
  });

  it('has no prompt field', async () => {
    const { element } = await render();
    expect(element.querySelector('textarea')).toBeNull();
    expect(element.querySelector('form')).toBeNull();
  });

  it('pastes the page context into the agent’s input, bracketed, without Enter', async () => {
    const { fixture, insert, text } = await render();
    expect(insert()?.disabled).toBe(true);
    sockets[0].open();
    await settle(fixture);
    expect(insert()?.disabled).toBe(false);
    expect(text('.hint')).toContain('It is not sent');

    insert()!.click();
    await settle(fixture);
    const data = sockets[0].sent
      .map((frame) => JSON.parse(frame) as { type: string; data?: string })
      .filter((frame) => frame.type === 'data');
    expect(data).toEqual([{ type: 'data', data: `\x1b[200~${openedContext(CONTEXT)}\x1b[201~` }]);
    expect(data[0].data).not.toMatch(/\r$/);
    // No request: the paste goes to the terminal only.
  });

  it('pastes the context of the moment it is pressed', async () => {
    const { fixture, host, insert } = await render();
    sockets[0].open();
    await settle(fixture);
    const later = { ...CONTEXT, route: 'projects/:slug/work' };
    host.context.set(later);
    await settle(fixture);
    insert()!.click();
    const last = JSON.parse(sockets[0].sent.at(-1)!) as { data: string };
    expect(last.data).toContain('route: projects/:slug/work');
  });

  it('cannot end the paste early from a crafted route: control characters are dropped', async () => {
    const { fixture, host, insert } = await render();
    sockets[0].open();
    host.context.set({ ...CONTEXT, route: 'x\x1b[201~rm -rf /\r' });
    await settle(fixture);
    insert()!.click();
    const last = JSON.parse(sockets[0].sent.at(-1)!) as { data: string };
    expect(last.data.match(/\x1b/g)).toHaveLength(2);
    expect(last.data).not.toContain('\r');
    expect(last.data.endsWith('\x1b[201~')).toBe(true);
    expect(last.data).toContain('route: x[201~rm -rf /\n');
  });

  it('opens the desk’s dialog without a context button, and offers to read again', async () => {
    // The recorded list with the desk still starting (no recording holds it): no event will say
    // when it is up, so its place offers Read again.
    const body = goldenMaster<Agents>(STATE, 'listAgents');
    const deskStarting = {
      agents: body.agents.map((agent) =>
        agent.name === 'desk' ? { ...agent, state: 'STARTING', commandId: null } : agent,
      ),
    };
    const { fixture, element, text } = await render(
      deskStarting,
      (host) => {
        host.agent.set('desk');
        host.context.set(null);
      },
      { name: 'desk', surface: 'project.work', state: 'STARTING', commandId: null },
    );
    expect(element.querySelector('button.insert-context')).toBeNull();
    expect(sockets).toEqual([]);
    expect(text('.agent-state')).toBe('Starting');
    element.querySelector<HTMLButtonElement>('button.read-again')!.click();
    await settle(fixture);
    http.expectOne(LIST_URL).flush(goldenMaster(STATE, 'listAgents'));
    await settle(fixture);
    expect(sockets.map((socket) => socket.url)).toEqual([TERMINAL('desk-command-1')]);
    expect(element.querySelector('button.read-again')).toBeNull();
  });

  it('shows the start’s answer until the list answers, and a refused start in the header', async () => {
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);
    http
      .expectOne(START_URL('ui-builder'))
      .flush({ reason: 'No named agent ui-builder' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.start-failure')?.textContent).toBe(
      'Could not start the agent (404): No named agent ui-builder.',
    );
    // The list is read all the same.
    http.expectOne(LIST_URL).flush(goldenMaster(STATE, 'listAgents'));
    await settle(fixture);
    expect(sockets.map((socket) => socket.url)).toEqual([TERMINAL('ui-builder-command-1')]);
  });

  it('shows a starting agent without a terminal, and attaches when an event brings its command', async () => {
    const { fixture, text } = await render(starting(), undefined, {
      ...goldenMaster<object>(STATE, 'startAgent'),
      state: 'STARTING',
      commandId: null,
    });
    expect(sockets).toEqual([]);
    expect(text('.agent-state')).toBe('Starting');
    expect(text('.no-terminal')).toBe(
      'The agent is starting: its terminal shows here once it is up.',
    );

    await announce({ state: 'IDLE', commandId: 'ui-builder-command-1' });
    await settle(fixture);
    expect(sockets.map((socket) => socket.url)).toEqual([TERMINAL('ui-builder-command-1')]);
    expect(text('.agent-state')).toBe('Idle');

    // The list is read again after the event; the same command keeps the same socket.
    await wait(1_100);
    await settle(fixture);
    http.expectOne(LIST_URL).flush(goldenMaster(STATE, 'listAgents'));
    await settle(fixture);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
  });

  it('attaches anew when the session relaunches on a new command, and follows the state', async () => {
    const { fixture, text } = await render();
    await announce({ state: 'BUSY', commandId: 'ui-builder-command-1' });
    await settle(fixture);
    expect(text('.agent-state')).toBe('Working');
    expect(sockets).toHaveLength(1);

    await announce({ state: 'IDLE', commandId: 'ui-builder-command-2' });
    await settle(fixture);
    expect(sockets.map((socket) => socket.url)).toEqual([
      TERMINAL('ui-builder-command-1'),
      TERMINAL('ui-builder-command-2'),
    ]);
    expect(sockets[0].closed).toBe(true);
    // The list read again after the burst; its answer is left open.
    await wait(1_100);
    await settle(fixture);
    http.match(LIST_URL);
  });

  it('ignores another project’s and another agent’s events', async () => {
    const { fixture, text } = await render();
    await announce({ projectId: 'another', state: 'FAILED', commandId: null });
    await announce({ agentName: 'desk', state: 'FAILED', commandId: null });
    await settle(fixture);
    expect(text('.agent-state')).toBe('Idle');
    expect(sockets).toHaveLength(1);
    // The desk's event names the project: the list is read again.
    await wait(1_100);
    await settle(fixture);
    http.match(LIST_URL);
  });
});
