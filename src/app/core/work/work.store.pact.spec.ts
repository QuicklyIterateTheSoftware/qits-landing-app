import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, type GoldenMasters } from '@qits/angular/testing';
import { listProjectWork } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import {
  heldBy,
  isRecorded,
  NEEDS_STATE,
  projectsGoldenMasters as masters,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { DISPATCH_WORK, LIST_PROJECT_WORK, SET_WORK_STATUS, type WorkEntry } from './work.consumes';
import { WorkStore, type DispatchMode, type WorkStatus } from './work.store';

/**
 * `WorkStore`'s part of qits-landing-app's pact with qits-projects-service (epics qits-112,
 * qits-965): the `listProjectWork`, `setWorkStatus` and `dispatchWork` interactions, in the same
 * file as `ProjectsStore`'s (`pacts/qits-landing-app_qits-projects-service.json`, see
 * `src/testing/pact-part.ts`). Every entity is addressed by its qualified id.
 *
 * Each test drives `load(projectId)`, as the UI interaction named in `interactions.ts` does, against
 * a pact mock server answering with qits-projects' golden master, binding only the fields in
 * `work.consumes.ts` that the state's recording holds (`heldBy`).
 *
 * Epic qits-1899 retires campaigns, milestones and dependsOn: no interaction reads a campaign's
 * members or description, a milestone, or a campaign state, and the "… in detail" states' work is
 * open-ended (`openEndedWork`), because qits-1908 removes the CAMPAIGN row and the dependsOn edges
 * from their shared seed. What an item needs (`needs[]`) is bound in `NEEDS_STATE` only, and open
 * there too: every other state records it empty, which would pin it empty.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = ['listProjectWork', 'setWorkStatus', 'dispatchWork'];

/** {@link LIST_PROJECT_WORK} without the need rows: what a state that records no need binds. */
const WITHOUT_NEED_ROWS = LIST_PROJECT_WORK.filter((path) => !path.includes('.needs[]'));

/** The work item page's states, one per archetype and ticket type, over one shared seed. */
const DETAIL_STATES = [
  'an epic in detail',
  'a feature in detail',
  'a task in detail',
  'a bug ticket in detail',
  'an improvement ticket in detail',
  'a maintenance ticket in detail',
];

/** One pact matcher spec, e.g. `{ match: 'type', min: 0 }`. */
interface Matcher {
  readonly match: string;
  min?: number;
  max?: number;
  variants?: { index: number; readonly rules: Rules }[];
}
type Rules = Record<string, { readonly combine: string; matchers: Matcher[] }>;
type Entity = Record<string, unknown>;
interface WrittenPact {
  readonly interactions: readonly {
    readonly providerStates?: readonly { readonly name: string }[];
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly body?: { readonly content?: { entities?: Entity[] } };
      readonly matchingRules?: { readonly body?: Rules };
    };
  }[];
}

/** Matches an array by type, any length: `min` 0, no `max`. */
const ANY_LENGTH = (): Rules[string] => ({ combine: 'AND', matchers: [{ match: 'type', min: 0 }] });

/** A value's shape as `addGoldenInteraction` groups elements: its keys and their types. */
function shape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(shape).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Entity).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${shape(v)}`).join(',')}}`;
  }
  return typeof value;
}

/** `entity` cut to the keys of `like`. */
const cut = (entity: Entity, like: Entity): Entity =>
  Object.fromEntries(Object.keys(like).map((key) => [key, entity[key]]));

/**
 * Loosens what the committed pact asks of `listProjectWork` (epic qits-1899), between the mock
 * server answering (with the real recording) and `assertPactPart`:
 *
 * - **No CAMPAIGN example.** Wherever an `entities` example element is a CAMPAIGN (the "… in
 *   detail" seed's first root), it is replaced by an entity of the same recording with the same
 *   shape, so the provider can delete the CAMPAIGN rows (qits-1908); an element no other entity
 *   shares a shape with is dropped, with its `arrayContains` variant.
 * - **The "… in detail" states' `entities`, any length**: an `arrayContains` pins no length
 *   already; a `type` match drops its `min` and `max` (min 0), as qits-1908 shortens that seed.
 * - **`needs`, any length**, on every entity that carries it (`NEEDS_STATE` only: no other state
 *   binds it): an item's needs grow and shrink with the seed.
 */
function openEndedWork(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as WrittenPact;
  for (const interaction of written.interactions) {
    if (interaction.comments?.references?.['qits-call']?.operationId !== 'listProjectWork') {
      continue;
    }
    const state = interaction.providerStates?.[0]?.name ?? '';
    const content = interaction.response.body?.content;
    const rules = interaction.response.matchingRules?.body;
    const examples = content?.entities;
    if (!examples || !rules) continue;
    const rule = rules['$.entities'];
    const contains = rule?.matchers.find((m) => m.match === 'arrayContains');
    const recorded = masters
      .body<{ entities: Entity[] }>(state, 'listProjectWork')
      .entities.filter((e) => e['archetype'] !== 'CAMPAIGN');
    for (let i = examples.length - 1; i >= 0; i--) {
      const example = examples[i];
      if (example['archetype'] !== 'CAMPAIGN') continue;
      const twin = recorded.map((e) => cut(e, example)).find((e) => shape(e) === shape(example));
      if (twin) {
        examples[i] = twin;
      } else if (contains?.variants) {
        examples.splice(i, 1);
        contains.variants = contains.variants
          .filter((v) => v.index !== i)
          .map((v) => ({ ...v, index: v.index > i ? v.index - 1 : v.index }));
      } else {
        throw new Error(`${state}: a CAMPAIGN example no other entity stands in for`);
      }
    }
    if (DETAIL_STATES.includes(state)) {
      const typed = rule?.matchers.find((m) => m.match === 'type');
      if (typed) {
        typed.min = 0;
        delete typed.max;
      }
    }
    if (contains?.variants) {
      for (const variant of contains.variants) {
        if (Array.isArray(examples[variant.index]?.['needs']))
          variant.rules['$.needs'] = ANY_LENGTH();
      }
    } else if (examples.some((e) => Array.isArray(e['needs']))) {
      rules['$.entities[*].needs'] = ANY_LENGTH();
    }
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listProjectWork',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: heldBy(
      masters,
      state,
      'listProjectWork',
      state === NEEDS_STATE ? LIST_PROJECT_WORK : WITHOUT_NEED_ROWS,
    ),
  });

/** A move through the status door: `finish`'s move to DONE, or a Status action's. */
const givenMove = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'setWorkStatus',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: SET_WORK_STATUS,
  });

/**
 * **A drop's move, which no golden master records yet** (qits-248). The service's own recording of
 * a drop with an outcome arrives with the release that makes `outcome` required, and this app
 * releases before it — so the drop is composed here from a recorded move (`RECORDED_MOVE`'s, the
 * same door, method, path and status) with the drop's own request body and the target's word
 * (`DROPPED`) in the answer.
 *
 * Only the REQUEST carries the new fields; the interaction's `consumes` (passed by the caller,
 * `SET_WORK_STATUS`) still binds `status` alone, so the provider deployed today — which ignores the
 * unknown body fields and answers the move as it always did — satisfies this interaction as well as
 * the next one. `supersededBy`, where given, is a param of `RECORDED_MOVE`'s own seed (never the
 * dropped item itself), so the provider's verification resolves it against an entity that exists.
 */
const RECORDED_MOVE = 'a reported ticket';
const dropOf = (state: string, body: Readonly<Record<string, string>>): GoldenMasters => ({
  operation: (s, operationId) => {
    if (s !== state || operationId !== 'setWorkStatus') return masters.operation(s, operationId);
    const move = masters.operation(RECORDED_MOVE, 'setWorkStatus');
    const params =
      state === RECORDED_MOVE ? move.params : masters.operation(state, 'getWork').params;
    return { ...move, state, params, body: { ...body } };
  },
  body: (s, operationId) =>
    s === state && operationId === 'setWorkStatus'
      ? { ...masters.body(RECORDED_MOVE, 'setWorkStatus'), status: body['target'] }
      : masters.body(s, operationId),
});

/** A dispatch press: Dispatch (`FLOW`) or the next phase's button (`PHASE`). */
const givenDispatch = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'dispatchWork',
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'dispatch-work-item' },
    consumes: DISPATCH_WORK,
  });

/** The entity a move or dispatch state names: its id, its qualified id and its project. */
function movedIn(state: string, operationId: string) {
  const { params, body } = masters.operation(state, operationId);
  const id = params['epicId'] ?? params['ticketId'];
  const qualifiedId = params['qualifiedId'];
  return { id, qualifiedId, projectId: params['projectId'], body: body as Record<string, string> };
}

/** A store whose client talks to the mock server through a real HttpClient. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(WorkStore);
}

const projectOf = (state: string) =>
  masters.operation(state, 'listProjectWork').params['projectId'];

/** `state`'s project work read on its own, as `load` makes it. */
async function workOf(url: string, state: string) {
  storeAt(url);
  const project = projectOf(state);
  const { data } = await TestBed.runInInjectionContext(() =>
    listProjectWork({ path: { project } }),
  );
  return data?.entities ?? [];
}

describe('qits-landing-app → qits-projects-service pact: work', () => {
  afterAll(() => {
    projectsClient.setConfig({ baseUrl: '' });
    try {
      openEndedWork(join(dir, `${CONSUMER}-${PROVIDER}.json`));
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

  it('show-project-work: the store loads a project’s work', () =>
    given('show-project-work', 'a project with refined work').executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('a project with refined work');
      await store.load(projectId);
      // The pact binds the entities' fields by type, not by value, so the mock answers with the
      // recorded example repeated; which statuses count is the plain spec's business.
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    }));

  it('show-project-work-board: the Work page lays out work in every status', () =>
    given('show-project-work-board', 'a project with work in every status').executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const projectId = projectOf('a project with work in every status');
        await store.load(projectId);
        expect(store.byProject()[projectId]?.status).toBe('loaded');
      },
    ));

  it('show-project-work-board: an epic with features and tasks', () =>
    given('show-project-work-board', 'an epic with features and tasks').executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const projectId = projectOf('an epic with features and tasks');
        await store.load(projectId);
        expect(store.byProject()[projectId]?.status).toBe('loaded');
      },
    ));

  // The card screenshots' states (`epic-card`, `ticket-card`, the list items, `epic-board`).
  it.each([
    'a ticket of every type',
    'a verified epic with every task implemented',
    'a done epic with every task implemented',
    'an epic with tasks in every status',
    'an epic with a feature whose tasks are all verified',
    'an epic with a verified feature whose tasks are all verified',
    'an implementing epic with features in mixed statuses',
  ])('show-project-work-board: %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf(state);
      await store.load(projectId);
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    }),
  );

  it('show-project-work-board: work ranked by priority, and work nobody ranked', () =>
    given('show-project-work-board', 'three reported tickets, one with a priority').executeTest(
      async (server) => {
        const store = storeAt(server.url);
        const projectId = projectOf('three reported tickets, one with a priority');
        await store.load(projectId);
        expect(store.byProject()[projectId]?.status).toBe('loaded');
      },
    ));

  // The Acceptance page's wrapper closings (qits-1873): the five VERIFIED tickets the state's
  // `listWrapperClosings` names, one per verdict, and a REFINED one.
  it('show-project-work-board: a project with VERIFIED tickets in every wrapper verdict', () => {
    const state = 'a project with VERIFIED tickets in every wrapper verdict';
    return given('show-project-work-board', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf(state);
      await store.load(projectId);
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    });
  });

  it('show-project-work: the work of the first of two projects', () =>
    given('show-project-work', 'two projects exist').executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('two projects exist');
      await store.load(projectId);
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    }));

  it('show-project-work: a project with no work counts zero', () =>
    given('show-project-work', 'a project with no work').executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('a project with no work');
      await store.load(projectId);
      expect(store.byProject()[projectId]).toEqual({
        status: 'loaded',
        count: 0,
        entries: [],
      });
    }));

  // The work item page reads each item's own state and its project's work (`work-item.page`).
  it.each(['an implemented ticket'])('show-project-work-board: the work of %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf(state);
      await store.load(projectId);
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    }),
  );

  // The detail states: the work item page's screenshots, one per archetype and ticket type. Their
  // work is open-ended in the committed pact (`openEndedWork`).
  it.each(DETAIL_STATES)('show-project-work-board: the work of %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      expect((await workOf(server.url, state)).length).toBeGreaterThan(0);
    }),
  );

  // What an item needs (epic qits-1899): a ticket needing another ticket, not met, beside the work
  // it needs. Recorded by qits-projects from 2026.1106.140436 on: until the pin reaches it, the test
  // skips itself and the committed pact holds no such interaction.
  it.skipIf(!isRecorded(NEEDS_STATE, 'listProjectWork'))(
    'show-project-work-board: the needs of a ticket that needs another',
    () =>
      given('show-project-work-board', NEEDS_STATE).executeTest(async (server) => {
        const entries = await workOf(server.url, NEEDS_STATE);
        const waiting = entries.find((e) => (e.unmetNeeds ?? 0) > 0);
        expect(waiting?.needs?.[0]?.qualifiedId).toBeTruthy();
        expect(waiting?.needs?.[0]?.met).toBe(false);
      }),
  );

  // A ticket has no finish button: qits-projects-service refuses any caller's move of a TICKET to
  // DONE (qits-150), and the platform sets it itself once the workspace's wrapper release request
  // is finalized. Only the epic still finishes by hand.
  it.each([['finish-epic', 'a verified epic', 'EPIC']] as const)(
    '%s: the finish button moves %s to DONE',
    (slug, state, archetype) =>
      givenMove(slug, state).executeTest(async (server) => {
        const store = storeAt(server.url);
        const { id, qualifiedId, projectId } = movedIn(state, 'setWorkStatus');
        const entry = { id, qualifiedId, archetype, status: 'VERIFIED' } as WorkEntry;
        await store.finish(projectId, entry);
        // No finish state left means the answer carried a status.
        expect(store.finishing()[id]).toBeUndefined();
      }),
  );

  // One recorded move per status: each state's entity moved once, by the registry's moves. A
  // verified ticket is left out: its only recorded move targets DONE, and qits-projects-service
  // refuses every caller's move of a TICKET to DONE (qits-150) — `workActions` never offers it, so
  // there is no Status action left to exercise here.
  it.each([
    'a reported ticket',
    'a refined ticket',
    'a ready for dev ticket',
    'an implementing ticket',
    'an implemented ticket',
    'a verifying ticket',
    'a dropped ticket',
    'a reported epic',
    'a refined epic',
    'a ready for dev epic',
    'an implementing epic',
    'an implemented epic',
    'a verifying epic',
    'a verified epic',
    'a dropped epic',
  ])('move-work-item: a Status action moves %s', (state) =>
    givenMove('move-work-item', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, qualifiedId, projectId, body } = movedIn(state, 'setWorkStatus');
      const entry = { id, qualifiedId } as WorkEntry;
      await store.transition(projectId, entry, body['target'] as WorkStatus);
      expect(store.transitioning()[id]).toBeUndefined();
    }),
  );

  // The Drop form's Confirm (qits-248): the move carries an outcome and, where it needs one, a
  // reference. No golden master records a drop with an outcome yet (`dropOf`'s header), so these
  // two compose one from a recorded move instead of `givenMove`.
  it('drop-work-item: a reported ticket dropped as WONT_DO, no reference', () => {
    const drop = dropOf(RECORDED_MOVE, { target: 'DROPPED', outcome: 'WONT_DO' });
    return addGoldenInteraction(pact, drop, {
      provider: PROVIDER,
      state: RECORDED_MOVE,
      operationId: 'setWorkStatus',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'drop-work-item' },
      consumes: SET_WORK_STATUS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, qualifiedId, projectId } = movedIn(RECORDED_MOVE, 'setWorkStatus');
      const entry = { id, qualifiedId } as WorkEntry;
      const result = await store.drop(projectId, entry, 'WONT_DO');
      expect(result.status).toBe('DROPPED');
      expect(store.transitioning()[id]).toBeUndefined();
    });
  });

  it('drop-work-item: a ticket dropped as DUPLICATE, with its reference', () => {
    const state = 'an improvement ticket in detail';
    const supersededBy = masters.operation(state, 'getWork').params['bugTicketId'];
    const drop = dropOf(state, { target: 'DROPPED', outcome: 'DUPLICATE', supersededBy });
    return addGoldenInteraction(pact, drop, {
      provider: PROVIDER,
      state,
      operationId: 'setWorkStatus',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'drop-work-item' },
      consumes: SET_WORK_STATUS,
    }).executeTest(async (server) => {
      const store = storeAt(server.url);
      const params = drop.operation(state, 'setWorkStatus').params;
      const entry = {
        id: params['improvementTicketId'],
        qualifiedId: params['qualifiedId'],
      } as WorkEntry;
      const result = await store.drop(params['projectId'], entry, 'DUPLICATE', supersededBy);
      expect(result.status).toBe('DROPPED');
    });
  });

  // The Schedule tab's Schedule: the ticked REFINED epics and tickets to READY_FOR_DEV, all at once,
  // with the viewer's session (qits-887). Unscheduling (READY_FOR_DEV back to REFINED) is the same
  // door; no state records that move yet, so no interaction pins it.
  it.each([
    ['a refined epic', 'EPIC'],
    ['a refined ticket', 'TICKET'],
  ] as const)('schedule-work: Schedule moves %s to READY_FOR_DEV', (state, archetype) =>
    givenMove('schedule-work', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, qualifiedId, projectId, body } = movedIn(state, 'setWorkStatus');
      expect(body['target']).toBe('READY_FOR_DEV');
      const entry = { id, qualifiedId, archetype, status: 'REFINED' } as WorkEntry;
      await store.transitionAll(projectId, [entry], 'READY_FOR_DEV');
      expect(store.transitioning()[id]).toBeUndefined();
      expect(store.refusals()).toEqual({});
    }),
  );

  it.each([
    'a reported epic',
    'a ready for dev epic',
    'a ready for dev ticket',
    'an implemented ticket',
  ])('dispatch-work-item: a dispatch press for %s', (state) =>
    givenDispatch(state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, qualifiedId, body } = movedIn(state, 'dispatchWork');
      await store.dispatch({ id, qualifiedId } as WorkEntry, body['mode'] as DispatchMode);
      expect(store.dispatching()[id]).toBeUndefined();
      expect(store.dispatched()[id]).toBeTruthy();
    }),
  );
});
