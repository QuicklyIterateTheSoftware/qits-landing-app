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
import { swarmServiceState } from './swarm-service-state';
import {
  SWARM_CONFIG_LIST,
  SWARM_NODE_LIST,
  SWARM_SECRET_LIST,
  SWARM_SERVICE_LIST,
} from './swarm.operations';

/**
 * The swarm's part of qits-landing-app's pact with qits-system-service (qits-2344,
 * `swarm.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the same file
 * `targets.operations.pact.spec.ts` owns the targets' operation of (`assertPactPart`).
 *
 * The System section's services page lists the swarm's services (`show-swarm-services`): in "a
 * single-node swarm" (two replicated services, each `1/1`), and in "a swarm running no services"
 * (`[]`), which skips itself until the `@qits/system-golden-masters` pin records it. Its nodes page
 * lists the swarm's nodes (`show-swarm-nodes`, qits-2346): in "a single-node swarm" (one node, the
 * manager and Leader qits-system runs on), and in "a swarm listing no nodes" (`[]`), which skips
 * itself the same way. Its configs page lists the swarm's configs (`show-swarm-configs`,
 * qits-2348): in "a single-node swarm" (one config with one label), and in "a swarm holding no
 * configs" (`[]`), which skips itself the same way. Its secrets page lists the swarm's secrets with
 * the services that use them (`show-swarm-secrets`, qits-2350): in "a single-node swarm" (two
 * secrets, one used by `dev-qits-artifacts`, one by none), and in "a swarm holding no secrets"
 * (`[]`). The same qits-system release records the secrets' usage and the empty state, so both
 * skip themselves until the pin records the empty one. Each test runs the operation's own `fetch`;
 * the interaction's `operationId` and `consumes` are the operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listSwarmServices', 'listSwarmNodes', 'listSwarmConfigs', 'listSwarmSecrets'];

const SWARM = 'a single-node swarm';
const EMPTY_SWARM = 'a swarm running no services';
const NO_NODES = 'a swarm listing no nodes';
const NO_CONFIGS = 'a swarm holding no configs';

const NO_SECRETS = 'a swarm holding no secrets';

/** Whether the pin records the secrets' usage (`usedBy`): the release that records the empty state. */
const SECRETS_USAGE_RECORDED = isRecorded(NO_SECRETS, 'listSwarmSecrets', masters);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-swarm-pact-'));
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

describe('qits-landing-app → qits-system-service pact: the swarm', () => {
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
    expect(SWARM_SERVICE_LIST.provider).toBe(PROVIDER);
    expect(SWARM_NODE_LIST.provider).toBe(PROVIDER);
    expect(SWARM_CONFIG_LIST.provider).toBe(PROVIDER);
  });

  it('show-swarm-services: the page lists the swarm’s services, each with its replicas', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: SWARM,
      operationId: SWARM_SERVICE_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-services' },
      consumes: SWARM_SERVICE_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => SWARM_SERVICE_LIST.fetch({}));
      expect(error).toBeUndefined();
      // The mock answers each row with the recording's first by type: two rows, `1/1` each.
      const services = data ?? [];
      expect(services).toHaveLength(2);
      expect(services.map((service) => swarmServiceState(service.replicas).label)).toEqual([
        'Running',
        'Running',
      ]);
    }));

  it.skipIf(!isRecorded(EMPTY_SWARM, OPERATIONS[0], masters))(
    'show-swarm-services: an empty swarm lists no services',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: EMPTY_SWARM,
        operationId: SWARM_SERVICE_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-services' },
        consumes: SWARM_SERVICE_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => SWARM_SERVICE_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it('show-swarm-nodes: the page lists the swarm’s nodes, the one qits-system runs on marked', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: SWARM,
      operationId: SWARM_NODE_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-nodes' },
      consumes: SWARM_NODE_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => SWARM_NODE_LIST.fetch({}));
      expect(error).toBeUndefined();
      const nodes = data ?? [];
      expect(nodes).toHaveLength(1);
      expect(nodes[0].self).toBe(true);
      expect(nodes[0].role).toBe('manager');
    }));

  it.skipIf(!isRecorded(NO_NODES, 'listSwarmNodes', masters))(
    'show-swarm-nodes: a manager listing no nodes lists none',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: NO_NODES,
        operationId: SWARM_NODE_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-nodes' },
        consumes: SWARM_NODE_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => SWARM_NODE_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it('show-swarm-configs: the page lists the swarm’s configs, each with its labels', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: SWARM,
      operationId: SWARM_CONFIG_LIST.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-configs' },
      consumes: SWARM_CONFIG_LIST.consumes,
    }).executeTest(async (server) => {
      const { data, error } = await at(server.url, () => SWARM_CONFIG_LIST.fetch({}));
      expect(error).toBeUndefined();
      // Docker's created/updated text is the recording's, whatever it says (a humanized age on
      // real docker): the page shows it as given.
      expect(data).toEqual(masters.body(SWARM, 'listSwarmConfigs'));
      const configs = data ?? [];
      expect(configs).toHaveLength(1);
      expect(Object.keys(configs[0].labels ?? {})).not.toHaveLength(0);
    }));

  it.skipIf(!isRecorded(NO_CONFIGS, 'listSwarmConfigs', masters))(
    'show-swarm-configs: a swarm holding no configs lists none',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: NO_CONFIGS,
        operationId: SWARM_CONFIG_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-configs' },
        consumes: SWARM_CONFIG_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => SWARM_CONFIG_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it.skipIf(!SECRETS_USAGE_RECORDED)(
    'show-swarm-secrets: the page lists the swarm’s secrets, each with the services using it',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: SWARM,
        operationId: SWARM_SECRET_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-secrets' },
        consumes: SWARM_SECRET_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => SWARM_SECRET_LIST.fetch({}));
        expect(error).toBeUndefined();
        const secrets = data ?? [];
        expect(secrets).toHaveLength(2);
        // One secret no service uses, one `dev-qits-artifacts` mounts.
        expect(secrets.map((secret) => secret.usedBy?.length)).toEqual([0, 1]);
        // No value: the door answers none, and the page reads none.
        expect(secrets.every((secret) => !('value' in secret))).toBe(true);
      }),
  );

  it.skipIf(!SECRETS_USAGE_RECORDED)(
    'show-swarm-secrets: a swarm holding no secrets lists none',
    () =>
      addGoldenInteraction(pact, masters, {
        provider: PROVIDER,
        state: NO_SECRETS,
        operationId: SWARM_SECRET_LIST.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-swarm-secrets' },
        consumes: SWARM_SECRET_LIST.consumes,
      }).executeTest(async (server) => {
        const { data, error } = await at(server.url, () => SWARM_SECRET_LIST.fetch({}));
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );
});
