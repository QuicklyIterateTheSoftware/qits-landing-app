import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as systemClient } from '../../api/system/client.gen';
import { provideHeyApiClient } from '../../api/system/client/client.gen';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { systemGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  A_STOPPED_CONTAINER,
  AN_OPEN_EXEC_TERMINAL,
  NO_TERMINAL,
} from '../../../testing/system-states';
import type { InteractionSlug } from '../../interactions';
import { TERMINAL_REFUSAL } from './terminals.consumes';
import {
  CLOSE_SYSTEM_TERMINAL,
  OPEN_SYSTEM_TERMINAL,
  SYSTEM_TERMINAL,
} from './terminals.operations';

/**
 * The terminals' part of qits-landing-app's pact with qits-system-service (qits-2356,
 * `terminals.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the file the
 * targets', swarm's and nodes' pact specs own their operations of (`assertPactPart`).
 *
 * A running container's `bash`/`sh` opens a terminal (`open-system-terminal`, `openTerminal` 201 in
 * "no terminal", the recorded request as it is); the terminal's page reads it
 * (`show-system-terminal`, `getTerminal` 200 in "an open exec terminal") and Terminate ends it
 * (`terminate-system-terminal`, `closeTerminal` 204 there). The terminal's id in a path is the
 * state's `terminalId`, sent as a provider-state expression.
 *
 * Waiting (TODO(qits-2356)): `getTerminal` 404 in "no terminal" (the page's gone state) and
 * `openTerminal` 409 in "a stopped container" (the Containers tab's refusal) are recorded by
 * qits-system-service's qits-2356 change, which publishes with its release request; their rows are
 * written below and skipped until the `@qits/system-golden-masters` pin records them.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['getTerminal', 'openTerminal', 'closeTerminal'];

/** The terminal's id in `state`'s recorded path: its `terminalId` param, else the last segment. */
const terminalIdOf = (state: string, operationId: string): string => {
  const op = masters.operation(state, operationId);
  return op.params['terminalId'] ?? op.path.split('/').pop() ?? '';
};

/** A recorded request body, as the provider replays it. */
const sent = <T>(state: string, operationId: string): T =>
  masters.operation(state, operationId).body as T;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-terminals-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** The interaction `slug` in `state`, binding `consumes` of `operationId`'s recorded answer. */
const given = (
  state: string,
  operationId: string,
  slug: InteractionSlug,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes,
  });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(systemClient),
    ],
  });
  systemClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-system-service pact: the terminals', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
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
    expect(SYSTEM_TERMINAL.provider).toBe(PROVIDER);
    expect(OPEN_SYSTEM_TERMINAL.provider).toBe(PROVIDER);
    expect(CLOSE_SYSTEM_TERMINAL.provider).toBe(PROVIDER);
  });

  it('open-system-terminal: sh in a running container opens a terminal', () =>
    given(
      NO_TERMINAL,
      'openTerminal',
      'open-system-terminal',
      OPEN_SYSTEM_TERMINAL.consumes,
    ).executeTest(async (server) => {
      const body = sent<Parameters<typeof OPEN_SYSTEM_TERMINAL.fetch>[0]['body']>(
        NO_TERMINAL,
        'openTerminal',
      );
      const { data, error, response } = await at(server.url, () =>
        OPEN_SYSTEM_TERMINAL.fetch({ body }),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(201);
      expect(data?.id).toBeTruthy();
    }));

  // TODO(qits-2356): enable once the `@qits/system-golden-masters` pin records qits-system-service's
  // "a stopped container" (`openTerminal` 409, body `{"kind":"EXEC","container":"aa11bb22…8899",
  // "shell":"sh"}`, answer `{"message":"container a-stopped-one is not running"}`).
  it.skip('open-system-terminal: a stopped container is a 409 with the service’s message', () =>
    given(
      A_STOPPED_CONTAINER,
      'openTerminal',
      'open-system-terminal',
      TERMINAL_REFUSAL,
    ).executeTest(async (server) => {
      const body = sent<Parameters<typeof OPEN_SYSTEM_TERMINAL.fetch>[0]['body']>(
        A_STOPPED_CONTAINER,
        'openTerminal',
      );
      const { error, response } = await at(server.url, () => OPEN_SYSTEM_TERMINAL.fetch({ body }));
      expect(response?.status).toBe(409);
      expect((error as { message?: string } | undefined)?.message).toBeTruthy();
    }));

  it('show-system-terminal: an open exec terminal, its shell, container and creator', () =>
    given(
      AN_OPEN_EXEC_TERMINAL,
      'getTerminal',
      'show-system-terminal',
      SYSTEM_TERMINAL.consumes,
    ).executeTest(async (server) => {
      const id = terminalIdOf(AN_OPEN_EXEC_TERMINAL, 'getTerminal');
      const { data, error } = await at(server.url, () => SYSTEM_TERMINAL.fetch({ path: { id } }));
      expect(error).toBeUndefined();
      expect(data?.kind).toBe('EXEC');
      expect(data?.shell).toBeTruthy();
      expect(data?.container?.name).toBeTruthy();
      expect(data?.createdBy).toBeTruthy();
    }));

  // TODO(qits-2356): enable once the `@qits/system-golden-masters` pin records qits-system-service's
  // `getTerminal` 404 in "no terminal" (`/system/api/terminals/00000000-0000-4000-8000-000000000003`,
  // answer `{"message":"no such terminal: 00000000-0000-4000-8000-000000000003"}`).
  it.skip('show-system-terminal: a terminal that has ended is a 404', () =>
    given(NO_TERMINAL, 'getTerminal', 'show-system-terminal', TERMINAL_REFUSAL).executeTest(
      async (server) => {
        const id = terminalIdOf(NO_TERMINAL, 'getTerminal');
        const { error, response } = await at(server.url, () =>
          SYSTEM_TERMINAL.fetch({ path: { id } }),
        );
        expect(response?.status).toBe(404);
        expect((error as { message?: string } | undefined)?.message).toBeTruthy();
      },
    ));

  it('terminate-system-terminal: Terminate ends the terminal', () =>
    given(
      AN_OPEN_EXEC_TERMINAL,
      'closeTerminal',
      'terminate-system-terminal',
      CLOSE_SYSTEM_TERMINAL.consumes,
    ).executeTest(async (server) => {
      const id = terminalIdOf(AN_OPEN_EXEC_TERMINAL, 'closeTerminal');
      const { error, response } = await at(server.url, () =>
        CLOSE_SYSTEM_TERMINAL.fetch({ path: { id } }),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(204);
    }));
});
