import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspaceDaemonClient } from '../../api/workspace-daemon/client.gen';
import { provideHeyApiClient } from '../../api/workspace-daemon/client/client.gen';
import { addGoldenInteraction } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { workspaceDaemonGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { DETECT, LIST_FILES, READ_FILE } from './agent-files.consumes';
import { AgentFilesStore } from './agent-files.store';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentFilesStore`
 * makes, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside the harness's and the chat's
 * parts: the agent's Files tab, through qits-workspaces' container proxy
 * (`/workspaces/container/{workspaceRowId}/agent-worktrees/{agentId}/…`).
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

/** The store, calling qits-workspaces' origin at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspaceDaemonClient),
      provideTestPlatformOrigins({ workspaces: url }),
    ],
  });
  return TestBed.inject(AgentFilesStore);
}

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
      const store = storeAt(server.url);
      const outcome = await store.list(Number(workspaceRowId), agentId);
      // The mock server answers each list with its first recorded element, as many times.
      expect(outcome.ok && outcome.value.paths.length).toBe(7);
      expect(outcome.ok && outcome.value.lazyDirs).toEqual([
        { path: 'node_modules', childCount: 2 },
      ]);
    }));

  it('show-agent-files: the frameworks and the tests that reach a source, for the same tree', () =>
    given(FILES, 'detect', 'show-agent-files', DETECT).executeTest(async (server) => {
      const { workspaceRowId, agentId } = masters.operation(FILES, 'detect').params;
      const store = storeAt(server.url);
      const outcome = await store.detect(Number(workspaceRowId), agentId);
      const tree = masters.body<{ generation: string }>(FILES, 'listFiles');
      expect(outcome.ok && outcome.value.generation).toBe(tree.generation);
      expect(outcome.ok && outcome.value.links[0].tests.map((test) => test.path)).toEqual([
        'src/test/java/app/LoginTest.java',
      ]);
      expect(outcome.ok && outcome.value.frameworks.map((f) => f.label)).toEqual([
        'Java / Quarkus',
      ]);
    }));

  it('open-agent-file: one source file’s text', () =>
    given(FILES, 'readFile', 'open-agent-file', READ_FILE).executeTest(async (server) => {
      const op = masters.operation(FILES, 'readFile');
      const store = storeAt(server.url);
      const outcome = await store.read(
        Number(op.params['workspaceRowId']),
        op.params['agentId'],
        String(op.query?.['path']),
      );
      expect(outcome.ok && outcome.value.binary).toBe(false);
      expect(outcome.ok && outcome.value.content).toContain('class Login');
    }));

  it('open-agent-directory: a gitignored directory, one level deep', () =>
    given(IGNORED, 'listFiles', 'open-agent-directory', LIST_FILES).executeTest(async (server) => {
      const op = masters.operation(IGNORED, 'listFiles');
      const store = storeAt(server.url);
      const outcome = await store.list(
        Number(op.params['workspaceRowId']),
        op.params['agentId'],
        String(op.query?.['path']),
      );
      expect(outcome.ok && outcome.value.paths).toEqual(['node_modules/.package-lock.json']);
      expect(outcome.ok && outcome.value.lazyDirs).toEqual([
        { path: 'node_modules/left-pad', childCount: 1 },
      ]);
    }));

  it('open-agent-file: a path that names nothing is a 404', () =>
    given(IGNORED, 'readFile', 'open-agent-file', []).executeTest(async (server) => {
      const op = masters.operation(IGNORED, 'readFile');
      const store = storeAt(server.url);
      const outcome = await store.read(
        Number(op.params['workspaceRowId']),
        op.params['agentId'],
        String(op.query?.['path']),
      );
      expect(outcome).toEqual({ ok: false, status: 404 });
    }));
});
