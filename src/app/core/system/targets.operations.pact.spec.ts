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
import { isRecorded, systemGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  AWAITING_CODE,
  CONNECTED,
  CONNECTED_WITH_LEASES,
  DECLARED,
  NO_TARGET,
  REGISTERED_RUNNER,
} from '../../../testing/system-states';
import type { InteractionSlug } from '../../interactions';
import { isTerminal } from './sign-in';
import { targetHealthOf } from './target-health';
import { targetOf } from './targets';
import { STATUS_ONLY, TARGET_REFUSAL } from './targets.consumes';
import {
  TARGET_CREATE,
  TARGET_DELETE,
  TARGET_GREENLIGHT,
  TARGET_HEALTH,
  TARGET_HEALTH_CHECK,
  TARGET_INSTALL_SCRIPT,
  TARGET_LIST,
  TARGET_LOGIN_CHECK,
  TARGET_PATCH,
  TARGET_ROWS,
  TARGET_SIGN_IN_CANCEL,
  TARGET_SIGN_IN_CODE,
  TARGET_SIGN_IN_READ,
  TARGET_SIGN_IN_START,
  TARGET_TOKEN_ROTATE,
} from './targets.operations';

/**
 * The targets' part of qits-landing-app's pact with qits-system-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-system-service.json` — the same file `swarm.operations.pact.spec.ts`
 * owns the swarm's operations of (`assertPactPart`, qits-2344).
 *
 * `TARGET_LIST` is the lightning menu's list of execution targets. Moved here from `TargetsStore`'s pact spec when the
 * store went (qits-2146), unchanged: the same description, state, request and bound fields; the test
 * runs the operation's own `fetch`.
 *
 * The System section's Targets page (qits-2351) reads and writes the rest, each operation's own
 * `fetch` against the recorded request: `TARGET_ROWS` (`show-targets`) in "a connected target with
 * leases" and, empty, in "no target"; declaring (`createTarget` 201) and the install script in "no
 * target"; the declared target's patch, greenlight, delete (204) and health in "a declared target",
 * with the two checks' 409 TARGET_UNAVAILABLE as refusal rows; a token rotation in "a registered
 * runner"; a sign-in started in "a connected target", and followed, given its code and cancelled in
 * "a connected target with a claude sign-in awaiting its code". The empty list and the two checks'
 * 202s (in "a connected target") skip themselves until the `@qits/system-golden-masters` pin records
 * them. Ids in a path are the states' params, sent as provider-state expressions.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = [
  'listTargets',
  'createTarget',
  'getTargetInstallScript',
  'patchTarget',
  'deleteTarget',
  'rotateTargetRegistrationToken',
  'greenlightTarget',
  'getTargetHealth',
  'requestTargetHealthCheck',
  'requestTargetLoginCheck',
  'startTargetSignIn',
  'getTargetSignIn',
  'submitTargetSignInCode',
  'cancelTargetSignIn',
];

/** A state's param, as the recording names it. */
const param = (state: string, operationId: string, name: string): string =>
  masters.operation(state, operationId).params[name];

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

/** A recorded request body, as the provider replays it. */
const sent = <T>(state: string, operationId: string): T =>
  masters.operation(state, operationId).body as T;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

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

describe('qits-landing-app → qits-system-service pact: the targets', () => {
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
    expect(TARGET_LIST.provider).toBe(PROVIDER);
  });

  it('show-runner-slots: the store holds the targets', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'a connected target with leases',
      operationId: TARGET_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-runner-slots' },
      consumes: TARGET_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TARGET_LIST.fetch({}));
      expect(error).toBeUndefined();
      const targets = (data ?? []).map(targetOf);
      expect(targets.length).toBe(1);
      expect(targets[0].slotsTotal).toBeGreaterThan(0);
      expect(Object.keys(targets[0].used ?? {}).sort()).toEqual(['ci', 'desk', 'workspace']);
    }));

  it('declares the Targets page’s operations on the same provider', () => {
    for (const operation of [
      TARGET_ROWS,
      TARGET_CREATE,
      TARGET_INSTALL_SCRIPT,
      TARGET_PATCH,
      TARGET_DELETE,
      TARGET_TOKEN_ROTATE,
      TARGET_GREENLIGHT,
      TARGET_HEALTH,
      TARGET_HEALTH_CHECK,
      TARGET_LOGIN_CHECK,
      TARGET_SIGN_IN_START,
      TARGET_SIGN_IN_READ,
      TARGET_SIGN_IN_CODE,
      TARGET_SIGN_IN_CANCEL,
    ]) {
      expect(operation.provider).toBe(PROVIDER);
    }
  });

  it('show-targets: the Targets page lists the targets, each as its card shows it', () =>
    given(CONNECTED_WITH_LEASES, 'listTargets', 'show-targets', TARGET_ROWS.consumes).executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () => TARGET_ROWS.fetch({}));
        expect(error).toBeUndefined();
        const [target] = data ?? [];
        expect(data).toHaveLength(1);
        expect(target.name).toBe('lab');
        expect(target.connected).toBe(true);
        expect(target.hostname).toBe('node-1');
        expect(target.login?.claude).toBe('PRESENT');
        expect(target.maximums?.ci).toBeNull();
      },
    ));

  it.skipIf(!isRecorded(NO_TARGET, 'listTargets', masters))(
    'show-targets: with no target declared the page lists none',
    () =>
      given(NO_TARGET, 'listTargets', 'show-targets', TARGET_ROWS.consumes).executeTest(
        async (server) => {
          const { data, error } = await at(server.url, () => TARGET_ROWS.fetch({}));
          expect(error).toBeUndefined();
          expect(data).toEqual([]);
        },
      ),
  );

  it('declare-target: a declared target answers its one-time install line', () =>
    given(NO_TARGET, 'createTarget', 'declare-target', TARGET_CREATE.consumes).executeTest(
      async (server) => {
        const body = sent<Parameters<typeof TARGET_CREATE.fetch>[0]['body']>(
          NO_TARGET,
          'createTarget',
        );
        const { data, error } = await at(server.url, () => TARGET_CREATE.fetch({ body }));
        expect(error).toBeUndefined();
        expect(data?.installLine).toContain('install.sh');
      },
    ));

  it('show-target-install-script: the install script, as text', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NO_TARGET,
      operationId: 'getTargetInstallScript',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-target-install-script' },
      consumes: TARGET_INSTALL_SCRIPT.consumes,
      response: { contentType: 'text/plain' },
    }).executeTest(async (server) => {
      const { response, error } = await at(server.url, () => TARGET_INSTALL_SCRIPT.fetch({}));
      expect(error).toBeUndefined();
      expect(response?.status).toBe(200);
    }));

  it('edit-target: Save sends what changed', () =>
    given(DECLARED, 'patchTarget', 'edit-target', STATUS_ONLY).executeTest(async (server) => {
      const id = param(DECLARED, 'patchTarget', 'targetId');
      const body = sent<Parameters<typeof TARGET_PATCH.fetch>[0]['body']>(DECLARED, 'patchTarget');
      const { response, error } = await at(server.url, () =>
        TARGET_PATCH.fetch({ path: { id }, body }),
      );
      expect(error).toBeUndefined();
      expect(response?.status).toBe(200);
    }));

  it('greenlight-target: Greenlight lifts the quarantine', () =>
    given(DECLARED, 'greenlightTarget', 'greenlight-target', STATUS_ONLY).executeTest(
      async (server) => {
        const id = param(DECLARED, 'greenlightTarget', 'targetId');
        const { response, error } = await at(server.url, () =>
          TARGET_GREENLIGHT.fetch({ path: { id } }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(200);
      },
    ));

  it('delete-target: the second press deletes the target', () =>
    given(DECLARED, 'deleteTarget', 'delete-target', STATUS_ONLY).executeTest(async (server) => {
      const id = param(DECLARED, 'deleteTarget', 'targetId');
      const { response, error } = await at(server.url, () => TARGET_DELETE.fetch({ path: { id } }));
      expect(error).toBeUndefined();
      expect(response?.status).toBe(204);
    }));

  it('rotate-target-token: a rotation answers a new install line', () =>
    given(
      REGISTERED_RUNNER,
      'rotateTargetRegistrationToken',
      'rotate-target-token',
      TARGET_TOKEN_ROTATE.consumes,
    ).executeTest(async (server) => {
      const id = param(REGISTERED_RUNNER, 'rotateTargetRegistrationToken', 'runnerId');
      const body = sent<{ slots?: number }>(REGISTERED_RUNNER, 'rotateTargetRegistrationToken');
      const { data, error } = await at(server.url, () =>
        TARGET_TOKEN_ROTATE.fetch({ path: { id }, body }),
      );
      expect(error).toBeUndefined();
      expect(data?.installLine).toContain('install.sh');
    }));

  it('show-target-health: the last settled health check, each check with its verdict', () =>
    given(DECLARED, 'getTargetHealth', 'show-target-health', TARGET_HEALTH.consumes).executeTest(
      async (server) => {
        const id = param(DECLARED, 'getTargetHealth', 'targetId');
        const { data, error } = await at(server.url, () => TARGET_HEALTH.fetch({ path: { id } }));
        expect(error).toBeUndefined();
        const health = targetHealthOf(data);
        expect(health?.ok).toBe(true);
        // The mock answers each check with the recording's first by type: three, passed.
        expect(health?.checks).toHaveLength(3);
        expect(health?.checks.every((check) => check.ok)).toBe(true);
      },
    ));

  it('request-target-health-check: a disconnected target refuses, TARGET_UNAVAILABLE', () =>
    given(
      DECLARED,
      'requestTargetHealthCheck',
      'request-target-health-check',
      TARGET_REFUSAL,
    ).executeTest(async (server) => {
      const id = param(DECLARED, 'requestTargetHealthCheck', 'targetId');
      const { error, response } = await at(server.url, () =>
        TARGET_HEALTH_CHECK.fetch({ path: { id } }),
      );
      expect(response?.status).toBe(409);
      expect((error as { code?: string } | undefined)?.code).toBe('TARGET_UNAVAILABLE');
    }));

  it('request-target-login-check: a disconnected target refuses, TARGET_UNAVAILABLE', () =>
    given(
      DECLARED,
      'requestTargetLoginCheck',
      'request-target-login-check',
      TARGET_REFUSAL,
    ).executeTest(async (server) => {
      const id = param(DECLARED, 'requestTargetLoginCheck', 'targetId');
      const { error, response } = await at(server.url, () =>
        TARGET_LOGIN_CHECK.fetch({ path: { id } }),
      );
      expect(response?.status).toBe(409);
      expect((error as { code?: string } | undefined)?.code).toBe('TARGET_UNAVAILABLE');
    }));

  it.skipIf(!isRecorded(CONNECTED, 'requestTargetHealthCheck', masters))(
    'request-target-health-check: a connected target takes it',
    () =>
      given(
        CONNECTED,
        'requestTargetHealthCheck',
        'request-target-health-check',
        STATUS_ONLY,
      ).executeTest(async (server) => {
        const id = param(CONNECTED, 'requestTargetHealthCheck', 'targetId');
        const { error, response } = await at(server.url, () =>
          TARGET_HEALTH_CHECK.fetch({ path: { id } }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(202);
      }),
  );

  it.skipIf(!isRecorded(CONNECTED, 'requestTargetLoginCheck', masters))(
    'request-target-login-check: a connected target takes it',
    () =>
      given(
        CONNECTED,
        'requestTargetLoginCheck',
        'request-target-login-check',
        STATUS_ONLY,
      ).executeTest(async (server) => {
        const id = param(CONNECTED, 'requestTargetLoginCheck', 'targetId');
        const { error, response } = await at(server.url, () =>
          TARGET_LOGIN_CHECK.fetch({ path: { id } }),
        );
        expect(error).toBeUndefined();
        expect(response?.status).toBe(202);
      }),
  );

  it('start-target-sign-in: a sign-in starts, STARTING', () =>
    given(
      CONNECTED,
      'startTargetSignIn',
      'start-target-sign-in',
      TARGET_SIGN_IN_START.consumes,
    ).executeTest(async (server) => {
      const id = param(CONNECTED, 'startTargetSignIn', 'targetId');
      const body = sent<{ harness: string }>(CONNECTED, 'startTargetSignIn');
      const { data, error } = await at(server.url, () =>
        TARGET_SIGN_IN_START.fetch({ path: { id }, body }),
      );
      expect(error).toBeUndefined();
      expect(data?.state).toBe('STARTING');
      expect(data?.harness).toBe('claude');
      expect(data?.signInId).toBeTruthy();
    }));

  it('follow-target-sign-in: a running sign-in reads as awaiting its code, with its link', () =>
    given(
      AWAITING_CODE,
      'getTargetSignIn',
      'follow-target-sign-in',
      TARGET_SIGN_IN_READ.consumes,
    ).executeTest(async (server) => {
      const id = param(AWAITING_CODE, 'getTargetSignIn', 'targetId');
      const signInId = param(AWAITING_CODE, 'getTargetSignIn', 'signInId');
      const { data, error } = await at(server.url, () =>
        TARGET_SIGN_IN_READ.fetch({ path: { id, signInId } }),
      );
      expect(error).toBeUndefined();
      expect(data?.state).toBe('AWAITING_CODE');
      expect(data?.url).toMatch(/^https:/);
      expect(isTerminal(data?.state)).toBe(false);
    }));

  it('submit-target-sign-in-code: the code is handed over', () =>
    given(
      AWAITING_CODE,
      'submitTargetSignInCode',
      'submit-target-sign-in-code',
      TARGET_SIGN_IN_CODE.consumes,
    ).executeTest(async (server) => {
      const id = param(AWAITING_CODE, 'submitTargetSignInCode', 'targetId');
      const signInId = param(AWAITING_CODE, 'submitTargetSignInCode', 'signInId');
      const body = sent<{ code: string }>(AWAITING_CODE, 'submitTargetSignInCode');
      const { data, error } = await at(server.url, () =>
        TARGET_SIGN_IN_CODE.fetch({ path: { id, signInId }, body }),
      );
      expect(error).toBeUndefined();
      expect(data?.state).toBe('AWAITING_CODE');
    }));

  it('cancel-target-sign-in: Cancel ends the sign-in, CANCELLED', () =>
    given(
      AWAITING_CODE,
      'cancelTargetSignIn',
      'cancel-target-sign-in',
      TARGET_SIGN_IN_CANCEL.consumes,
    ).executeTest(async (server) => {
      const id = param(AWAITING_CODE, 'cancelTargetSignIn', 'targetId');
      const signInId = param(AWAITING_CODE, 'cancelTargetSignIn', 'signInId');
      const { data, error } = await at(server.url, () =>
        TARGET_SIGN_IN_CANCEL.fetch({ path: { id, signInId } }),
      );
      expect(error).toBeUndefined();
      expect(data?.state).toBe('CANCELLED');
      expect(isTerminal(data?.state)).toBe(true);
    }));
});
