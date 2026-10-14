import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import {
  workspaceDaemonGoldenMaster,
  workspaceDaemonGoldenMasters,
} from '../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { AgentPluginsStore } from './agent-plugins.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const INSTALLED = 'a workspace daemon with plugins installed';
const ORIGIN = 'https://workspaces.qits.example';
const ROW = Number(
  workspaceDaemonGoldenMasters.operation(INSTALLED, 'listPlugins').params['workspaceRowId'],
);
const BASE = `${ORIGIN}/workspaces/container/${ROW}`;

/** `AgentPluginsStore` on qits-workspace-daemon's recorded states (epic qits-1230). */
describe('AgentPluginsStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentPluginsStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: ORIGIN }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentPluginsStore);
  });

  afterEach(() => http.verify());

  async function load() {
    const done = store.load(ROW);
    await settle();
    const answer = workspaceDaemonGoldenMaster(INSTALLED, 'listPlugins');
    http.expectOne(`${BASE}/agent-plugins`).flush(answer);
    await done;
    return answer;
  }

  it('reads the plugins on the shared agent home', async () => {
    const answer = await load();
    expect(store.pluginsOf(ROW)).toEqual({
      status: 'loaded',
      installed: answer.installed,
      pending: null,
      problem: null,
    });
  });

  it('installs a plugin and takes its answer as the list, without a read', async () => {
    await load();
    const done = store.install(ROW, 'pyright-lsp');
    expect(store.pluginsOf(ROW)?.pending).toBe('pyright-lsp');
    await settle();
    const request = http.expectOne(`${BASE}/agent-plugins/pyright-lsp/install`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    const answer = workspaceDaemonGoldenMaster(INSTALLED, 'installPlugin');
    request.flush(answer);
    await done;
    expect(store.pluginsOf(ROW)).toMatchObject({
      pending: null,
      problem: null,
      installed: answer.installed,
    });
  });

  it('says why an install failed, in the daemon’s words, and keeps the list', async () => {
    const answer = await load();
    const done = store.install(ROW, 'pyright-lsp');
    await settle();
    // No refused install is recorded; an error answer is only a status and its message.
    http
      .expectOne(`${BASE}/agent-plugins/pyright-lsp/install`)
      .flush({ message: 'Plugins are Claude Code’s.' }, { status: 400, statusText: 'Bad' });
    await done;
    expect(store.pluginsOf(ROW)).toMatchObject({
      installed: answer.installed,
      pending: null,
      problem: 'pyright-lsp was not installed — 400 Plugins are Claude Code’s.',
    });
  });

  it('marks a list it could not read as failed', async () => {
    const done = store.load(ROW);
    await settle();
    http.expectOne(`${BASE}/agent-plugins`).flush(null, { status: 502, statusText: 'Bad' });
    await done;
    expect(store.pluginsOf(ROW)?.status).toBe('error');
  });
});
