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
import { SWARM_SERVICE } from './swarm-service.operations';

/**
 * One swarm service's part of qits-landing-app's pact with qits-system-service (qits-2345,
 * `swarm-service.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the same
 * file `targets.operations.pact.spec.ts` and `swarm.operations.pact.spec.ts` own their operations
 * of (`assertPactPart`).
 *
 * The System section's service page reads one service by its name (`show-swarm-service`): in "a
 * single-node swarm" (`dev-qits-artifacts`: its env keys, labels, one network, two mounts and two
 * tasks, the second Failed and shut down), in "a swarm service with no tasks" (`dev-qits-idle`:
 * scaled to `0/0`, no task, no mount, no healthcheck) and in "no such swarm service" (a 404 binding
 * the status only: the page reads nothing of the body). The last two skip themselves until the
 * `@qits/system-golden-masters` pin records them. The test runs the operation's own `fetch`; the
 * interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['getSwarmService'];

const SWARM = 'a single-node swarm';
const NO_TASKS = 'a swarm service with no tasks';
const NO_SUCH_SERVICE = 'no such swarm service';

/** The service `state` recorded (its `serviceId`), as the page addresses it. */
const serviceOf = (state: string) => ({
  path: { id: masters.operation(state, OPERATIONS[0]).params['serviceId'] },
});

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-swarm-service-pact-'));
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

/** The interaction of the service page's read in `state`, binding `consumes`. */
const given = (state: string, consumes: readonly string[] = SWARM_SERVICE.consumes) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: SWARM_SERVICE.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-service' },
    consumes,
  });

describe('qits-landing-app → qits-system-service pact: one swarm service', () => {
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
    expect(SWARM_SERVICE.provider).toBe(PROVIDER);
  });

  it('show-swarm-service: a service with its mounts, networks and tasks', () =>
    given(SWARM).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => SWARM_SERVICE.fetch(serviceOf(SWARM)));
      expect(error).toBeUndefined();
      expect(data?.name).toBe('dev-qits-artifacts');
      expect(data?.replicas).toBe('1/1');
      expect(data?.envKeys?.length).toBeGreaterThan(0);
      // The mock answers each row with the recording's first by type: two of each, as recorded.
      expect(data?.mounts).toHaveLength(2);
      expect(typeof data?.mounts?.[0]?.readOnly).toBe('boolean');
      expect(data?.networks).toHaveLength(1);
      expect(data?.tasks).toHaveLength(2);
      expect(data?.tasks?.[0]?.nodeHostname).toBeTruthy();
    }));

  it.skipIf(!isRecorded(NO_TASKS, OPERATIONS[0], masters))(
    'show-swarm-service: a service swarm has placed no task for',
    () =>
      given(NO_TASKS).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          SWARM_SERVICE.fetch(serviceOf(NO_TASKS)),
        );
        expect(error).toBeUndefined();
        expect(data?.name).toBe('dev-qits-idle');
        expect(data?.tasks).toEqual([]);
        expect(data?.mounts).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(NO_SUCH_SERVICE, OPERATIONS[0], masters))(
    'show-swarm-service: no such service is a 404',
    () =>
      given(NO_SUCH_SERVICE, []).executeTest(async (server) => {
        const { data, response } = await at(server.url, () =>
          SWARM_SERVICE.fetch(serviceOf(NO_SUCH_SERVICE)),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(404);
      }),
  );
});
