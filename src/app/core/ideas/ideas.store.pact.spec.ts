import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, exampleQuery } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { GET_IDEA, IDEA_REFUSAL, IDEA_WRITTEN, LIST_IDEAS } from './ideas.consumes';
import { IdeasStore } from './ideas.store';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/**
 * `IdeasStore`'s part of qits-landing-app's pact with qits-projects-service (epic qits-888), in
 * `pacts/qits-landing-app_qits-projects-service.json` beside the other stores' parts:
 *
 * - "a project with ideas": `listIdeas` (the Ideas page), `getIdea` (an idea's page, of the idea
 *   that enables another and inspired an epic), `patchIdea` (Save on the edit form, a new title),
 *   `archiveIdea` (Archive, with its reason), `unarchiveIdea`, and `createIdea` refused (400: a
 *   title of three sentences), whose `message` the form shows.
 * - "a project with no work": `createIdea` (Create on the form, a title and a description).
 *
 * Each test drives the store's own method with what the recording sent, against a pact mock server
 * answering with qits-projects' golden master. `getIdea` binds the fields of `GET_IDEA` the
 * recording holds (`heldBy`): it records an idea nothing enables (`enabledByIdea: null`), so the
 * enabling idea's title and archived flag bind nothing until a recording names one.
 *
 * The list's `archived=true` and `status=` queries have no recording: the store sends the first
 * only when the page's "Show archived" is on, and filters by status over the answer itself.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  'listIdeas',
  'getIdea',
  'createIdea',
  'patchIdea',
  'archiveIdea',
  'unarchiveIdea',
];

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-ideas-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (
  state: string,
  operationId: string,
  interaction: InteractionSlug,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: heldBy(masters, state, operationId, consumes),
  });

/** The store, calling the mock server through a real HttpClient. */
function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
      provideTestPlatformOrigins(),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(IdeasStore);
}

const params = (state: string, operationId: string) => masters.operation(state, operationId).params;
const sent = (state: string, operationId: string) =>
  masters.operation(state, operationId).body as Record<string, string>;

describe('qits-landing-app → qits-projects-service pact: ideas', () => {
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

  it('list-ideas: a project’s ideas', () =>
    given(IDEAS, 'listIdeas', 'list-ideas', LIST_IDEAS).executeTest(async (server) => {
      const store = storeAt(server.url);
      // The query's example is the state's projectId, which the provider's verification fills in
      // from the provider state.
      const projectId = exampleQuery(masters.operation(IDEAS, 'listIdeas'))['project'];
      await store.loadList(projectId);
      const list = store.listOf(projectId);
      expect(list?.status).toBe('loaded');
      expect(list?.ideas).toHaveLength(2);
      expect(list?.ideas[0]?.title).toBe('Faster builds');
    }));

  it('show-idea: an idea with the work it inspired and the idea it enables', () =>
    given(IDEAS, 'getIdea', 'show-idea', GET_IDEA).executeTest(async (server) => {
      const store = storeAt(server.url);
      const id = params(IDEAS, 'getIdea')['ideaId'];
      await store.loadIdea(id);
      const idea = store.ideaOf(id)?.idea;
      expect(idea?.status).toBe('QUEUED');
      expect(idea?.inspired?.[0]?.qualifiedId).toBeTruthy();
      expect(idea?.enables?.[0]?.title).toBe('Share the build cache');
    }));

  it('create-idea: a title and a description make an idea', () =>
    given(NO_WORK, 'createIdea', 'create-idea', IDEA_WRITTEN).executeTest(async (server) => {
      const store = storeAt(server.url);
      const body = sent(NO_WORK, 'createIdea');
      const outcome = await store.create(body['project'], {
        title: body['title'],
        description: body['description'],
      });
      expect(outcome.ok && outcome.idea.status).toBe('PLANNED');
    }));

  it('create-idea: a title of three sentences is refused, in the service’s words', () =>
    given(IDEAS, 'createIdea', 'create-idea', IDEA_REFUSAL).executeTest(async (server) => {
      const store = storeAt(server.url);
      const body = sent(IDEAS, 'createIdea');
      const outcome = await store.create(body['project'], { title: body['title'] });
      expect(outcome.ok).toBe(false);
      expect(!outcome.ok && outcome.refusal).toContain("'.'");
    }));

  it('edit-idea: a new title', () =>
    given(IDEAS, 'patchIdea', 'edit-idea', IDEA_WRITTEN).executeTest(async (server) => {
      const store = storeAt(server.url);
      const id = params(IDEAS, 'patchIdea')['enabledIdeaId'];
      const outcome = await store.update(id, { title: sent(IDEAS, 'patchIdea')['title'] });
      expect(outcome.ok && outcome.idea.title).toBe('Share the build cache across runners');
    }));

  it('archive-idea: archived with a reason', () =>
    given(IDEAS, 'archiveIdea', 'archive-idea', IDEA_WRITTEN).executeTest(async (server) => {
      const store = storeAt(server.url);
      const id = params(IDEAS, 'archiveIdea')['enabledIdeaId'];
      const outcome = await store.archive(id, sent(IDEAS, 'archiveIdea')['reason']);
      expect(outcome.ok && outcome.idea.archived).toBe(true);
    }));

  it('unarchive-idea: an archived idea comes back', () =>
    given(IDEAS, 'unarchiveIdea', 'unarchive-idea', IDEA_WRITTEN).executeTest(async (server) => {
      const store = storeAt(server.url);
      const id = params(IDEAS, 'unarchiveIdea')['archivedIdeaId'];
      const outcome = await store.unarchive(id);
      expect(outcome.ok && outcome.idea.archived).toBe(false);
    }));
});
