import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { getCampaign } from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart } from '../../../testing/pact-part';
import { GET_CAMPAIGN, LIST_PROJECT_ENTITIES } from './work.consumes';
import { WorkStore } from './work.store';

/**
 * `WorkStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-112): the
 * `listProjectEntities` interactions, in the same file as `ProjectsStore`'s
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * Each test drives `load(projectId)`, as the UI interaction named in `interactions.ts` does, against
 * a pact mock server answering with qits-projects' golden master, binding only the fields in
 * `work.consumes.ts`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS = ['listProjectEntities', 'getCampaign'];

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
      });
    }));
});
