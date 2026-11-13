import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../api/maintenance/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { maintenanceGoldenMasters as masters } from '../../../testing/golden-masters';
import { PENDING_BUMPS } from './maintenance.consumes';
import { PENDING_BUMPS_LIST } from './maintenance.operations';

/**
 * qits-landing-app's pact with qits-maintenance-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-maintenance-service.json`: the bumps menu's operation
 * (`maintenance.operations.ts`, qits-2146), the newest 20 bumps (`?limit=20`, which the golden
 * master records and the interaction requires). The operation is the only user of the
 * qits-maintenance client, so this file is the whole pact. Moved here from
 * `maintenance.store.pact.spec.ts` with `MaintenanceStore`, unchanged.
 *
 * The empty list has an interaction too ("no pending bumps"): the menu's screenshot of it shows
 * that recorded body, and every body a screenshot shows is one the provider verifies.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-maintenance-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-maintenance-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(maintenanceClient),
    ],
  });
  maintenanceClient.setConfig({ baseUrl: url });
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

/** The menu's request: the newest {@link PENDING_BUMPS}. */
const NEWEST = { query: { limit: PENDING_BUMPS } };

describe('qits-landing-app → qits-maintenance-service pact: the bumps menu’s operation', () => {
  afterAll(() => {
    maintenanceClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-version-bumps: the pending bumps', () =>
    given(PENDING_BUMPS_LIST, 'pending bumps', 'open-version-bumps').executeTest(async (server) => {
      const { data } = await at(server.url, () => PENDING_BUMPS_LIST.fetch(NEWEST));
      const bumps = data?.bumps ?? [];
      expect(bumps.length).toBeGreaterThan(0);
      expect(bumps.every((bump) => (bump.repository ?? '').length > 0)).toBe(true);
    }));

  it('open-version-bumps: no bumps when none is pending', () =>
    given(PENDING_BUMPS_LIST, 'no pending bumps', 'open-version-bumps').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => PENDING_BUMPS_LIST.fetch(NEWEST));
        expect(data?.bumps).toEqual([]);
      },
    ));
});
