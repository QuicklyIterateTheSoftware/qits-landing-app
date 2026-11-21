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
import { CONNECTED_WITH_LEASES } from '../../../testing/system-states';
import { TARGET_LEASES } from './leases.operations';

/**
 * The leases' part of qits-landing-app's pact with qits-system-service (qits-2351,
 * `leases.operations.ts`), in `pacts/qits-landing-app_qits-system-service.json` — the same file
 * `targets.operations.pact.spec.ts` and `swarm.operations.pact.spec.ts` own their parts of
 * (`assertPactPart`).
 *
 * A target's card on the Targets page lists its leases (`show-target-leases`,
 * `listLeases?targetId=`) in "a connected target with leases" (a CI and a WORKSPACE lease, both
 * RUNNING), which skips itself until the `@qits/system-golden-masters` pin records the filtered
 * read. The test runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = ['listLeases'];

/** The filtered read is recorded (a later pin than 2026.1120.213800): else this spec writes none. */
const RECORDED = isRecorded(CONNECTED_WITH_LEASES, 'listLeases', masters);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-leases-pact-'));
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

describe('qits-landing-app → qits-system-service pact: the leases', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
    try {
      // With its one interaction skipped the run writes no pact, and the committed file holds no
      // part of this spec's to compare.
      if (RECORDED) {
        assertPactPart(
          join(dir, `${CONSUMER}-${PROVIDER}.json`),
          COMMITTED,
          OPERATIONS,
          'QITS_GOLDEN_UPDATE',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('declares the provider this spec binds', () => {
    expect(TARGET_LEASES.provider).toBe(PROVIDER);
  });

  it.skipIf(!RECORDED)('show-target-leases: a target’s card lists the leases it holds', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: CONNECTED_WITH_LEASES,
      operationId: TARGET_LEASES.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-target-leases' },
      consumes: TARGET_LEASES.consumes,
    }).executeTest(async (server) => {
      const targetId = masters.operation(CONNECTED_WITH_LEASES, 'listLeases').params['targetId'];
      const { data, error } = await at(server.url, () =>
        TARGET_LEASES.fetch({ query: { targetId } }),
      );
      expect(error).toBeUndefined();
      // The mock answers each row with the recording's first by type: two leases, RUNNING.
      const leases = data ?? [];
      expect(leases).toHaveLength(2);
      expect(leases.every((lease) => lease.state === 'RUNNING')).toBe(true);
    }),
  );
});
