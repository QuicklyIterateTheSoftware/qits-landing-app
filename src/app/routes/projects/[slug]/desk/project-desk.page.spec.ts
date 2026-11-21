import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { EMPTY } from 'rxjs';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { ProjectDeskPage } from './project-desk.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The empty note: always rendered, hidden by class while there are messages. */
const empty = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('p')).find((p) =>
    p.textContent?.includes('No desk trigger messages yet'),
  );

/**
 * A local fixture shaped exactly like qits-projects-service's committed golden master
 * `golden-masters/a-project-whose-desk-received-a-trigger-message/listDeskTriggerMessages.json`
 * (provider state "a project whose desk received a trigger message", operation
 * `listDeskTriggerMessages`), which has not reached `@qits/projects-golden-masters` yet — see
 * `desk.operations.pact.spec.ts`. Flushed here instead of read from the package, as the pact
 * spec's file comment says to.
 */
const DELIVERED_MESSAGE = {
  id: '00000000-0000-4000-8000-000000000002',
  state: 'DELIVERED',
  openedAt: '2026-01-01T00:00:00Z',
  closesAt: '2026-01-01T00:00:00Z',
  closedAt: '2026-01-01T00:00:00Z',
  acceptedAt: '2026-01-01T00:00:00Z',
  attempts: 1,
  lastStatus: 200,
  lastDetail: null,
  commandId: 'desk-command-1',
  queuePosition: null,
  message:
    'You are the delivery desk of project contract-00000001. Run `qits help guide` and follow your brief. Its guide-hash is 0000000000000000: re-read the guide only when that differs from the hash you last read. Then act on what happened below.',
  events: [
    {
      source: 'work-verified',
      itemRef: 'contract-00000001-1580',
      itemId: '00000000-0000-4000-8000-000000000003',
      label: 'Desk triggers read door',
      cause: 'tok-workspace-agent-contract',
      eventId: '00000000-0000-4000-8000-000000000004',
      occurredAt: '2026-01-01T00:00:00Z',
    },
    {
      source: 'approval-needed',
      itemRef: 'contract-service-rr-7',
      itemId: '00000000-0000-4000-8000-000000000005',
      label: 'Release qits-1580; waits on manual-review: a person approves',
      cause: 'fold 5eed5eed',
      eventId: '00000000-0000-4000-8000-000000000006',
      occurredAt: '2026-01-01T00:00:00Z',
    },
    {
      source: 'desk-mentioned',
      itemRef: 'contract-00000001-1660',
      itemId: '00000000-0000-4000-8000-000000000007',
      label: "Desk triggers; from qits-1580's agent",
      cause: 'comment 00000000',
      commentId: '00000000-0000-4000-8000-000000000008',
      eventId: '00000000-0000-4000-8000-000000000009',
      occurredAt: '2026-01-01T00:00:00Z',
    },
  ],
};

/** An OWED window: closed, not yet taken, one failed attempt and why. */
const OWED_MESSAGE = {
  id: '00000000-0000-4000-8000-000000000007',
  state: 'OWED',
  openedAt: '2026-01-02T00:00:00Z',
  closesAt: '2026-01-02T00:15:00Z',
  closedAt: '2026-01-02T00:15:00Z',
  acceptedAt: null,
  attempts: 2,
  lastStatus: 503,
  lastDetail: 'no connected daemon',
  commandId: null,
  queuePosition: null,
  message: 'You are the delivery desk of project contract-00000001.',
  events: [
    {
      source: 'work-verified',
      itemRef: 'contract-00000001-1581',
      itemId: '00000000-0000-4000-8000-000000000008',
      label: 'Another ticket',
      cause: null,
      eventId: '00000000-0000-4000-8000-000000000009',
      occurredAt: '2026-01-02T00:00:00Z',
    },
  ],
};

describe('ProjectDeskPage', () => {
  let http: HttpTestingController;
  /** The agent dialog's terminal sockets, by URL (qits-2495). */
  let sockets: string[];
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/desk', component: ProjectDeskPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        // The open issues' `refreshOn` (qits-2146): a stream that never delivers.
        { provide: QITS_DOMAIN_EVENTS, useValue: { on: () => EMPTY } },
        // The agent dialog's terminal (qits-2495): a socket that never opens.
        {
          provide: WEB_SOCKET,
          useValue: (url: string) => {
            sockets.push(url);
            return {
              onopen: null,
              onmessage: null,
              onclose: null,
              onerror: null,
              readyState: 0,
              send: () => {},
              close: () => {},
            };
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page of the recorded project; its desk-trigger list asked for and returned unanswered. */
  async function render() {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/desk`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    harness.fixture.detectChanges();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/work`).flush({ entities: [] });
    const request = http.expectOne(`/projects/api/projects/${project.id}/desk-triggers`);
    const answered = async () => {
      await settle();
      harness.fixture.detectChanges();
    };
    return { element: harness.routeNativeElement as HTMLElement, request, answered };
  }

  it('opens the desk agent’s dialog from the header’s Agent action, with no page context', async () => {
    const { element, request, answered } = await render();
    request.flush({ messages: [] });
    await answered();
    const action = [
      ...element.querySelectorAll<HTMLButtonElement>('[data-page-actions] button'),
    ].find((button) => button.textContent?.trim() === 'Agent')!;
    action.click();
    // The dialog starts the agent after its first render (`afterNextRender`): an app tick.
    const run = async () => {
      for (let i = 0; i < 3; i++) {
        TestBed.tick();
        await answered();
      }
    };
    await run();
    const agents = 'a project whose named agent is running';
    // The recorded start is the ui-builder's: the desk's dialog sets it aside for the list.
    http
      .expectOne(`/projects/api/projects/${project.id}/agents/desk/start`)
      .flush(goldenMaster(agents, 'startAgent'));
    await run();
    http
      .expectOne(`/projects/api/projects/${project.id}/agents`)
      .flush(goldenMaster(agents, 'listAgents'));
    await run();
    const dialog = element.querySelector('dialog');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Front desk agent');
    expect(dialog?.querySelector('.agent-state')?.textContent?.trim()).toBe('Idle');
    expect(dialog?.querySelector('button.insert-context')).toBeNull();
    expect(dialog?.querySelector('textarea')).toBeNull();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]).toMatch(
      new RegExp(`/projects/container/${project.id}/terminal/commands/desk-command-1$`),
    );
  });

  it('lists a message, its badge, times, and each line’s source, linked item, label and cause', async () => {
    const { element, request, answered } = await render();
    request.flush({ messages: [DELIVERED_MESSAGE] });
    await answered();
    const rows = element.querySelectorAll('ui-spinner > ul > li');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.querySelector('ui-chip')?.textContent?.trim()).toBe('delivered');
    expect(row.textContent).toContain('2026-01-01 00:00 UTC');
    const lines = row.querySelectorAll('ul li');
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain('work-verified');
    expect(lines[0].textContent).toContain('Desk triggers read door');
    expect(lines[0].textContent).toContain('tok-workspace-agent-contract');
    const workLink = lines[0].querySelector('a');
    expect(workLink?.textContent?.trim()).toBe('contract-00000001-1580');
    expect(workLink?.getAttribute('href')).toBe(
      `/projects/${project.slug}/work/detail/contract-00000001-1580`,
    ); // no comment, no fragment
    const requestLink = lines[1].querySelector('a');
    expect(requestLink?.textContent?.trim()).toBe('contract-service-rr-7');
    expect(requestLink?.getAttribute('href')).toBe(
      `/projects/${project.slug}/releases/requests/contract-service-rr-7`,
    );
    expect(lines[2].textContent).toContain('comment 00000000');
    expect(lines[2].querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/work/detail/contract-00000001-1660#comment-00000000-0000-4000-8000-000000000008`,
    );
    // Accepted: no attempts/refusal line shown.
    const attemptsLine = Array.from(row.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('attempt'),
    );
    expect(attemptsLine?.classList.contains('hidden')).toBe(true);
    // The exact message text, in a collapsible <details>/<pre>.
    const details = row.querySelector('details');
    expect(details?.classList.contains('hidden')).toBe(false);
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('pre')?.textContent).toBe(DELIVERED_MESSAGE.message);
    expect(empty(element)?.classList.contains('hidden')).toBe(true);
  });

  it('shows attempts and the last refusal while a message is not yet accepted', async () => {
    const { element, request, answered } = await render();
    request.flush({ messages: [OWED_MESSAGE] });
    await answered();
    const row = element.querySelector('ui-spinner > ul > li')!;
    expect(row.querySelector('ui-chip')?.textContent?.trim()).toBe('owed');
    const attemptsLine = Array.from(row.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('attempt'),
    );
    expect(attemptsLine?.classList.contains('hidden')).toBe(false);
    expect(attemptsLine?.textContent).toContain('2 attempts');
    expect(attemptsLine?.textContent).toContain('503');
    expect(attemptsLine?.textContent).toContain('no connected daemon');
    // No cause on this line: hidden rather than shown empty.
    const line = row.querySelector('ul li')!;
    const cause = Array.from(line.querySelectorAll('span')).find(
      (span) => span.textContent === OWED_MESSAGE.events[0].cause,
    );
    expect(cause).toBeUndefined();
  });

  it('says there are no desk trigger messages yet', async () => {
    const { element, request, answered } = await render();
    request.flush({ messages: [] });
    await answered();
    expect(element.querySelectorAll('ui-spinner > ul > li')).toHaveLength(0);
    expect(empty(element)?.classList.contains('hidden')).toBe(false);
  });

  it('says the list could not be read, and reads it again on Retry', async () => {
    const { element, request, answered } = await render();
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await answered();
    const failure = element.querySelector('ui-load-failure')!;
    expect(failure.classList.contains('hidden')).toBe(false);
    expect(failure.textContent).toContain('could not be read');
    expect(element.querySelector('ui-spinner')?.classList.contains('hidden')).toBe(true);
    failure.querySelector('button')!.click();
    await settle();
    const again = http.expectOne(`/projects/api/projects/${project.id}/desk-triggers`);
    again.flush({ messages: [DELIVERED_MESSAGE] });
    await answered();
    expect(failure.classList.contains('hidden')).toBe(true);
    expect(element.querySelectorAll('ui-spinner > ul > li')).toHaveLength(1);
  });
});
