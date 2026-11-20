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
import {
  EVENT_CHILDREN,
  EVENT_NAMES,
  PROJECT_EVENT,
  PROJECT_EVENTS_LIST,
  RECENT_EVENTS_LIST,
} from './events.operations';
import { NO_FILTER, projectEventsQuery } from './project-events';

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
 * A project's Events page (qits-2312) reads its events (`PROJECT_EVENTS_LIST`, the query
 * `projectEventsQuery` builds: `attr=projectid=<id>&order=desc&limit=50`, plus `name` once types
 * are chosen) in the states "a project with recent events", "…, filtered by name" and "a project
 * with no events", and the type filter's choices (`EVENT_NAMES`) in "events of two names". The
 * project id in the query is the state's `projectId`, a provider-state expression.
 *
 * An event's page (qits-2338) reads the event by its id (`PROJECT_EVENT`, `getEvent`): an event
 * of the project with a cause and two effects ("an event of a project with a cause and effects",
 * `show-project-event`) and an id qits-events does not hold ("no event with the given id", a 404
 * binding the status only: the page reads nothing of the body). Its chain (`walk-project-event-chain`)
 * reads the cause by its id ("the cause of a project event") and each node's effects
 * (`EVENT_CHILDREN`, `listEvents?parentId=`): the cause's (the event), the event's (its two
 * effects) and a leaf's ("an event of a project with no effects", none). Each id is the state's own
 * param.
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

/** The project the "a project with recent events" states record (their `projectId` param). */
const PROJECT_ID = '00000000-0000-4000-8000-000000000005';
/** The project "a project with no events" records. */
const EMPTY_PROJECT_ID = '00000000-0000-4000-8000-000000000001';

/** The states an event's page and its chain read (qits-2338). */
const WITH_CAUSE = 'an event of a project with a cause and effects';
const CAUSE = 'the cause of a project event';
const LEAF = 'an event of a project with no effects';
const NO_EVENT = 'no event with the given id';

/** `state`'s `param` of `operationId`'s recording. */
const param = (state: string, operationId: string, name: string): string =>
  masters.operation(state, operationId).params[name];

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

  it('show-project-events: the project’s newest events, its own only', () =>
    given(PROJECT_EVENTS_LIST, 'a project with recent events', 'show-project-events').executeTest(
      async (server) => {
        const query = projectEventsQuery(PROJECT_ID, NO_FILTER, Date.now());
        const { data } = await at(server.url, () => PROJECT_EVENTS_LIST.fetch({ query }));
        const events = data?.events ?? [];
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((event) => (event.payload ?? '').includes(PROJECT_ID))).toBe(true);
        expect(data?.nextCursor).toBeNull();
      },
    ));

  it('filter-project-events: the project’s events of the chosen type', () =>
    given(
      PROJECT_EVENTS_LIST,
      'a project with recent events, filtered by name',
      'filter-project-events',
    ).executeTest(async (server) => {
      const names = ['ReleaseRequestStateChanged'];
      const query = projectEventsQuery(PROJECT_ID, { ...NO_FILTER, names }, Date.now());
      const { data } = await at(server.url, () => PROJECT_EVENTS_LIST.fetch({ query }));
      const events = data?.events ?? [];
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.name === 'ReleaseRequestStateChanged')).toBe(true);
    }));

  it('show-project-events: an empty list when the project has no events', () =>
    given(PROJECT_EVENTS_LIST, 'a project with no events', 'show-project-events').executeTest(
      async (server) => {
        const query = projectEventsQuery(EMPTY_PROJECT_ID, NO_FILTER, Date.now());
        const { data } = await at(server.url, () => PROJECT_EVENTS_LIST.fetch({ query }));
        expect(data?.events).toEqual([]);
      },
    ));

  it('show-event-names: every stored event name', () =>
    given(EVENT_NAMES, 'events of two names', 'show-event-names').executeTest(async (server) => {
      const { data } = await at(server.url, () => EVENT_NAMES.fetch({}));
      expect(data?.names?.length).toBeGreaterThan(0);
    }));

  it('show-project-event: an event of the project, with its cause', () =>
    given(PROJECT_EVENT, WITH_CAUSE, 'show-project-event').executeTest(async (server) => {
      const id = param(WITH_CAUSE, 'getEvent', 'eventId');
      const { data, error } = await at(server.url, () => PROJECT_EVENT.fetch({ path: { id } }));
      expect(error).toBeUndefined();
      expect(data?.event?.id).toBe(id);
      expect(data?.event?.parentId).toBe(param(WITH_CAUSE, 'getEvent', 'causeId'));
      expect(data?.event?.payload).toContain(param(WITH_CAUSE, 'getEvent', 'projectId'));
    }));

  it('show-project-event: an event qits-events does not hold is a 404', () =>
    // The page reads nothing of a 404's body: the interaction binds the status only.
    given({ ...PROJECT_EVENT, consumes: [] }, NO_EVENT, 'show-project-event').executeTest(
      async (server) => {
        const id = param(NO_EVENT, 'getEvent', 'eventId');
        const { data, response } = await at(server.url, () =>
          PROJECT_EVENT.fetch({ path: { id } }),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(404);
      },
    ));

  it('walk-project-event-chain: the cause, by its id', () =>
    given(PROJECT_EVENT, CAUSE, 'walk-project-event-chain').executeTest(async (server) => {
      const id = param(CAUSE, 'getEvent', 'eventId');
      const { data } = await at(server.url, () => PROJECT_EVENT.fetch({ path: { id } }));
      expect(data?.event?.id).toBe(id);
      expect(data?.event?.parentId).toBeFalsy();
    }));

  it('walk-project-event-chain: what the cause caused', () =>
    given(EVENT_CHILDREN, CAUSE, 'walk-project-event-chain').executeTest(async (server) => {
      const parentId = param(CAUSE, 'listEvents', 'eventId');
      const { data } = await at(server.url, () => EVENT_CHILDREN.fetch({ query: { parentId } }));
      const events = data?.events ?? [];
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.parentId === parentId)).toBe(true);
    }));

  it('walk-project-event-chain: what the event caused', () =>
    given(EVENT_CHILDREN, WITH_CAUSE, 'walk-project-event-chain').executeTest(async (server) => {
      const parentId = param(WITH_CAUSE, 'listEvents', 'eventId');
      const { data } = await at(server.url, () => EVENT_CHILDREN.fetch({ query: { parentId } }));
      const events = data?.events ?? [];
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.parentId === parentId)).toBe(true);
    }));

  it('walk-project-event-chain: an event that caused nothing', () =>
    given(EVENT_CHILDREN, LEAF, 'walk-project-event-chain').executeTest(async (server) => {
      const parentId = param(LEAF, 'listEvents', 'eventId');
      const { data } = await at(server.url, () => EVENT_CHILDREN.fetch({ query: { parentId } }));
      expect(data?.events).toEqual([]);
    }));

  it('open-notifications: an empty list when there are no events', () =>
    given(RECENT_EVENTS_LIST, 'no events', 'open-notifications').executeTest(async (server) => {
      const { data } = await at(server.url, () => RECENT_EVENTS_LIST.fetch(NEWEST));
      expect(data?.events).toEqual([]);
    }));
});
