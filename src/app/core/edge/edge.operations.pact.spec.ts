import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as edgeClient } from '../../api/edge/client.gen';
import { provideHeyApiClient } from '../../api/edge/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { edgeGoldenMasters as masters } from '../../../testing/golden-masters';
import { UPSTREAM_POOLS } from './edge.operations';

/**
 * qits-landing-app's pact with qits-edge-service (qits-2220), in
 * `pacts/qits-landing-app_qits-edge-service.json`: the bumps menu's pools section
 * (`edge.operations.ts`), the edge's `getUpstreamPools` in the state `an open upstream pool`. The
 * operation is the only user of the edge's client, so this file is the whole pact.
 *
 * The interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and the test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-edge-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-edge-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(edgeClient),
    ],
  });
  edgeClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction for `op` in `state`, triggered by `interaction`; `op` must be `PROVIDER`'s. */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: op.consumes,
  });
};

describe('qits-landing-app → qits-edge-service pact: the bumps menu’s pools', () => {
  afterAll(() => {
    edgeClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-version-bumps: the upstream pools', () =>
    given(UPSTREAM_POOLS, 'an open upstream pool', 'open-version-bumps').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => UPSTREAM_POOLS.fetch({}));
        const pools = data ?? [];
        expect(pools.length).toBeGreaterThan(0);
        expect(pools.every((pool) => pool.name.length > 0 && pool.open <= pool.max)).toBe(true);
        expect(pools.every((pool) => pool.pool === 'ordinary' || pool.pool === 'stream')).toBe(
          true,
        );
      },
    ));
});
