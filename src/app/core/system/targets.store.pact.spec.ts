import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as systemClient } from '../../api/system/client.gen';
import { provideHeyApiClient } from '../../api/system/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { systemGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_TARGETS } from './targets.consumes';
import { TargetsStore } from './targets.store';

/**
 * qits-landing-app's pact with qits-system-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-system-service.json`.
 *
 * The store is the only user of the qits-system client, so this file is the whole pact: the
 * lightning menu's list of execution targets. It binds only `LIST_TARGETS`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(systemClient),
    ],
  });
  systemClient.setConfig({ baseUrl: url });
  return TestBed.inject(TargetsStore);
}

describe('qits-landing-app → qits-system-service pact', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-runner-slots: the store holds the targets', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'a declared target',
      operationId: 'listTargets',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-runner-slots' },
      consumes: LIST_TARGETS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.targets().length).toBe(1);
      expect(store.targets()[0].slotsTotal).toBeGreaterThan(0);
      expect(Object.keys(store.targets()[0].used ?? {}).sort()).toEqual([
        'ci',
        'desk',
        'workspace',
      ]);
    }));
});
