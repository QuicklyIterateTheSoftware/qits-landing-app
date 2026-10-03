import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../api/maintenance/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { maintenanceGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_PENDING_BUMPS } from './maintenance.consumes';
import { MaintenanceStore } from './maintenance.store';

/**
 * qits-landing-app's pact with qits-maintenance-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-maintenance-service.json`.
 *
 * The store is the only user of the qits-maintenance client, so this file is the whole pact: the
 * bumps menu's list of the newest 20 bumps (`?limit=20`, which the golden master records and the
 * interaction requires). It binds only `LIST_PENDING_BUMPS`, the list the store passes to `consume(...)`.
 *
 * The empty list has an interaction too ("no pending bumps"): the menu's screenshot of it shows
 * that recorded body, and every body a screenshot shows is one the provider verifies.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-maintenance-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(maintenanceClient),
    ],
  });
  maintenanceClient.setConfig({ baseUrl: url });
  return TestBed.inject(MaintenanceStore);
}

describe('qits-landing-app → qits-maintenance-service pact', () => {
  afterAll(() => {
    maintenanceClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-version-bumps: the store holds the pending bumps', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'pending bumps',
      operationId: 'listPendingBumps',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'open-version-bumps' },
      consumes: LIST_PENDING_BUMPS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.pending().length).toBeGreaterThan(0);
      expect(store.pending().every((bump) => (bump.repository ?? '').length > 0)).toBe(true);
    }));

  it('open-version-bumps: the store holds no bumps when none is pending', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'no pending bumps',
      operationId: 'listPendingBumps',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'open-version-bumps' },
      consumes: LIST_PENDING_BUMPS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.pending()).toEqual([]);
    }));
});
