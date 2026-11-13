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
import { AVAILABLE_AGENTS, OPEN_SIGN_IN } from './agent-sign-in.consumes';
import { HARNESS_REPORT, SIGN_IN_TERMINAL } from './agent-sign-in.operations';
import { containerBase } from './container-proxy';
import { signedOutHarness } from './harness-sign-in';

/**
 * qits-landing-app's pact with qits-workspace-daemon (epic qits-1230), the part the workspace
 * page's harness setup makes through `agent-sign-in.operations.ts` (qits-2146: moved here from
 * `agent-sign-in.store.pact.spec.ts` with `AgentSignInStore`, unchanged), in
 * `pacts/qits-landing-app_qits-workspace-daemon.json` beside the other parts: the sign-in notice
 * and the sign-in terminal, through qits-workspaces' container proxy
 * (`/workspaces/container/{workspaceRowId}/…`).
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
        const baseUrl = containerBase(server.url, rowOf(SIGNED_IN, 'availableAgents'));
        const { data } = await at(() => HARNESS_REPORT.fetch({ baseUrl }));
        expect(data?.capabilities).toBeTruthy();
        expect(signedOutHarness(data?.capabilities ?? [], 'CLAUDE')).toBeNull();
      },
    ));

  it('show-agent-sign-in: a harness nobody signed in gets the notice', () =>
    given(SIGNED_OUT, 'availableAgents', 'show-agent-sign-in', AVAILABLE_AGENTS).executeTest(
      async (server) => {
        const baseUrl = containerBase(server.url, rowOf(SIGNED_OUT, 'availableAgents'));
        const { data } = await at(() => HARNESS_REPORT.fetch({ baseUrl }));
        const out = signedOutHarness(data?.capabilities ?? [], 'CLAUDE');
        expect(out?.harness).toBe('CLAUDE');
        expect(out?.message).toContain('Nobody has signed Claude Code in');
      },
    ));

  it('open-sign-in-terminal: the sign-in terminal opens as a command', () =>
    given(SIGNED_OUT, 'openSignInTerminal', 'open-sign-in-terminal', OPEN_SIGN_IN).executeTest(
      async (server) => {
        const baseUrl = containerBase(server.url, rowOf(SIGNED_OUT, 'openSignInTerminal'));
        const { data, error } = await at(() =>
          SIGN_IN_TERMINAL.fetch({ baseUrl, body: { agentType: 'CLAUDE' } }),
        );
        expect(error).toBeUndefined();
        expect(data?.command?.id).toBeTruthy();
      },
    ));
});
