import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { addGoldenInteraction, type GoldenMasters } from '@qits/angular/testing';
import type { InteractionSlug } from '../../interactions';
import { workspacesGoldenMasters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { REFUSAL } from './agent-actions.consumes';
import {
  GET_RUNNER_HEALTH,
  GREENLIGHT_RUNNER,
  LIST_RUNNERS,
  OWNS_WORKSPACES_REFUSAL,
  PATCH_RUNNER,
  RUNNER_REGISTRATION,
  STATUS_ONLY,
} from './runners.consumes';
import { RunnersStore, type NewRunner, type RunnerChange } from './runners.store';

/**
 * qits-landing-app's pact with qits-workspaces-service, the part the Runners page makes (epic
 * qits-1230), in `pacts/qits-landing-app_qits-workspaces-service.json` beside the other stores'
 * parts:
 *
 * - `listRunners`: "a runner in service" (connected, healthy, signed in to Claude, its login
 *   commands), "a connected runner" (nothing reported yet: no version, login or health) and "an
 *   unregistered runner" (never connected).
 * - `getRunnerHealth`: "a runner in service" answers its newest check with every check's data; "an
 *   unregistered runner" was never checked (204).
 * - `requestRunnerHealthcheck` and `requestRunnerLoginCheck`: "a runner in service" queues them
 *   (202); "an unregistered runner" is refused (409 `RUNNER_UNAVAILABLE`), with the reason.
 * - `patchRunner`: "a runner in service" takes new slots, description and memory caps.
 * - `deleteRunner`: "an unregistered runner" is deleted (204); "a workspace slot hosting agents"
 *   is refused (409 `RUNNER_OWNS_WORKSPACES`), naming the workspaces its runner owns.
 * - `createRunner` ("no runners") and `rotateRunnerRegistrationToken` ("an unregistered runner"):
 *   the one-time install line and token.
 * - `greenlightRunner`: "a quarantined runner" has its quarantine lifted.
 *
 * Ids in a path are the states' params, sent as provider-state expressions. A create's recorded
 * body names the runner as a param (`{runnerName}`): it travels as it is, and the provider puts its
 * run's value in its place.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-workspaces-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const IN_SERVICE = 'a runner in service';
const CONNECTED = 'a connected runner';
const UNREGISTERED = 'an unregistered runner';
const QUARANTINED = 'a quarantined runner';
const NO_RUNNERS = 'no runners';
const OWNS = 'a workspace slot hosting agents';

/** What this spec owns in the shared pact file. */
const OPERATIONS: readonly OwnedOperation[] = [
  'listRunners',
  'getRunnerHealth',
  'requestRunnerHealthcheck',
  'requestRunnerLoginCheck',
  'patchRunner',
  'deleteRunner',
  'createRunner',
  'rotateRunnerRegistrationToken',
  'greenlightRunner',
];

/**
 * qits-workspaces' golden masters, where a recording without a body (a 202 login check, a 204)
 * reads as no body rather than as a file that is not there.
 */
const masters: GoldenMasters = {
  operation: (state, operationId) => workspacesGoldenMasters.operation(state, operationId),
  body: <T>(state: string, operationId: string) =>
    (workspacesGoldenMasters.operation(state, operationId).file
      ? workspacesGoldenMasters.body<T>(state, operationId)
      : undefined) as T,
};

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

/** The store, calling the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(workspacesClient),
    ],
  });
  workspacesClient.setConfig({ baseUrl: url });
  return TestBed.inject(RunnersStore);
}

const runnerOf = (state: string, operationId: string) =>
  masters.operation(state, operationId).params['runnerId'];

/** What the recording of `operationId` in `state` sent. */
const sent = <T>(state: string, operationId: string) =>
  masters.operation(state, operationId).body as T;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-runners-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

describe('qits-landing-app → qits-workspaces-service pact: the Runners page', () => {
  afterAll(() => {
    workspacesClient.setConfig({ baseUrl: '' });
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

  it('show-runners: a runner in service, with its health, login and login commands', () =>
    given(IN_SERVICE, 'listRunners', 'show-runners', LIST_RUNNERS).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      const [runner] = store.runners();
      expect(runner.connected).toBe(true);
      expect(runner.health?.ok).toBe(true);
      expect(runner.health?.checks?.length).toBe(2);
      expect(runner.login?.claude).toBe('PRESENT');
      expect(runner.loginCommand).toBeTruthy();
      expect(runner.kimiLoginCommand).toBeTruthy();
    }));

  it('show-runners: a connected runner that has reported nothing yet', () =>
    given(CONNECTED, 'listRunners', 'show-runners', LIST_RUNNERS).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const [runner] = store.runners();
      expect(runner.connected).toBe(true);
      expect(runner.login).toBeNull();
      expect(runner.health).toBeNull();
      expect(runner.loginCommand).toBeNull();
    }));

  it('show-runners: a runner that never connected', () =>
    given(UNREGISTERED, 'listRunners', 'show-runners', LIST_RUNNERS).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      const [runner] = store.runners();
      expect(runner.registered).toBe(false);
      expect(runner.connected).toBe(false);
      expect(runner.lastSeenAt).toBeNull();
    }));

  it('show-runner-node-details: every check of the newest health check, with its data', () =>
    given(IN_SERVICE, 'getRunnerHealth', 'show-runner-node-details', GET_RUNNER_HEALTH).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = runnerOf(IN_SERVICE, 'getRunnerHealth');
        await store.loadHealth(id);
        const read = store.healthOf(id);
        expect(read?.status).toBe('loaded');
        expect(read?.checks.map((c) => c.name)).toEqual(['docker', 'selfTest']);
        expect(read?.checks[0].data).toEqual({ version: '27.1' });
      },
    ));

  it('show-runner-node-details: a runner never checked has no details (204)', () =>
    given(UNREGISTERED, 'getRunnerHealth', 'show-runner-node-details', STATUS_ONLY).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const id = runnerOf(UNREGISTERED, 'getRunnerHealth');
        await store.loadHealth(id);
        expect(store.healthOf(id)?.status).toBe('none');
      },
    ));

  it('run-runner-healthcheck: a connected runner queues a check', () =>
    given(
      IN_SERVICE,
      'requestRunnerHealthcheck',
      'run-runner-healthcheck',
      STATUS_ONLY,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.requestHealthcheck(
        runnerOf(IN_SERVICE, 'requestRunnerHealthcheck'),
      );
      expect(outcome.ok).toBe(true);
    }));

  it('run-runner-healthcheck: an offline runner is refused, with the reason', () =>
    given(UNREGISTERED, 'requestRunnerHealthcheck', 'run-runner-healthcheck', REFUSAL).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.requestHealthcheck(
          runnerOf(UNREGISTERED, 'requestRunnerHealthcheck'),
        );
        expect(outcome).toMatchObject({ ok: false, status: 409, code: 'RUNNER_UNAVAILABLE' });
        expect(!outcome.ok && outcome.message).toBeTruthy();
      },
    ));

  it('recheck-runner-login: a connected runner probes its login again', () =>
    given(IN_SERVICE, 'requestRunnerLoginCheck', 'recheck-runner-login', STATUS_ONLY).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.requestLoginCheck(
          runnerOf(IN_SERVICE, 'requestRunnerLoginCheck'),
        );
        expect(outcome.ok).toBe(true);
      },
    ));

  it('recheck-runner-login: an offline runner is refused, with the reason', () =>
    given(UNREGISTERED, 'requestRunnerLoginCheck', 'recheck-runner-login', REFUSAL).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.requestLoginCheck(
          runnerOf(UNREGISTERED, 'requestRunnerLoginCheck'),
        );
        expect(outcome).toMatchObject({ ok: false, status: 409, code: 'RUNNER_UNAVAILABLE' });
        expect(!outcome.ok && outcome.message).toBeTruthy();
      },
    ));

  it('edit-runner: new slots, description and memory caps are saved', () =>
    given(IN_SERVICE, 'patchRunner', 'edit-runner', PATCH_RUNNER).executeTest(async (server) => {
      const store = storeAt(server.url);
      const change = sent<RunnerChange>(IN_SERVICE, 'patchRunner');
      const outcome = await store.patchRunner(runnerOf(IN_SERVICE, 'patchRunner'), change);
      expect(outcome.ok && outcome.value).toEqual(change);
    }));

  it('delete-runner: a runner that owns nothing is deleted', () =>
    given(UNREGISTERED, 'deleteRunner', 'delete-runner', STATUS_ONLY).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.deleteRunner(runnerOf(UNREGISTERED, 'deleteRunner'));
        expect(outcome).toEqual({ ok: true });
      },
    ));

  it('delete-runner: a runner that owns workspaces is refused, naming them', () =>
    given(OWNS, 'deleteRunner', 'delete-runner', OWNS_WORKSPACES_REFUSAL).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.deleteRunner(runnerOf(OWNS, 'deleteRunner'));
        expect(outcome).toMatchObject({
          ok: false,
          status: 409,
          code: 'RUNNER_OWNS_WORKSPACES',
          workspaceIds: [1],
        });
        expect(!outcome.ok && outcome.message).toBeTruthy();
      },
    ));

  it('register-runner: a new runner answers its one-time install line', () =>
    given(NO_RUNNERS, 'createRunner', 'register-runner', RUNNER_REGISTRATION).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.createRunner(sent<NewRunner>(NO_RUNNERS, 'createRunner'));
        expect(outcome.ok && outcome.value.installLine).toBeTruthy();
        expect(outcome.ok && outcome.value.registrationToken).toBeTruthy();
        expect(outcome.ok && outcome.value.runner?.name).toBeTruthy();
      },
    ));

  it('rotate-runner-token: a new token answers a new install line', () =>
    given(
      UNREGISTERED,
      'rotateRunnerRegistrationToken',
      'rotate-runner-token',
      RUNNER_REGISTRATION,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const outcome = await store.rotateToken(
        runnerOf(UNREGISTERED, 'rotateRunnerRegistrationToken'),
      );
      expect(outcome.ok && outcome.value.installLine).toBeTruthy();
    }));

  it('greenlight-runner: a quarantined runner’s quarantine is lifted', () =>
    given(QUARANTINED, 'greenlightRunner', 'greenlight-runner', GREENLIGHT_RUNNER).executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const outcome = await store.greenlight(runnerOf(QUARANTINED, 'greenlightRunner'));
        expect(outcome.ok && outcome.value.quarantined).toBe(false);
      },
    ));
});
