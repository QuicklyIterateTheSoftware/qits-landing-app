import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as eventsClient } from '../../api/events/client.gen';
import { provideHeyApiClient } from '../../api/events/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { eventsGoldenMasters as masters } from '../../../testing/golden-masters';
import { RECENT_EVENTS } from './events.consumes';
import { RECENT_EVENTS_LIST } from './events.operations';

/**
 * qits-landing-app's pact with qits-events-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-events-service.json`: the notifications menu's operation
 * (`events.operations.ts`, qits-2146), the newest 20 (`?limit=20`, which the golden master records
 * and the interaction requires). The operation is the only user of the qits-events client, so this
 * file is the whole pact. Moved here from `events.store.pact.spec.ts` with `EventsStore`,
 * unchanged.
 *
 * The empty list has an interaction too ("no events"): the menu's screenshot of it shows that
 * recorded body, and every body a screenshot shows is one the provider verifies.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`
 * against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-events-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-events-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(eventsClient),
    ],
  });
  eventsClient.setConfig({ baseUrl: url });
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

/** The menu's request: the newest {@link RECENT_EVENTS}. */
const NEWEST = { query: { limit: String(RECENT_EVENTS) } };

describe('qits-landing-app → qits-events-service pact: the notifications menu’s operation', () => {
  afterAll(() => {
    eventsClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('open-notifications: the newest events', () =>
    given(RECENT_EVENTS_LIST, 'a few recent events', 'open-notifications').executeTest(
      async (server) => {
        const { data } = await at(server.url, () => RECENT_EVENTS_LIST.fetch(NEWEST));
        const events = data?.events ?? [];
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((event) => (event.name ?? '').length > 0)).toBe(true);
      },
    ));

  it('open-notifications: an empty list when there are no events', () =>
    given(RECENT_EVENTS_LIST, 'no events', 'open-notifications').executeTest(async (server) => {
      const { data } = await at(server.url, () => RECENT_EVENTS_LIST.fetch(NEWEST));
      expect(data?.events).toEqual([]);
    }));
});
