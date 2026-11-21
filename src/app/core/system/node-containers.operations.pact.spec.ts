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
import { containerHealth, filteredContainers } from './node-container-rows';
import { NODE_CONTAINERS_REFUSAL, type NodeContainer } from './node-containers.consumes';
import {
  containerLogsParams,
  NODE_CONTAINER_LIST,
  NODE_CONTAINER_LOGS,
  nodeContainersParams,
} from './node-containers.operations';

/**
 * The swarm node Containers tab's part of qits-landing-app's pact with qits-system-service
 * (qits-2352, `node-containers.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json`
 * — the file the targets', leases' and swarm's pact specs own their operations of
 * (`assertPactPart`).
 *
 * The tab lists the node's containers (`show-swarm-node-containers`), always with `all=true`: in "a
 * single-node swarm" (two rows, one running and healthy, one exited and unhealthy), in "a node
 * running no containers" (`[]`) and in "a swarm node this service cannot reach" (a 409
 * `NODE_REMOTE`, binding its `code` and `message`). A row's Logs reads the container's last 200
 * lines (`show-swarm-node-container-logs`) in "a single-node swarm". Each interaction skips itself
 * until the `@qits/system-golden-masters` pin records it at the path the tab asks (`?all=true`).
 * The node and container ids are the recording's own (the recorded paths name `local`, the alias of
 * the node qits-system runs on, and `no-such-node`), as the request must match them.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listNodeContainers', 'getContainerLogs'];

const SWARM = 'a single-node swarm';
const NO_CONTAINERS = 'a node running no containers';
const REMOTE_NODE = 'a swarm node this service cannot reach';

/** The `/system/api/nodes/{id}/…` segments of the path `state` recorded `operationId` at. */
function recordedPath(state: string, operationId: string): { node: string; container?: string } {
  const [, , , , node, , container] = masters.operation(state, operationId).path.split('/');
  return { node, container };
}

/** Whether `state` records the containers read as the tab asks it: with `all=true`. */
const listRecorded = (state: string) =>
  isRecorded(state, NODE_CONTAINER_LIST.operationId, masters) &&
  masters.operation(state, NODE_CONTAINER_LIST.operationId).query['all'] === 'true';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-node-containers-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** The interaction of the tab's `operationId` in `state`, binding `consumes`. */
const given = (
  state: string,
  operationId: string,
  interaction: 'show-swarm-node-containers' | 'show-swarm-node-container-logs',
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
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

describe('qits-landing-app → qits-system-service pact: a swarm node’s containers', () => {
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
    expect(NODE_CONTAINER_LIST.provider).toBe(PROVIDER);
    expect(NODE_CONTAINER_LOGS.provider).toBe(PROVIDER);
  });

  it.skipIf(!listRecorded(SWARM))(
    'show-swarm-node-containers: every container on the node, running and exited',
    () =>
      given(
        SWARM,
        NODE_CONTAINER_LIST.operationId,
        'show-swarm-node-containers',
        NODE_CONTAINER_LIST.consumes,
      ).executeTest(async (server) => {
        const { node } = recordedPath(SWARM, NODE_CONTAINER_LIST.operationId);
        const { data, error } = await at(server.url, () =>
          NODE_CONTAINER_LIST.fetch(nodeContainersParams(node)),
        );
        expect(error).toBeUndefined();
        // The mock answers each row with the recording's first by type: two rows, as recorded.
        expect(data).toHaveLength(2);
        expect(data?.[0]?.createdAt).toBeTruthy();
        // The recording itself holds one running and healthy row and one exited one, whose last
        // probe (`unhealthy`) the tab does not show.
        const recorded = masters.body<NodeContainer[]>(SWARM, NODE_CONTAINER_LIST.operationId);
        expect(filteredContainers(recorded, 'running')).toHaveLength(1);
        expect(filteredContainers(recorded, 'stopped')).toHaveLength(1);
        expect(recorded.map((row) => containerHealth(row)?.label)).toEqual(['healthy', undefined]);
      }),
  );

  it.skipIf(!listRecorded(NO_CONTAINERS))(
    'show-swarm-node-containers: a node running no containers lists none',
    () =>
      given(
        NO_CONTAINERS,
        NODE_CONTAINER_LIST.operationId,
        'show-swarm-node-containers',
        NODE_CONTAINER_LIST.consumes,
      ).executeTest(async (server) => {
        const { node } = recordedPath(NO_CONTAINERS, NODE_CONTAINER_LIST.operationId);
        const { data, error } = await at(server.url, () =>
          NODE_CONTAINER_LIST.fetch(nodeContainersParams(node)),
        );
        expect(error).toBeUndefined();
        expect(data).toEqual([]);
      }),
  );

  it.skipIf(!listRecorded(REMOTE_NODE))(
    'show-swarm-node-containers: a node other than qits-system’s own is a 409 NODE_REMOTE',
    () =>
      given(
        REMOTE_NODE,
        NODE_CONTAINER_LIST.operationId,
        'show-swarm-node-containers',
        NODE_CONTAINERS_REFUSAL,
      ).executeTest(async (server) => {
        const { node } = recordedPath(REMOTE_NODE, NODE_CONTAINER_LIST.operationId);
        const { error, response } = await at(server.url, () =>
          NODE_CONTAINER_LIST.fetch(nodeContainersParams(node)),
        );
        expect(response?.status).toBe(409);
        expect((error as { code?: string } | undefined)?.code).toBe('NODE_REMOTE');
        expect((error as { message?: string } | undefined)?.message).toBeTruthy();
      }),
  );

  it.skipIf(!isRecorded(SWARM, NODE_CONTAINER_LOGS.operationId, masters))(
    'show-swarm-node-container-logs: a container’s last 200 lines',
    () =>
      given(
        SWARM,
        NODE_CONTAINER_LOGS.operationId,
        'show-swarm-node-container-logs',
        NODE_CONTAINER_LOGS.consumes,
      ).executeTest(async (server) => {
        const { node, container } = recordedPath(SWARM, NODE_CONTAINER_LOGS.operationId);
        const { data, error } = await at(server.url, () =>
          NODE_CONTAINER_LOGS.fetch(containerLogsParams(node, container ?? '')),
        );
        expect(error).toBeUndefined();
        expect(data?.text?.split('\n').filter(Boolean)).toHaveLength(2);
        expect(data?.truncated).toBe(false);
      }),
  );
});
