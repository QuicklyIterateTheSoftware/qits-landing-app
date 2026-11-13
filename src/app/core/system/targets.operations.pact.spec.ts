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
import { targetOf } from './targets';
import { TARGET_LIST } from './targets.operations';

/**
 * qits-landing-app's pact with qits-system-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-system-service.json`.
 *
 * `TARGET_LIST` is the only read of the qits-system client, so this file is the whole pact: the
 * lightning menu's list of execution targets. Moved here from `TargetsStore`'s pact spec when the
 * store went (qits-2146), unchanged: the same description, state, request and bound fields; the test
 * runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-system-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

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

describe('qits-landing-app → qits-system-service pact', () => {
  afterAll(() => {
    systemClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
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
});
