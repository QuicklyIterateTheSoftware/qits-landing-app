import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET, WEB_SOCKET_OPEN, type WebSocketLike } from '$core/platform/web-socket';
import { SelectedProject } from '$core/projects/selected-project';
import type { RepositoryEntry, WrapperView } from '$core/repositories/repositories.consumes';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';
import { ProjectRepositoriesPage } from './project-repositories.page';

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
  deliver(text: string) {
    this.onmessage?.(new MessageEvent('message', { data: text }));
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';
const LIST = `/projects/api/projects/${ID}/repositories`;
const SYNC = `/projects/api/projects/${ID}/repositories/backup-sync`;
const ORIGIN = 'https://projects.qits.example';
/** qits-projects' answers to the sync: three scheduled, and its refusal of an unknown project. */
const SYNCED = goldenMaster<{ scheduled: number }>(
  'a project with repositories in components',
  'backupSyncProject',
);
const REFUSED = goldenMaster('no project with the given id', 'backupSyncProject');

/** Every backup state; billing-daemon's last backup is AUTH_REQUIRED. */
type Answer = { entries: RepositoryEntry[]; wrapper: WrapperView };
const recorded = () =>
  goldenMaster<Answer>('a project with repositories in components', 'listProjectRepositories');

/** The recording with the wrapper given a backup remote (it has none), so it can sign in. */
function withWrapperTwin(answer: Answer): Answer {
  return {
    ...answer,
    entries: answer.entries.map((entry) =>
      entry.repository?.id === answer.wrapper.repositoryId
        ? {
            ...entry,
            repository: { ...entry.repository, backupUrl: 'https://forge.example.test/w.git' },
          }
        : entry,
    ),
  };
}

/** The recording without its AUTH_REQUIRED outcome (billing-daemon reads "Never" instead). */
function withoutAuthRequired(answer: Answer): Answer {
  return {
    ...answer,
    entries: answer.entries.map((entry) =>
      entry.repository?.lastBackup?.outcome === 'AUTH_REQUIRED'
        ? { ...entry, repository: { ...entry.repository, lastBackup: null } }
        : entry,
    ),
  } as Answer;
}

describe('ProjectRepositoriesPage', () => {
  let http: HttpTestingController;
  let sockets: FakeSocket[];

  beforeEach(() => {
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({ projects: ORIGIN }),
        // The page follows the wrapper's commits (qits-1270); a stream that never delivers.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        {
          provide: SelectedProject,
          useValue: { project: signal({ id: ID }), slug: signal('p'), url: signal('') },
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

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function render(answer: Answer) {
    const fixture = TestBed.createComponent(ProjectRepositoriesPage);
    fixture.detectChanges();
    await settle();
    http.expectOne(LIST).flush(answer);
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return {
      fixture,
      element,
      alert: () => element.querySelector('[role="alert"]'),
      button,
      text: () => element.textContent?.replace(/\s+/g, ' ') ?? '',
    };
  }

  it('alerts with the sign-in when a repository’s backup is AUTH_REQUIRED', async () => {
    const { alert, button } = await render(recorded());
    expect(alert()?.textContent).toContain('refused the platform’s credentials');
    expect(alert()?.contains(button('Sign in to backup remote')!)).toBe(true);
  });

  it('offers the sign-in only in the header when no backup asks for it', async () => {
    const { alert, button } = await render(withoutAuthRequired(withWrapperTwin(recorded())));
    expect(alert()).toBeNull();
    expect(button('Sign in to backup remote')).toBeDefined();
  });

  it('offers no sign-in when no repository has a backup remote', async () => {
    const answer = recorded();
    const bare = {
      ...answer,
      entries: answer.entries.filter((entry) => !entry.repository?.backupUrl),
    };
    const { alert, button } = await render(bare);
    expect(alert()).toBeNull();
    expect(button('Sign in to backup remote')).toBeUndefined();
  });

  it('opens the sign-in terminal on the project repository’s remote-login socket', async () => {
    const answer = withWrapperTwin(recorded());
    const { fixture, button, text } = await render(answer);
    button('Sign in to backup remote')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(sockets.map((s) => s.url)).toEqual([
      `wss://projects.qits.example/projects/api/repositories/${answer.wrapper.repositoryId}/remote-login`,
    ]);
    sockets[0].open();
    sockets[0].deliver('Username for https://forge.example.test: ');
    fixture.detectChanges();
    expect(text()).toContain('Attached.');
    expect(text()).toContain('Username for https://forge.example.test:');
    expect(sockets[0].sent).toEqual([JSON.stringify({ type: 'resize', cols: 100, rows: 30 })]);
  });

  /** Opens the sign-in terminal and attaches it. */
  async function signIn(answer: Answer) {
    const rendered = await render(answer);
    rendered.button('Sign in to backup remote')!.click();
    rendered.fixture.detectChanges();
    await rendered.fixture.whenStable();
    sockets[0].open();
    return rendered;
  }

  /** The re-read and the sync the end of a session starts, answered. */
  async function answerEnd(sync: { status: number; body: object }, list = recorded()) {
    await settle();
    http.expectOne(LIST).flush(list);
    const request = http.expectOne(SYNC);
    expect(request.request.method).toBe('POST');
    request.flush(sync.body, { status: sync.status, statusText: String(sync.status) });
    await settle();
    await settle();
  }

  it('re-reads and nudges a sync when the session ends, with no timed re-read (qits-1270)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fixture, button, text } = await signIn(withWrapperTwin(recorded()));
    sockets[0].serverClose(1000);
    fixture.detectChanges();
    await answerEnd({ status: 202, body: SYNCED }, withWrapperTwin(recorded()));
    fixture.detectChanges();
    expect(text()).toContain('The sign-in has ended.');
    expect(text()).toContain(`Scheduled ${SYNCED.scheduled} backups`);
    vi.advanceTimersByTime(10_000);
    await settle();
    http.expectNone(LIST);
    // The pane stays until it is closed, so the exit note can be read; closing reads nothing more.
    button('Close')!.click();
    fixture.detectChanges();
    await settle();
    http.expectNone(LIST);
    http.expectNone(SYNC);
    expect(text()).not.toContain('The sign-in has ended.');
  });

  it('does the same when the terminal is closed mid-session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fixture, button } = await signIn(withWrapperTwin(recorded()));
    button('Close')!.click();
    fixture.detectChanges();
    expect(sockets[0].closed).toBe(true);
    await answerEnd({ status: 202, body: SYNCED });
    vi.advanceTimersByTime(10_000);
    await settle();
    http.expectNone(LIST);
  });

  it('says so quietly when the sync is refused, and reads nothing more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fixture, text } = await signIn(withWrapperTwin(recorded()));
    sockets[0].serverClose(1000);
    fixture.detectChanges();
    await answerEnd({ status: 404, body: REFUSED });
    fixture.detectChanges();
    expect(text()).toContain('Could not schedule the backups now');
    vi.advanceTimersByTime(10_000);
    await settle();
    http.expectNone(LIST);
    // The re-read moved the fallback sign-in repository; the open terminal stays on its own.
    expect(sockets).toHaveLength(1);
    expect(text()).toContain('The sign-in has ended.');
  });
});
