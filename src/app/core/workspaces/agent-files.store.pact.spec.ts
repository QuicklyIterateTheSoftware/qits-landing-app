import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { detect, listFiles, readFile } from '../../api/workspace-daemon';
import type { InteractionSlug } from '../../interactions';
import { workspaceDaemonGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { DETECT, LIST_FILES, READ_FILE } from './agent-files.consumes';
import { containerBase } from './container-proxy';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentFilesStore`
 * reads, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside the harness's and the chat's
 * parts: the agent's Files tab.
 *
 * The store reaches the daemon through qits-workspaces' agent proxy (epic qits-1667,
 * `/workspaces/agent/{agentId}/files…`, `/detection`), which forwards each call to the daemon's own
 * address, `/workspaces/container/{workspaceRowId}/agent-worktrees/{agentId}/…`, and hands back the
 * daemon's answer unchanged. So this spec makes the daemon's calls at that address, with the store's
 * own `consumes` lists, and binds what the daemon must answer there; the store's addressing is the
 * plain spec's (`agent-files.store.spec.ts`).
 *
 * - "a workspace daemon with an agent whose worktree holds files": the whole eager tree with
 *   `node_modules` as a gitignored stub, the frameworks and the source-to-test graph (its
 *   `generation` the tree's), and one source file's text;
 * - "a workspace daemon with an agent whose worktree has an ignored directory": the stub opened
 *   (`path=node_modules`), and a path in it that names nothing (404).
 *
 * The slot's row id and the agent's id are the states' params; the path takes them as
 * provider-state expressions (`addGoldenInteraction`), the file's path is the recorded query.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspace-daemon';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const FILES = 'a workspace daemon with an agent whose worktree holds files';
const IGNORED = 'a workspace daemon with an agent whose worktree has an ignored directory';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['listFiles', 'readFile', 'detect'];

const given = (
  state: string,
  operationId: string,
  interaction: InteractionSlug,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });

/** The daemon's generated client, at the mock server. */
function clientAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspaceDaemonClient),
      provideTestPlatformOrigins({ workspaces: url }),
    ],
  });
}

/** Where the agent proxy forwards a worktree read: the daemon's own base for the slot. */
const daemonAt = (url: string, workspaceRowId: string) =>
  containerBase(url, Number(workspaceRowId));

const call = <T>(read: () => Promise<T>): Promise<T> => TestBed.runInInjectionContext(read);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-files-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspace-daemon pact: the agent’s files', () => {
  afterAll(() => {
    try {
      assertPactPart(
        join(dir, `${CONSUMER}-${PROVIDER}.json`),
        COMMITTED,
        OPERATIONS,
        'QITS_GOLDEN_UPDATE',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-agent-files: the whole eager tree, with the gitignored directory as a stub', () =>
    given(FILES, 'listFiles', 'show-agent-files', LIST_FILES).executeTest(async (server) => {
      const { workspaceRowId, agentId } = masters.operation(FILES, 'listFiles').params;
      clientAt(server.url);
      const { data } = await call(() =>
        consume(
          listFiles({ baseUrl: daemonAt(server.url, workspaceRowId), path: { agentId } }),
          LIST_FILES,
        ),
      );
      // The mock server answers each list with its first recorded element, as many times.
      expect(data?.paths.length).toBe(7);
      expect(data?.lazyDirs).toEqual([{ path: 'node_modules', childCount: 2 }]);
    }));

  it('show-agent-files: the frameworks and the tests that reach a source, for the same tree', () =>
    given(FILES, 'detect', 'show-agent-files', DETECT).executeTest(async (server) => {
      const { workspaceRowId, agentId } = masters.operation(FILES, 'detect').params;
      clientAt(server.url);
      const { data } = await call(() =>
        consume(
          detect({ baseUrl: daemonAt(server.url, workspaceRowId), path: { agentId } }),
          DETECT,
        ),
      );
      const tree = masters.body<{ generation: string }>(FILES, 'listFiles');
      expect(data?.generation).toBe(tree.generation);
      expect(data?.links[0].tests.map((test) => test.path)).toEqual([
        'src/test/java/app/LoginTest.java',
      ]);
      expect(data?.frameworks.map((f) => f.label)).toEqual(['Java / Quarkus']);
    }));

  it('open-agent-file: one source file’s text', () =>
    given(FILES, 'readFile', 'open-agent-file', READ_FILE).executeTest(async (server) => {
      const op = masters.operation(FILES, 'readFile');
      clientAt(server.url);
      const { data } = await call(() =>
        consume(
          readFile({
            baseUrl: daemonAt(server.url, op.params['workspaceRowId']),
            path: { agentId: op.params['agentId'] },
            query: { path: String(op.query?.['path']) },
          }),
          READ_FILE,
        ),
      );
      expect(data?.binary).toBe(false);
      expect(data?.content).toContain('class Login');
    }));

  it('open-agent-directory: a gitignored directory, one level deep', () =>
    given(IGNORED, 'listFiles', 'open-agent-directory', LIST_FILES).executeTest(async (server) => {
      const op = masters.operation(IGNORED, 'listFiles');
      clientAt(server.url);
      const { data } = await call(() =>
        consume(
          listFiles({
            baseUrl: daemonAt(server.url, op.params['workspaceRowId']),
            path: { agentId: op.params['agentId'] },
            query: { path: String(op.query?.['path']) },
          }),
          LIST_FILES,
        ),
      );
      expect(data?.paths).toEqual(['node_modules/.package-lock.json']);
      expect(data?.lazyDirs).toEqual([{ path: 'node_modules/left-pad', childCount: 1 }]);
    }));

  it('open-agent-file: a path that names nothing is a 404', () =>
    given(IGNORED, 'readFile', 'open-agent-file', []).executeTest(async (server) => {
      const op = masters.operation(IGNORED, 'readFile');
      clientAt(server.url);
      const { response } = await call(() =>
        consume(
          readFile({
            baseUrl: daemonAt(server.url, op.params['workspaceRowId']),
            path: { agentId: op.params['agentId'] },
            query: { path: String(op.query?.['path']) },
          }),
          [],
        ),
      );
      expect(response?.status).toBe(404);
    }));
});
