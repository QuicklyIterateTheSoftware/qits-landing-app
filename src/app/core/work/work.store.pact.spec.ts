import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { getCampaign, listProjectEntities } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import {
  DISPATCH_ENTITY,
  GET_CAMPAIGN,
  LIST_PROJECT_ENTITIES,
  MOVE_ENTITY_STATUS,
  type WorkEntry,
} from './work.consumes';
import { WorkStore, type DispatchMode, type WorkStatus } from './work.store';

/**
 * `WorkStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-112): the
 * `listProjectEntities`, `getCampaign`, `moveEntityStatus` and `dispatchEntity` interactions, in the same file as `ProjectsStore`'s
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * Each test drives `load(projectId)`, as the UI interaction named in `interactions.ts` does, against
 * a pact mock server answering with qits-projects' golden master, binding only the fields in
 * `work.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listProjectEntities', 'getCampaign', 'moveEntityStatus', 'dispatchEntity'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'listProjectEntities',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: LIST_PROJECT_ENTITIES,
  });

/** The campaign read `load` makes for each campaign in the tree. */
const givenCampaign = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'getCampaign',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: GET_CAMPAIGN,
  });

/** A move through the status door: `finish`'s move to DONE, or a Status action's. */
const givenMove = (slug: InteractionSlug, state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'moveEntityStatus',
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: MOVE_ENTITY_STATUS,
  });

/** A dispatch press: Dispatch (`FLOW`) or the next phase's button (`PHASE`). */
const givenDispatch = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'dispatchEntity',
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'dispatch-work-item' },
    consumes: DISPATCH_ENTITY,
  });

/** The entity a move or dispatch state names: its id param and its project. */
function movedIn(state: string, operationId: string) {
  const { params, body } = masters.operation(state, operationId);
  const id = params['epicId'] ?? params['ticketId'];
  return { id, projectId: params['projectId'], body: body as Record<string, string> };
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
  masters.operation(state, 'listProjectEntities').params['projectId'];

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
        storeAt(server.url);
        const op = masters.operation('a campaign with ordered developments', 'getCampaign');
        const { data } = await TestBed.runInInjectionContext(() =>
          getCampaign({ path: { id: op.params['campaignId'] } }),
        );
        expect(data?.campaign?.members?.length).toBeGreaterThan(0);
      },
    ));

  // The card screenshots' states (`epic-card`, `ticket-card`, the list items).
  it.each([
    'a ticket of every type',
    'a verified epic with every task implemented',
    'a done epic with every task implemented',
  ])('show-project-work-board: %s', (state) =>
    given('show-project-work-board', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const projectId = projectOf(state);
      await store.load(projectId);
      expect(store.byProject()[projectId]?.status).toBe('loaded');
    }),
  );

  it('show-project-work-board: a campaign with work in every phase', () =>
    given('show-project-work-board', 'a campaign with work in every phase').executeTest(
      async (server) => {
        // The entities read on its own: `load` would go on to read the campaign, which this
        // interaction does not answer (the next one does).
        storeAt(server.url);
        const projectId = projectOf('a campaign with work in every phase');
        const { data } = await TestBed.runInInjectionContext(() =>
          listProjectEntities({ path: { projectId } }),
        );
        expect(data?.entities?.length).toBeGreaterThan(0);
      },
    ));

  it('show-project-work-board: the members of a campaign with work in every phase', () =>
    givenCampaign('show-project-work-board', 'a campaign with work in every phase').executeTest(
      async (server) => {
        storeAt(server.url);
        const op = masters.operation('a campaign with work in every phase', 'getCampaign');
        const { data } = await TestBed.runInInjectionContext(() =>
          getCampaign({ path: { id: op.params['campaignId'] } }),
        );
        expect(data?.campaign?.members?.length).toBeGreaterThan(0);
      },
    ));

  // The epic card with two campaign tags. A state records one answer per operation, so the second
  // campaign is a state of its own over the same seed.
  it('show-project-work-board: an epic in two campaigns', () =>
    given('show-project-work-board', 'an epic in two campaigns').executeTest(async (server) => {
      // The entities read on its own: `load` would go on to read both campaigns.
      storeAt(server.url);
      const projectId = projectOf('an epic in two campaigns');
      const { data } = await TestBed.runInInjectionContext(() =>
        listProjectEntities({ path: { projectId } }),
      );
      expect(data?.entities?.length).toBeGreaterThan(0);
    }));

  it.each([
    ['an epic in two campaigns', 'firstCampaignId'],
    ['the second campaign of an epic in two campaigns', 'secondCampaignId'],
  ])('show-project-work-board: the members of %s', (state, param) =>
    givenCampaign('show-project-work-board', state).executeTest(async (server) => {
      storeAt(server.url);
      const op = masters.operation(state, 'getCampaign');
      const { data } = await TestBed.runInInjectionContext(() =>
        getCampaign({ path: { id: op.params[param] } }),
      );
      expect(data?.campaign?.members?.length).toBe(1);
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

  it.each([
    ['finish-epic', 'a verified epic', 'EPIC'],
    ['finish-ticket', 'a verified ticket', 'TICKET'],
  ] as const)('%s: the finish button moves %s to DONE', (slug, state, archetype) =>
    givenMove(slug, state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, projectId } = movedIn(state, 'moveEntityStatus');
      const entry = { id, archetype, status: 'VERIFIED' } as WorkEntry;
      await store.finish(projectId, entry);
      // No finish state left means the answer carried a status.
      expect(store.finishing()[id]).toBeUndefined();
    }),
  );

  // One recorded move per status: each state's entity moved once, by the registry's moves.
  it.each([
    'a reported ticket',
    'a refined ticket',
    'an implementing ticket',
    'an implemented ticket',
    'a verifying ticket',
    'a verified ticket',
    'a dropped ticket',
    'a reported epic',
    'a refined epic',
    'an implementing epic',
    'an implemented epic',
    'a verifying epic',
    'a verified epic',
    'a dropped epic',
  ])('move-work-item: a Status action moves %s', (state) =>
    givenMove('move-work-item', state).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { id, projectId, body } = movedIn(state, 'moveEntityStatus');
      await store.transition(projectId, { id } as WorkEntry, body['target'] as WorkStatus);
      expect(store.transitioning()[id]).toBeUndefined();
    }),
  );

  it.each(['a reported epic', 'a refined epic', 'a refined ticket', 'an implemented ticket'])(
    'dispatch-work-item: a dispatch press for %s',
    (state) =>
      givenDispatch(state).executeTest(async (server) => {
        const store = storeAt(server.url);
        const { id, body } = movedIn(state, 'dispatchEntity');
        await store.dispatch({ id } as WorkEntry, body['mode'] as DispatchMode);
        expect(store.dispatching()[id]).toBeUndefined();
        expect(store.dispatched()[id]).toBeTruthy();
      }),
  );
});
