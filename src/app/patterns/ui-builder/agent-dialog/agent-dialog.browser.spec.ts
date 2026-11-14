import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import type { OpenedContextFields } from '$core/ui-builder/opened-context';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { AgentDialog } from './agent-dialog';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const STATE = 'a project whose named agent is running';

/** What the UI builder shows, as the page hands it: a DATA freeze, nothing selected. */
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
  constructor(readonly url: string) {}
  send() {}
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
}

/** The event stream the app opens, fed by hand. */
interface FakeStream {
  onmessage: ((message: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
}

/**
 * Screenshots of the UI builder's agent dialog (qits-2157) on qits-projects' "a project whose
 * named agent is running": the `ui-builder` agent IDLE on its command. The terminal's socket is a
 * fake (`WEB_SOCKET`) that opens when told and delivers a few lines of the Claude TUI, raw terminal
 * text no golden master records; the event stream (`EVENT_SOURCE`, the transport seam) is fed a
 * `NamedAgentStateChanged` by hand.
 *
 * - `agent-idle`: the agent Idle, its terminal attached and showing its output.
 * - `agent-starting`: the agent relaunching, as the event says it (STARTING, no command yet): the
 *   terminal detaches and its place says the agent is starting. The list read again after the
 *   event is left unanswered, so the dialog shows what the event said.
 * - `agent-refused`: a prompt refused with 409 and the server's reason, the text kept.
 */
describe('AgentDialog (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];
  let streams: FakeStream[];

  beforeEach(() => {
    sockets = [];
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({ projects: 'https://projects.test' }),
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

  afterEach(() => {
    // The list read again after an event (`agent-starting`): left open on purpose.
    http.match((req) => req.url.endsWith('/agents'));
    http.verify();
  });

  /** The dialog open on the recorded project, its agents answered and its terminal attached. */
  async function shown() {
    const agents = await goldenMaster(STATE, 'listAgents');
    const fixture = TestBed.createComponent(AgentDialog);
    const projectId = '00000000-0000-4000-8000-000000000001';
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.detectChanges();
    await settle();
    http.expectOne(`/projects/api/projects/${projectId}/agents`).flush(agents);
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
    }
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = page.elementLocator(element.querySelector('dialog')!);
    const run = async () => {
      for (let i = 0; i < 3; i++) {
        await settle();
        TestBed.tick();
      }
      fixture.detectChanges();
    };
    return { fixture, element, dialog, projectId, run };
  }

  /** The socket open, with a few lines of the Claude TUI on it. */
  async function attach(run: () => Promise<void>) {
    expect(sockets.map((socket) => socket.url)).toEqual([
      'wss://projects.test/projects/container/00000000-0000-4000-8000-000000000001/terminal/commands/ui-builder-command-1',
    ]);
    sockets[0].open();
    sockets[0].deliver(
      '\x1b[1m> \x1b[0mPitch a calmer header.\r\n\r\n' +
        '● Pitched one snapshot: the header without its banner.\r\n\r\n' +
        '\x1b[2m? for shortcuts\x1b[0m\r\n',
    );
    await run();
  }

  it('shows the agent idle, its terminal attached with its output', async () => {
    const { dialog, run } = await shown();
    await attach(run);
    await expect.element(dialog.getByText('Idle', { exact: true })).toBeVisible();
    await expect.element(dialog.getByRole('status').first()).toHaveTextContent('Attached');
    await expect
      .element(dialog.getByRole('group', { name: 'UI builder agent terminal' }))
      .toMatchTextContent(/Pitched one snapshot/);
    await commands.parkPointer();
    await expect.element(dialog).toMatchScreenshot('agent-idle', { kind: 'DATA' });
  });

  it('shows the agent starting, without a terminal, as its state event says', async () => {
    const { dialog, run } = await shown();
    await attach(run);
    // The stream opens after `DomainEvents`' reopen debounce.
    await new Promise((resolve) => setTimeout(resolve, 250));
    streams.at(-1)!.onmessage?.({
      data: JSON.stringify({
        name: 'NamedAgentStateChanged',
        payload: JSON.stringify({
          projectId: '00000000-0000-4000-8000-000000000001',
          agentName: 'ui-builder',
          state: 'STARTING',
          commandId: null,
        }),
      }),
    });
    await run();
    await expect.element(dialog.getByText('Starting', { exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText('The agent is starting: its terminal shows here once it is up.'))
      .toBeVisible();
    expect(sockets[0].readyState).toBe(3);
    await commands.parkPointer();
    await expect.element(dialog).toMatchScreenshot('agent-starting', { kind: 'DATA' });
  });

  it('shows a refused prompt with the server’s reason, keeping the text', async () => {
    const { dialog, run, projectId } = await shown();
    await attach(run);
    const field = dialog.getByRole('textbox', { name: 'Prompt' });
    await userEvent.fill(field, 'Pitch a calmer header.');
    await userEvent.keyboard('{Enter}');
    await run();
    // An error answer is a status and a body the spec may write (no recording holds a refusal).
    http
      .expectOne(`/projects/api/projects/${projectId}/agents/ui-builder/prompt`)
      .flush(
        { reason: 'a prompt already waits for the agent' },
        { status: 409, statusText: 'Conflict' },
      );
    await run();
    await expect
      .element(dialog.getByText('Not sent (409): a prompt already waits for the agent.'))
      .toBeVisible();
    await expect.element(field).toHaveValue('Pitch a calmer header.');
    await commands.parkPointer();
    await expect.element(dialog).toMatchScreenshot('agent-refused', { kind: 'ERROR' });
  });
});
