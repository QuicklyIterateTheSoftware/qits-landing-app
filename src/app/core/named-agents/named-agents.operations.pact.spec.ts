import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { NAMED_AGENTS, START_NAMED_AGENT } from './named-agents.operations';

/**
 * The named agents' part of qits-landing-app's pact with qits-projects-service (qits-2157,
 * qits-2499, qits-2495, `named-agents.operations.ts`), in
 * `pacts/qits-landing-app_qits-projects-service.json` — the same shared file
 * `desk.operations.pact.spec.ts` and the other projects specs own other operations of
 * (`assertPactPart` below is what lets several specs share one committed pact).
 *
 * One state, `a project whose named agent is running` (qits-2154): the project's `ui-builder` agent
 * IDLE on its command, beside the desk. The agent dialog, opened from the UI builder
 * (`open-ui-builder-agent`) or the Desk page (`open-desk-agent`), starts the agent (which the
 * recording leaves running) and lists the agents. Each test runs the operation's own `fetch`; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listAgents', 'startAgent'];

const STATE = 'a project whose named agent is running';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-named-agents-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-projects-service pact: the named agents', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
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

  it('declares the provider this spec binds', () => {
    expect(NAMED_AGENTS.provider).toBe(PROVIDER);
    expect(START_NAMED_AGENT.provider).toBe(PROVIDER);
  });

  for (const interaction of ['open-ui-builder-agent', 'open-desk-agent'] as const) {
    it(`${interaction}: the dialog starts the agent, which answers as the listing does`, () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: STATE,
        operationId: START_NAMED_AGENT.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction },
        consumes: START_NAMED_AGENT.consumes,
      }).executeTest(async (server) => {
        const { projectId, name } = masters.operation(STATE, 'startAgent').params;
        const { data, error } = await at(server.url, () =>
          START_NAMED_AGENT.fetch({ path: { projectId, name } }),
        );
        expect(error).toBeUndefined();
        expect(typeof data?.name).toBe('string');
        expect(typeof data?.state).toBe('string');
        expect(typeof data?.commandId).toBe('string');
      }));

    it(`${interaction}: the dialog reads the agent’s state and command`, () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: STATE,
        operationId: NAMED_AGENTS.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction },
        consumes: NAMED_AGENTS.consumes,
      }).executeTest(async (server) => {
        const projectId = masters.operation(STATE, 'listAgents').params['projectId'];
        const { data, error } = await at(server.url, () =>
          NAMED_AGENTS.fetch({ path: { projectId } }),
        );
        expect(error).toBeUndefined();
        // The pact binds the list's shape at its recorded length (each entry by type: the mock
        // server answers its first entry twice), not which agent is which.
        expect(data?.agents).toHaveLength(masters.body(STATE, 'listAgents').agents.length);
        for (const agent of data?.agents ?? []) {
          expect(typeof agent.name).toBe('string');
          expect(typeof agent.state).toBe('string');
          expect(typeof agent.commandId).toBe('string');
        }
      }));
  }
});
