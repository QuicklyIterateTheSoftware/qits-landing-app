import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspaceDaemonClient } from '../../../../../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../../../../../api/workspace-daemon/client/client.gen';
import { EVENT_SOURCE, type EventSourceLike } from '$core/events/domain-events';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PickedContext } from '$core/workspaces/picked-context';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
  workspacesGoldenMaster,
} from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { AgentFilesPage } from './agent-files.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const FILES = 'a workspace daemon with an agent whose worktree holds files';
const IGNORED = 'a workspace daemon with an agent whose worktree has an ignored directory';
const ORIGIN = 'https://workspaces.qits.example';
const { agentId, workspaceRowId } = workspaceDaemonGoldenMasters.operation(
  FILES,
  'listFiles',
).params;
const WORKTREE = `${ORIGIN}/workspaces/container/${workspaceRowId}/agent-worktrees/${agentId}`;
const CONTENT = (path: string) => `${WORKTREE}/files/content?path=${encodeURIComponent(path)}`;
const LOGIN = 'src/main/java/app/Login.java';
const LOGIN_TEST = 'src/test/java/app/LoginTest.java';
// qits-workspaces' agent of the bug ticket, in slot 1: the same agent and slot the daemon's states
// name.
const AGENT = workspacesGoldenMaster('an agent whose workspace is starting', 'listAgents')
  .agents[0];
/** A path that names nothing: the recorded 404 (its body is only a status). */
const MISSING = workspaceDaemonGoldenMaster(IGNORED, 'readFile');

describe('AgentFilesPage', () => {
  let http: HttpTestingController;
  let streams: EventSourceLike[];
  let harness: RouterTestingHarness;
  let agent: typeof AGENT;

  function configure(platform = 'browser') {
    streams = [];
    agent = AGENT;
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        provideRouter([
          { path: 'agent/:agentId', children: [{ path: 'files', component: AgentFilesPage }] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
        {
          provide: AgentsStore,
          useValue: { agentOf: () => ({ status: 'loaded', agent }) },
        },
        {
          provide: EVENT_SOURCE,
          useValue: (): EventSourceLike => {
            const source: EventSourceLike = {
              onmessage: null,
              onerror: null,
              readyState: 1,
              close: () => undefined,
            };
            streams.push(source);
            return source;
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  const element = () => harness.routeNativeElement as HTMLElement;
  const text = () => element().textContent ?? '';
  const rendered = async () => {
    await settle();
    harness.detectChanges();
    await settle();
    harness.detectChanges();
  };
  const entry = (path: string) =>
    element().querySelector<HTMLButtonElement>(`button[data-path="${path}"]`);
  const button = (label: string) =>
    [...element().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const treePaths = () =>
    [...element().querySelectorAll('[role="tree"] button')].map((b) => b.getAttribute('data-path'));
  const query = () => new URL(TestBed.inject(Router).url, 'http://x').searchParams;

  /** Opens the tab (at `search`) and answers the tree and the detection. */
  async function open(search = '') {
    configure();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/agent/${agentId}/files${search}`);
    await settle();
    http.expectOne(`${WORKTREE}/detection`).flush(workspaceDaemonGoldenMaster(FILES, 'detect'));
    http.expectOne(`${WORKTREE}/files`).flush(workspaceDaemonGoldenMaster(FILES, 'listFiles'));
    await rendered();
  }

  /** Answers the open file's read with the recorded source file. */
  async function answerLogin() {
    http.expectOne(CONTENT(LOGIN)).flush(workspaceDaemonGoldenMaster(FILES, 'readFile'));
    await rendered();
  }

  it('reads the tree and the detection, and shows the tree with the reachable test hidden', async () => {
    await open();
    expect(streams).toHaveLength(1);
    // `src` holds main and test, and the test is one link from its source: so only main shows,
    // folded into one row.
    expect(treePaths()).toEqual([
      'libs/child',
      'node_modules',
      'src/main/java/app',
      '.gitignore',
      '.gitmodules',
      'pom.xml',
      'README.md',
    ]);
    expect(entry('node_modules')?.title).toContain('git ignores this');
    entry('src/main/java/app')!.click();
    await rendered();
    expect(treePaths()).toContain(LOGIN);
    expect(treePaths()).not.toContain(LOGIN_TEST);
    expect(text()).toContain('Select a file to view its contents.');
    expect(button('Java / Quarkus')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('opens a file through the URL, with its tests linked both ways', async () => {
    await open();
    entry('src/main/java/app')!.click();
    await rendered();
    entry(LOGIN)!.click();
    await rendered();
    expect(query().get('path')).toBe(LOGIN);
    await answerLogin();
    expect(element().querySelectorAll('[data-line]')).toHaveLength(7);
    expect(button('Code')?.getAttribute('aria-pressed')).toBe('true');
    button('LoginTest')!.click();
    await rendered();
    expect(query().get('path')).toBe(LOGIN_TEST);
    http.expectOne(CONTENT(LOGIN_TEST)).flush(MISSING, { status: 404, statusText: 'Not Found' });
    await rendered();
    expect(text()).toContain(`${LOGIN_TEST} is not in the worktree`);
    // The same strip, with the test pressed.
    expect(button('LoginTest')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a gitignored directory with one read, and again for free', async () => {
    await open();
    entry('node_modules')!.click();
    harness.detectChanges();
    expect(entry('node_modules')?.textContent).toContain('Loading…');
    await settle();
    http
      .expectOne(`${WORKTREE}/files?path=node_modules`)
      .flush(workspaceDaemonGoldenMaster(IGNORED, 'listFiles'));
    await rendered();
    expect(treePaths()).toContain('node_modules/left-pad');
    expect(treePaths()).toContain('node_modules/.package-lock.json');
    entry('node_modules')!.click();
    await rendered();
    entry('node_modules')!.click();
    await rendered();
    expect(treePaths()).toContain('node_modules/.package-lock.json');
  });

  it('opens the tree fully for a name search, and gives the reachable test back', async () => {
    await open();
    const box = element().querySelector<HTMLInputElement>('input[type="search"]')!;
    box.value = 'Login';
    box.dispatchEvent(new Event('input'));
    await rendered();
    expect(text()).toContain('Searching: the tree is open to its full depth.');
    expect(treePaths()).toContain(LOGIN);
    expect(treePaths()).toContain(LOGIN_TEST);
    expect(treePaths()).not.toContain('pom.xml');
    // One stub the search could not look inside.
    expect(text()).toContain('1 collapsed directory not searched');
  });

  it('narrows to a framework’s members, opened to where the tree forks', async () => {
    await open();
    button('Java / Quarkus')!.click();
    await rendered();
    expect(button('Java / Quarkus')?.getAttribute('aria-pressed')).toBe('true');
    // The test is still one link from its source, so `src` folds to main.
    expect(treePaths()).toEqual(['node_modules', 'src/main/java/app', 'pom.xml']);
  });

  it('applies a .gitignore, read once, scoped to where it sits', async () => {
    await open();
    button('Filters')!.click();
    await rendered();
    element().querySelector<HTMLInputElement>('[aria-label="Apply .gitignore"]')!.click();
    await rendered();
    // The recorded file read, with what a `.gitignore` at the root holds: README.md.
    const recorded = workspaceDaemonGoldenMaster(FILES, 'readFile');
    http
      .expectOne(CONTENT('.gitignore'))
      .flush({ ...recorded, path: '.gitignore', content: 'README.md\n' });
    await rendered();
    expect(treePaths()).not.toContain('README.md');
    expect(treePaths()).toContain('pom.xml');
    expect(text()).toContain('hide · README.md');
  });

  it('opens a deep link at its range, and picks a range into the prompt’s context', async () => {
    await open(`?path=${encodeURIComponent(LOGIN)}&lines=4-6`);
    await answerLogin();
    const anchored = [...element().querySelectorAll('[data-line].bg-sunflower-gold-100')];
    expect(anchored.map((li) => li.getAttribute('data-line'))).toEqual(['4', '5', '6']);
    button('Pick lines')!.click();
    await rendered();
    element().querySelector<HTMLButtonElement>('[aria-label="Pick from line 4"]')!.click();
    await rendered();
    element().querySelector<HTMLButtonElement>('[aria-label="Pick from line 5"]')!.click();
    await rendered();
    expect(TestBed.inject(PickedContext).references()).toEqual([
      {
        path: LOGIN,
        startLine: 4,
        endLine: 5,
        excerpt: '  String user(String name) {\n    return name.strip();',
      },
    ]);
    expect(button('4-5')).toBeDefined();
    // Still armed: picking several ranges out of one file is the normal case.
    expect(button('Picking: press two line numbers')).toBeDefined();
  });

  it('reads the tree, the detection and the open file again on the slot’s files hint', async () => {
    await open(`?path=${encodeURIComponent(LOGIN)}`);
    await answerLogin();
    streams[0].onmessage?.(new MessageEvent('message', { data: 'files' }));
    await settle();
    http.expectOne(`${WORKTREE}/detection`).flush(workspaceDaemonGoldenMaster(FILES, 'detect'));
    http.expectOne(`${WORKTREE}/files`).flush(workspaceDaemonGoldenMaster(FILES, 'listFiles'));
    await answerLogin();
    // Its text stayed on screen meanwhile.
    expect(element().querySelectorAll('[data-line]')).toHaveLength(7);
  });

  it('says a tree it could not read could not be read, and reads it again on request', async () => {
    configure();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/agent/${agentId}/files`);
    await settle();
    http.expectOne(`${WORKTREE}/detection`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    http.expectOne(`${WORKTREE}/files`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await rendered();
    expect(text()).toContain('Could not load the working tree.');
    button('Try again')!.click();
    await settle();
    http.expectOne(`${WORKTREE}/detection`).flush(workspaceDaemonGoldenMaster(FILES, 'detect'));
    http.expectOne(`${WORKTREE}/files`).flush(workspaceDaemonGoldenMaster(FILES, 'listFiles'));
    await rendered();
    expect(treePaths()).toContain('pom.xml');
  });

  it('says a queued agent has no worktree, and reads nothing', async () => {
    configure();
    // The recorded agent, before it got a slot.
    agent = { ...AGENT, workspaceRowId: null };
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/agent/${agentId}/files`);
    await rendered();
    expect(text()).toContain('This agent has no workspace yet');
    expect(streams).toEqual([]);
  });

  it('reads nothing on the server', async () => {
    configure('server');
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/agent/${agentId}/files?path=${encodeURIComponent(LOGIN)}`);
    await rendered();
    expect(streams).toEqual([]);
  });
});
