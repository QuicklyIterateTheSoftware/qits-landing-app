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
import { AVAILABLE_AGENTS, OPEN_SIGN_IN } from './agent-sign-in.consumes';
import { AgentSignInStore, signedOutHarness } from './agent-sign-in.store';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part `AgentSignInStore`
 * makes, in `pacts/qits-landing-app_qits-workspace-daemon.json` beside the other stores' parts:
 * the Terminal tab's sign-in notice and the sign-in terminal, through qits-workspaces' container
 * proxy (`/workspaces/container/{workspaceRowId}/…`).
 *
 * - "a workspace daemon with a signed-in harness": the report says Claude Code is signed in, so no
 *   notice;
 * - "a workspace daemon with a harness nobody signed in": the report says nobody is (the notice,
 *   with the daemon's hint), and the sign-in terminal opens for CLAUDE.
 *
 * The slot's row id is the states' param; the path takes it as a provider-state expression.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspace-daemon';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';

/** What this spec owns in the shared pact file. */
const OPERATIONS = ['availableAgents', 'openSignInTerminal'];

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
  return TestBed.inject(AgentSignInStore);
}

const rowOf = (state: string, operationId: string) =>
  Number(masters.operation(state, operationId).params['workspaceRowId']);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-sign-in-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspace-daemon pact: the harness sign-in', () => {
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

  it('show-agent-sign-in: a signed-in harness needs no notice', () =>
    given(SIGNED_IN, 'availableAgents', 'show-agent-sign-in', AVAILABLE_AGENTS).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const row = rowOf(SIGNED_IN, 'availableAgents');
        await store.loadReport(row);
        const signIn = store.signInOf(row)!;
        expect(signIn.status).toBe('loaded');
        expect(signedOutHarness(signIn.capabilities, 'CLAUDE')).toBeNull();
      },
    ));

  it('show-agent-sign-in: a harness nobody signed in gets the notice', () =>
    given(SIGNED_OUT, 'availableAgents', 'show-agent-sign-in', AVAILABLE_AGENTS).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const row = rowOf(SIGNED_OUT, 'availableAgents');
        await store.loadReport(row);
        const out = signedOutHarness(store.signInOf(row)!.capabilities, 'CLAUDE');
        expect(out?.harness).toBe('CLAUDE');
        expect(out?.message).toContain('Nobody has signed Claude Code in');
      },
    ));

  it('open-sign-in-terminal: the sign-in terminal opens as a command', () =>
    given(SIGNED_OUT, 'openSignInTerminal', 'open-sign-in-terminal', OPEN_SIGN_IN).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const row = rowOf(SIGNED_OUT, 'openSignInTerminal');
        await store.open(row, 'CLAUDE');
        expect(store.signInOf(row)?.commandId).toBeTruthy();
        expect(store.signInOf(row)?.problem).toBeNull();
      },
    ));
});
