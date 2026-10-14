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
import { AgentFilesStore } from './agent-files.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const FILES = 'a workspace daemon with an agent whose worktree holds files';
const IGNORED = 'a workspace daemon with an agent whose worktree has an ignored directory';
const ORIGIN = 'https://workspaces.qits.example';

const { agentId, workspaceRowId } = workspaceDaemonGoldenMasters.operation(
  FILES,
  'listFiles',
).params;
const ROW = Number(workspaceRowId);
const WORKTREE = `${ORIGIN}/workspaces/container/${ROW}/agent-worktrees/${agentId}`;

/** `AgentFilesStore` on qits-workspace-daemon's recorded states (epic qits-1230). */
describe('AgentFilesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentFilesStore>;

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
    store = TestBed.inject(AgentFilesStore);
  });

  afterEach(() => http.verify());

  it('lists the whole tree without a path, through the container proxy', async () => {
    const done = store.list(ROW, agentId);
    await settle();
    const listing = workspaceDaemonGoldenMaster(FILES, 'listFiles');
    http.expectOne(`${WORKTREE}/files`).flush(listing);
    expect(await done).toEqual({ ok: true, value: listing });
  });

  it('lists a gitignored directory by its path', async () => {
    const done = store.list(ROW, agentId, 'node_modules');
    await settle();
    const listing = workspaceDaemonGoldenMaster(IGNORED, 'listFiles');
    http.expectOne(`${WORKTREE}/files?path=node_modules`).flush(listing);
    expect(await done).toEqual({ ok: true, value: listing });
  });

  it('reads a file, and says a path that names nothing is a 404', async () => {
    const read = store.read(ROW, agentId, 'src/main/java/app/Login.java');
    await settle();
    const file = workspaceDaemonGoldenMaster(FILES, 'readFile');
    http
      .expectOne(`${WORKTREE}/files/content?path=src%2Fmain%2Fjava%2Fapp%2FLogin.java`)
      .flush(file);
    expect(await read).toEqual({ ok: true, value: file });

    const missing = store.read(ROW, agentId, 'node_modules/missing.js');
    await settle();
    http
      .expectOne(`${WORKTREE}/files/content?path=node_modules%2Fmissing.js`)
      .flush(workspaceDaemonGoldenMaster(IGNORED, 'readFile'), {
        status: 404,
        statusText: 'Not Found',
      });
    expect(await missing).toEqual({ ok: false, status: 404 });
  });

  it('reads the detection, and a failure as its status', async () => {
    const done = store.detect(ROW, agentId);
    await settle();
    const detection = workspaceDaemonGoldenMaster(FILES, 'detect');
    http.expectOne(`${WORKTREE}/detection`).flush(detection);
    expect(await done).toEqual({ ok: true, value: detection });

    const failing = store.detect(ROW, agentId);
    await settle();
    http.expectOne(`${WORKTREE}/detection`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(await failing).toEqual({ ok: false, status: 502 });
  });
});
