import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import { getWork, listProjectWork, listWorkMembers } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  DISPATCH_WORK,
  GET_CAMPAIGN_DESCRIPTION,
  LIST_PROJECT_WORK,
  LIST_WORK_MEMBERS,
  SET_WORK_STATUS,
  type WorkEntry,
} from './work.consumes';
import { WorkStore, type DispatchMode, type WorkStatus } from './work.store';

/**
 * `WorkStore`'s part of qits-landing-app's pact with qits-projects-service (epics qits-112,
 * qits-965): the `listProjectWork`, `listWorkMembers`, `setWorkStatus` and `dispatchWork`
 * interactions, and the `getWork` of a campaign's description (`show-project-work-board`; the work
 * item page's `getWork` is `WorkDetailStore`'s), in the same file as `ProjectsStore`'s
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`). Every
 * entity is addressed by its qualified id.
 *
 * Each test drives `load(projectId)`, as the UI interaction named in `interactions.ts` does, against
 * a pact mock server answering with qits-projects' golden master, binding only the fields in
 * `work.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  'listProjectWork',
  'listWorkMembers',
  'setWorkStatus',
  'dispatchWork',
  { operationId: 'getWork', interactions: ['show-project-work-board'] },
];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listProjectWork',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: LIST_PROJECT_WORK,
  });

/** The members read `load` makes for each campaign in the tree. */
const givenCampaign = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listWorkMembers',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: LIST_WORK_MEMBERS,
  });

/** The description read `load` makes for each campaign in the tree. */
const givenDescription = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'getWork',
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-work-board' },
    consumes: GET_CAMPAIGN_DESCRIPTION,
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

/** `state`'s recorded members read of `param`'s campaign, made on its own. */
async function membersOf(url: string, state: string, param = 'campaignQualifiedId') {
  storeAt(url);
  const op = masters.operation(state, 'listWorkMembers');
  const { data } = await TestBed.runInInjectionContext(() =>
    listWorkMembers({ path: { qualifiedId: op.params[param] } }),
  );
  return data?.members ?? [];
}

/** `state`'s project work read on its own (`load` would go on to read each campaign). */
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

  it('show-project-work-board: a campaign’s members, in order', () =>
    givenCampaign('show-project-work-board', 'a campaign with ordered developments').executeTest(
      async (server) => {
        // The same call `load` makes per campaign, made on its own: the mock answers one request.
        const members = await membersOf(server.url, 'a campaign with ordered developments');
        expect(members.length).toBeGreaterThan(0);
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

  it.each([
    'a campaign with work in every phase',
    'a campaign with a done, a verified and an implementing epic',
  ])('show-project-work-board: %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      // The entities read on its own: `load` would go on to read the campaign, which this
      // interaction does not answer (the next one does).
      expect((await workOf(server.url, state)).length).toBeGreaterThan(0);
    }),
  );

  it.each([
    'a campaign with work in every phase',
    'a campaign with a done, a verified and an implementing epic',
  ])('show-project-work-board: the members of %s', (state) =>
    givenCampaign('show-project-work-board', state).executeTest(async (server) => {
      expect((await membersOf(server.url, state)).length).toBeGreaterThan(0);
    }),
  );

  // A campaign's description: each state's recorded `getWork` of its campaign, by the param that
  // names it.
  it.each([
    ['a campaign in detail', 'qualifiedId'],
    ['a campaign with a done, a verified and an implementing epic', 'qualifiedId'],
    ['a campaign with work in every phase', 'campaignQualifiedId'],
    ['a campaign with ordered developments', 'campaignQualifiedId'],
    ['an epic in two campaigns', 'firstCampaignQualifiedId'],
    ['the second campaign of an epic in two campaigns', 'secondCampaignQualifiedId'],
  ])('show-project-work-board: the description of %s', (state, param) =>
    givenDescription(state).executeTest(async (server) => {
      storeAt(server.url);
      const op = masters.operation(state, 'getWork');
      const { data } = await TestBed.runInInjectionContext(() =>
        consume(getWork({ path: { qualifiedId: op.params[param] } }), GET_CAMPAIGN_DESCRIPTION),
      );
      expect(data?.description).toBeTruthy();
    }),
  );

  // The epic card with two campaign tags. A state records one answer per operation, so the second
  // campaign is a state of its own over the same seed.
  it('show-project-work-board: an epic in two campaigns', () =>
    given('show-project-work-board', 'an epic in two campaigns').executeTest(async (server) => {
      // The entities read on its own: `load` would go on to read both campaigns.
      expect((await workOf(server.url, 'an epic in two campaigns')).length).toBeGreaterThan(0);
    }));

  it.each([
    ['an epic in two campaigns', 'firstCampaignQualifiedId'],
    ['the second campaign of an epic in two campaigns', 'secondCampaignQualifiedId'],
  ])('show-project-work-board: the members of %s', (state, param) =>
    givenCampaign('show-project-work-board', state).executeTest(async (server) => {
      expect(await membersOf(server.url, state, param)).toHaveLength(1);
    }),
  );

  it('show-project-work: a project with no work counts zero', () =>
    given('show-project-work', 'a project with no work').executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf('a project with no work');
      await store.load(projectId);
      expect(store.byProject()[projectId]).toEqual({
        status: 'loaded',
        count: 0,
        entries: [],
        campaigns: {},
        campaignDescriptions: {},
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

  // The detail states: the work item page's screenshots, one per archetype and ticket type. Each
  // read on its own: `load` would go on to read the campaign in the tree.
  it.each([
    'an epic in detail',
    'a feature in detail',
    'a task in detail',
    'a bug ticket in detail',
    'an improvement ticket in detail',
    'a maintenance ticket in detail',
    'a campaign in detail',
  ])('show-project-work-board: the work of %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      expect((await workOf(server.url, state)).length).toBeGreaterThan(0);
    }),
  );

  // Their campaign's read, where the state recorded it. The other detail states share the seed and
  // its frozen ids, so their page answers the campaign from "a campaign in detail".
  it.each([
    'an epic in detail',
    'a bug ticket in detail',
    'an improvement ticket in detail',
    'a campaign in detail',
  ])('show-project-work-board: the campaign of %s', (state) =>
    givenCampaign('show-project-work-board', state).executeTest(async (server) => {
      expect((await membersOf(server.url, state)).length).toBeGreaterThan(0);
    }),
  );

  it.each([
    ['finish-epic', 'a verified epic', 'EPIC'],
    ['finish-ticket', 'a verified ticket', 'TICKET'],
  ] as const)('%s: the finish button moves %s to DONE', (slug, state, archetype) =>
    givenMove(slug, state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, qualifiedId, projectId } = movedIn(state, 'setWorkStatus');
      const entry = { id, qualifiedId, archetype, status: 'VERIFIED' } as WorkEntry;
      await store.finish(projectId, entry);
      // No finish state left means the answer carried a status.
      expect(store.finishing()[id]).toBeUndefined();
    }),
  );

  // One recorded move per status: each state's entity moved once, by the registry's moves.
  it.each([
    'a reported ticket',
    'a refined ticket',
    'a ready for dev ticket',
    'an implementing ticket',
    'an implemented ticket',
    'a verifying ticket',
    'a verified ticket',
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
