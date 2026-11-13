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
import { INSTALL_PLUGIN, LIST_PLUGINS } from './agent-plugins.consumes';
import { HOME_PLUGINS, PLUGIN_INSTALL } from './agent-plugins.operations';
import { containerBase } from './container-proxy';
import { installPluginParams } from './plugin-catalogue';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part the workspace
 * page's plugins section makes through `agent-plugins.operations.ts` (qits-2146: moved here from
 * `agent-plugins.store.pact.spec.ts` with `AgentPluginsStore`, unchanged), in
 * `pacts/qits-landing-app_qits-workspace-daemon.json` beside the other parts, through
 * qits-workspaces' container proxy.
 *
 * "a workspace daemon with plugins installed": two plugins on the shared agent home (one switched
 * off), and `pyright-lsp` installed, which answers the refreshed set of three.
 *
 * The slot's row id is the state's param, sent as a provider-state expression; the plugin's id is
 * the recording's own.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspace-daemon';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const INSTALLED = 'a workspace daemon with plugins installed';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['listPlugins', 'installPlugin'];

const given = (operationId: string, interaction: InteractionSlug, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state: INSTALLED,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });

/** Runs `call` with the daemon's generated client at the mock server, in an injection context. */
function at<T>(call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspaceDaemonClient),
    ],
  });
  return TestBed.runInInjectionContext(call);
}

const params = (operationId: string) => masters.operation(INSTALLED, operationId).params;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-plugins-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspace-daemon pact: the agent’s plugins', () => {
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

  it('show-agent-plugins: the plugins on the shared agent home', () =>
    given('listPlugins', 'show-agent-plugins', LIST_PLUGINS).executeTest(async (server) => {
      const row = Number(params('listPlugins')['workspaceRowId']);
      const { data } = await at(() =>
        HOME_PLUGINS.fetch({ baseUrl: containerBase(server.url, row) }),
      );
      // The mock server answers each element with the first one's shape, so only the count is the
      // recording's.
      expect(data?.installed.length).toBe(2);
    }));

  it('install-agent-plugin: an install answers the refreshed set', () =>
    given('installPlugin', 'install-agent-plugin', INSTALL_PLUGIN).executeTest(async (server) => {
      const row = Number(params('installPlugin')['workspaceRowId']);
      // The recording's path names the plugin itself (`…/agent-plugins/pyright-lsp/install`).
      const { data, error } = await at(() =>
        PLUGIN_INSTALL.fetch(installPluginParams(containerBase(server.url, row), 'pyright-lsp')),
      );
      expect(error).toBeUndefined();
      expect(data?.installed.length).toBe(3);
    }));
});
