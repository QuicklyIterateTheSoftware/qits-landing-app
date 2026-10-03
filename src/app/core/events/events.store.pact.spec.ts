import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as eventsClient } from '../../api/events/client.gen';
import { provideHeyApiClient } from '../../api/events/client/client.gen';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { eventsGoldenMasters as masters } from '../../../testing/golden-masters';
import { LIST_EVENTS } from './events.consumes';
import { EventsStore } from './events.store';

/**
 * qits-landing-app's pact with qits-events-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-events-service.json`.
 *
 * The store is the only user of the qits-events client, so this file is the whole pact: the
 * notifications menu's list of the newest 20 (`?limit=20`, which the golden master records and the
 * interaction requires). It binds only `LIST_EVENTS`, the list the store passes to `consume(...)`.
 *
 * The empty list has an interaction too ("no events"): the menu's screenshot of it shows that
 * recorded body, and every body a screenshot shows is one the provider verifies.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-events-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** A store on a server platform, its client pointed at the mock server. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(eventsClient),
    ],
  });
  eventsClient.setConfig({ baseUrl: url });
  return TestBed.inject(EventsStore);
}

describe('qits-landing-app → qits-events-service pact', () => {
  afterAll(() => {
    eventsClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-notifications: the store lists the newest events', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'a few recent events',
      operationId: 'listEvents',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'open-notifications' },
      consumes: LIST_EVENTS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.recent().length).toBeGreaterThan(0);
      expect(store.recent().every((event) => (event.name ?? '').length > 0)).toBe(true);
    }));

  it('open-notifications: the store holds an empty list when there are no events', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'no events',
      operationId: 'listEvents',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'open-notifications' },
      consumes: LIST_EVENTS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      await store.load();
      expect(store.status()).toBe('loaded');
      expect(store.recent()).toEqual([]);
    }));
});
