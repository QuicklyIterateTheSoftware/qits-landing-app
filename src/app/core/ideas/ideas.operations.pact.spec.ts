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
import { IDEA_REFUSAL } from './ideas.consumes';
import { inIdeaRank } from './idea-rank';
import {
  archiveIdeaParams,
  createIdeaParams,
  ideaRefusal,
  patchIdeaParams,
  reprioritizeIdeaParams,
  unarchiveIdeaParams,
} from './idea-writes';
import {
  ARCHIVE_IDEA,
  CREATE_IDEA,
  EDIT_IDEA,
  IDEA,
  IDEA_LIST,
  REPRIORITIZE,
  UNARCHIVE_IDEA,
} from './ideas.operations';

/**
 * The idea operations' part of qits-landing-app's pact with qits-projects-service (epic qits-888,
 * `ideas.operations.ts`), in `pacts/qits-landing-app_qits-projects-service.json` beside the other
 * parts:
 *
 * - "a project with ideas": `listIdeas` (the Ideas page), `getIdea` (an idea's page, of the idea
 *   that enables another and inspired an epic), `patchIdea` (Save on the edit form, a new title),
 *   `archiveIdea` (Archive, with its reason), `unarchiveIdea`, and `createIdea` refused (400: a
 *   title of three sentences), whose `message` the form shows.
 * - "a project with no work": `createIdea` (Create on the form, a title and a description).
 * - "a project with three ideas, one with a priority": `reprioritizeIdea` (a drop on the Ideas
 *   page, directly below the ranked idea; qits-1791), and `getIdea` of the idea the edit form's
 *   Save then patches (the edit page's `saved` exit, epic qits-2000; qits-2039).
 * - "an idea enabled by another idea" (qits-2039): `getIdea` of an idea whose enabling idea is
 *   archived (the "Enabled by" link and its hint), and `patchIdea` refused (400: a title of three
 *   sentences), the edit form's `refused`.
 *
 * Moved here from `IdeasStore`'s pact spec when the store went (qits-2146), unchanged: the same
 * descriptions, states, requests and bound fields. Each test runs the operation's own `fetch` with
 * what the recording sent, the writes' params built by `idea-writes.ts` as the pages build them,
 * against a pact mock server answering with qits-projects' golden master; each interaction's
 * `operationId` and `consumes` are the operation's (its provider held to this spec's literal). `getIdea` binds the fields of `GET_IDEA` the
 * recording holds (`heldBy`): a field a recording holds as `null` (`enabledByIdea` of an idea
 * nothing enables) binds nothing below it.
 *
 * The list's `archived=true` and `status=` queries have no recording: the Ideas page sends the first
 * only when its "Show archived" is on, and filters by status over the answer itself.
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
  'reprioritizeIdea',
];

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
const RANKED = 'a project with three ideas, one with a priority';
const ENABLED = 'an idea enabled by another idea';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-ideas-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** What an interaction takes of an operation: its provider, operationId and `consumes`. */
interface Bound {
  readonly provider: string;
  readonly operationId: string;
  readonly consumes: readonly string[];
}

/**
 * `op`'s interaction in `state`, for the UI `interaction`, binding `consumes` (the operation's own
 * unless a refusal binds its error body) as far as the state's recording holds it.
 */
const given = (
  state: string,
  op: Bound,
  interaction: InteractionSlug,
  consumes: readonly string[] = op.consumes,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is not ${PROVIDER}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: heldBy(masters, state, op.operationId, consumes),
  });
};

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
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

  it('declares the provider this spec binds', () => {
    for (const op of [IDEA_LIST, IDEA, CREATE_IDEA, EDIT_IDEA, ARCHIVE_IDEA, UNARCHIVE_IDEA]) {
      expect(op.provider).toBe(PROVIDER);
    }
    expect(REPRIORITIZE.provider).toBe(PROVIDER);
  });

  it('list-ideas: a project’s ideas', () =>
    given(IDEAS, IDEA_LIST, 'list-ideas').executeTest(async (server) => {
      // The query's example is the state's projectId, which the provider's verification fills in
      // from the provider state.
      const projectId = exampleQuery(masters.operation(IDEAS, 'listIdeas'))['project'];
      const { data, error } = await at(server.url, () =>
        IDEA_LIST.fetch({ query: { project: projectId } }),
      );
      expect(error).toBeUndefined();
      const ideas = inIdeaRank(data?.ideas ?? []);
      expect(ideas).toHaveLength(2);
      expect(ideas[0]?.title).toBe('Faster builds');
    }));

  it('show-idea: an idea with the work it inspired and the idea it enables', () =>
    given(IDEAS, IDEA, 'show-idea').executeTest(async (server) => {
      const id = params(IDEAS, 'getIdea')['ideaId'];
      const { data: idea } = await at(server.url, () => IDEA.fetch({ path: { id } }));
      expect(idea?.status).toBe('QUEUED');
      expect(idea?.inspired?.[0]?.qualifiedId).toBeTruthy();
      expect(idea?.enables?.[0]?.title).toBe('Share the build cache');
    }));

  it('show-idea: an idea enabled by an archived idea', () =>
    given(ENABLED, IDEA, 'show-idea').executeTest(async (server) => {
      const id = params(ENABLED, 'getIdea')['ideaId'];
      const { data: idea } = await at(server.url, () => IDEA.fetch({ path: { id } }));
      expect(idea?.enabledByIdea?.title).toBe('Faster builds');
      expect(idea?.enabledByIdea?.archived).toBe(true);
    }));

  it('show-idea: an idea nothing enables, which the edit form fills in', () =>
    given(RANKED, IDEA, 'show-idea').executeTest(async (server) => {
      const id = params(RANKED, 'getIdea')['ideaId'];
      const { data: idea } = await at(server.url, () => IDEA.fetch({ path: { id } }));
      expect(idea?.title).toBe('Smaller images');
    }));

  it('create-idea: a title and a description make an idea', () =>
    given(NO_WORK, CREATE_IDEA, 'create-idea').executeTest(async (server) => {
      const body = sent(NO_WORK, 'createIdea');
      const { data } = await at(server.url, () =>
        CREATE_IDEA.fetch(
          createIdeaParams(body['project'], {
            title: body['title'],
            description: body['description'],
          }),
        ),
      );
      expect(data?.status).toBe('PLANNED');
    }));

  it('create-idea: a title of three sentences is refused, in the service’s words', () =>
    given(IDEAS, CREATE_IDEA, 'create-idea', IDEA_REFUSAL).executeTest(async (server) => {
      const body = sent(IDEAS, 'createIdea');
      const { data, error } = await at(server.url, () =>
        CREATE_IDEA.fetch(createIdeaParams(body['project'], { title: body['title'] })),
      );
      expect(data).toBeUndefined();
      expect(ideaRefusal(error, 400)).toContain("'.'");
    }));

  it('edit-idea: a new title', () =>
    given(IDEAS, EDIT_IDEA, 'edit-idea').executeTest(async (server) => {
      const id = params(IDEAS, 'patchIdea')['enabledIdeaId'];
      const { data } = await at(server.url, () =>
        EDIT_IDEA.fetch(patchIdeaParams(id, { title: sent(IDEAS, 'patchIdea')['title'] })),
      );
      expect(data?.title).toBe('Share the build cache across runners');
    }));

  it('edit-idea: a title of three sentences is refused, in the service’s words', () =>
    given(ENABLED, EDIT_IDEA, 'edit-idea', IDEA_REFUSAL).executeTest(async (server) => {
      const id = params(ENABLED, 'patchIdea')['ideaId'];
      const { data, error } = await at(server.url, () =>
        EDIT_IDEA.fetch(patchIdeaParams(id, { title: sent(ENABLED, 'patchIdea')['title'] })),
      );
      expect(data).toBeUndefined();
      expect(ideaRefusal(error, 400)).toContain("'.'");
    }));

  it('archive-idea: archived with a reason', () =>
    given(IDEAS, ARCHIVE_IDEA, 'archive-idea').executeTest(async (server) => {
      const id = params(IDEAS, 'archiveIdea')['enabledIdeaId'];
      const { data } = await at(server.url, () =>
        ARCHIVE_IDEA.fetch(archiveIdeaParams(id, sent(IDEAS, 'archiveIdea')['reason'])),
      );
      expect(data?.archived).toBe(true);
    }));

  it('unarchive-idea: an archived idea comes back', () =>
    given(IDEAS, UNARCHIVE_IDEA, 'unarchive-idea').executeTest(async (server) => {
      const id = params(IDEAS, 'unarchiveIdea')['archivedIdeaId'];
      const { data } = await at(server.url, () => UNARCHIVE_IDEA.fetch(unarchiveIdeaParams(id)));
      expect(data?.archived).toBe(false);
    }));

  it('reprioritize-idea: an idea dropped directly below the ranked one', () =>
    given(RANKED, REPRIORITIZE, 'reprioritize-idea').executeTest(async (server) => {
      // The anchor as the recording sent it: the provider's verification fills in `{anchor}`
      // from the state's params.
      const below = sent(RANKED, 'reprioritizeIdea')['below'];
      const { data } = await at(server.url, () =>
        REPRIORITIZE.fetch(
          reprioritizeIdeaParams(params(RANKED, 'reprioritizeIdea')['ideaId'], { below }),
        ),
      );
      expect(data?.items?.length).toBeGreaterThan(0);
    }));
});
