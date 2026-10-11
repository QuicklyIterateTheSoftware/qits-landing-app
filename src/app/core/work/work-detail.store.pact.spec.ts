import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { consume } from '@qits/angular';
import { addGoldenInteraction } from '@qits/angular/testing';
import {
  getWork,
  listWorkComments,
  listWorkDossier,
  listWorkDossierAssets,
} from '../../api/projects';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import {
  GET_WORK,
  GET_WORK_CRITERIA,
  GET_WORK_UNBLOCKABLE,
  LIST_DOSSIER_PAGES,
  LIST_WORK_COMMENTS,
  LIST_WORK_DOSSIER_ASSETS,
  WORK_COMMENT,
} from './work-detail.consumes';
import { WorkDetailStore } from './work-detail.store';
import type { InteractionSlug } from '../../interactions';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';

/**
 * `WorkDetailStore`'s part of qits-landing-app's pact with qits-projects-service (epics qits-112,
 * qits-965): the `getWork` (of the work item page and the Schedule tab; the campaign description's
 * is `WorkStore`'s), `listWorkComments`, `listWorkDossier` and `listWorkDossierAssets`
 * interactions, all by qualified id, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * One detail state per archetype and per ticket type, and "an implemented ticket" (whose page the
 * action screenshots show). Each test makes ONE of the reads `WorkDetailStore.load` makes, with the
 * store's own `consumes`, against a pact mock server answering with qits-projects' golden master: a
 * path from a provider state matches any path, so one interaction per test keeps each answer to
 * its own request. `work-detail.store.spec.ts` drives `load` as a whole.
 *
 * The Schedule tab's criteria read (`loadCriteria`) is the same `getWork`, binding only the
 * acceptance criteria, of an epic and of a REFINED ticket.
 *
 * The thread's two writes, `addWorkComment` and `editWorkComment`, drive the store's own
 * `addComment` and `editComment` against "a ticket with a comment", with the body the recording
 * sent: the request qits-projects-frontend's thread made (only the body travels; the edit is a merge
 * patch sent as plain `application/json`).
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  { operationId: 'getWork', interactions: ['show-work-item', 'show-schedule-criteria'] },
  'listWorkComments',
  'listWorkDossier',
  'listWorkDossierAssets',
  'addWorkComment',
  'editWorkComment',
];

const COMMENTED = 'a ticket with a comment';

const EPIC = 'an epic in detail';
const TICKETS = [
  'a bug ticket in detail',
  'an improvement ticket in detail',
  'a maintenance ticket in detail',
];
const OTHERS = [
  'a campaign in detail',
  'a campaign with a done, a verified and an implementing epic',
  'an implemented ticket',
];
const UNBLOCKABLE = ['a feature in detail', 'a task in detail'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-detail-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

const given = (state: string, operationId: string, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item' },
    consumes,
  });

/** The Schedule tab's read of an item's acceptance criteria (`WorkDetailStore.loadCriteria`). */
const givenCriteria = (state: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: 'getWork',
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-schedule-criteria' },
    consumes: GET_WORK_CRITERIA,
  });

/** A comment write on the thread: Comment, or Save on an edited comment. */
const givenWrite = (slug: InteractionSlug, operationId: string) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state: COMMENTED,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: WORK_COMMENT,
  });

/** What the recording of `operationId` sent as the comment's body. */
const sentBody = (operationId: string) =>
  (masters.operation(COMMENTED, operationId).body as { body: string }).body;

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
      provideTestPlatformOrigins(),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** `state`'s param `name` for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

/** The reference a state reads the item by: its qualified id. */
const refOf = (state: string, operationId: string) => param(state, operationId, 'qualifiedId');

describe('qits-landing-app → qits-projects-service pact: work detail', () => {
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

  it.each([EPIC, ...TICKETS, ...OTHERS, ...UNBLOCKABLE])(
    'show-work-item: the item of %s',
    (state) =>
      given(
        state,
        'getWork',
        UNBLOCKABLE.includes(state) ? GET_WORK_UNBLOCKABLE : GET_WORK,
      ).executeTest(async (server) => {
        const qualifiedId = refOf(state, 'getWork');
        const { data } = await at(server.url, () =>
          consume(getWork({ path: { qualifiedId } }), GET_WORK),
        );
        expect(data?.archetype).toBeTruthy();
      }),
  );

  it.each([EPIC, 'an improvement ticket in detail'])(
    'show-schedule-criteria: the acceptance criteria of %s',
    (state) =>
      givenCriteria(state).executeTest(async (server) => {
        const qualifiedId = refOf(state, 'getWork');
        const { data } = await at(server.url, () =>
          consume(getWork({ path: { qualifiedId } }), GET_WORK_CRITERIA),
        );
        expect(data?.acceptanceCriteria?.length).toBeGreaterThan(0);
      }),
  );

  it.each([EPIC, ...TICKETS, ...OTHERS, ...UNBLOCKABLE])(
    'show-work-item: the comments of %s',
    (state) =>
      given(state, 'listWorkComments', LIST_WORK_COMMENTS).executeTest(async (server) => {
        const qualifiedId = refOf(state, 'listWorkComments');
        const { data, error } = await at(server.url, () =>
          consume(listWorkComments({ path: { qualifiedId } }), LIST_WORK_COMMENTS),
        );
        expect(error).toBeUndefined();
        expect(data?.entries).toBeDefined();
      }),
  );

  it('show-work-item: the dossier pages of an epic', () =>
    given(EPIC, 'listWorkDossier', LIST_DOSSIER_PAGES).executeTest(async (server) => {
      const qualifiedId = refOf(EPIC, 'listWorkDossier');
      const { data } = await at(server.url, () =>
        consume(listWorkDossier({ path: { qualifiedId } }), LIST_DOSSIER_PAGES),
      );
      expect(data?.pages?.length).toBe(3);
    }));

  it('show-work-item: the dossier figures of an epic', () =>
    given(EPIC, 'listWorkDossierAssets', LIST_WORK_DOSSIER_ASSETS).executeTest(async (server) => {
      const qualifiedId = refOf(EPIC, 'listWorkDossierAssets');
      const { data } = await at(server.url, () =>
        consume(listWorkDossierAssets({ path: { qualifiedId } }), LIST_WORK_DOSSIER_ASSETS),
      );
      expect(data?.assets?.[0]?.url).toContain('/content');
      expect(data?.assets?.[0]?.id).toBeTruthy();
    }));

  it.each(TICKETS)('show-work-item: the dossier pages of %s', (state) =>
    given(state, 'listWorkDossier', LIST_DOSSIER_PAGES).executeTest(async (server) => {
      const qualifiedId = refOf(state, 'listWorkDossier');
      const { data, error } = await at(server.url, () =>
        consume(listWorkDossier({ path: { qualifiedId } }), LIST_DOSSIER_PAGES),
      );
      expect(error).toBeUndefined();
      expect(data?.pages).toBeDefined();
    }),
  );

  it('comment-on-work-item: says something on the thread', () =>
    givenWrite('comment-on-work-item', 'addWorkComment').executeTest(async (server) => {
      const ref = refOf(COMMENTED, 'addWorkComment');
      const outcome = await at(server.url, () =>
        TestBed.inject(WorkDetailStore).addComment(ref, sentBody('addWorkComment')),
      );
      expect(outcome.refusal).toBeUndefined();
    }));

  it('edit-comment: rewrites a comment as a merge patch', () =>
    givenWrite('edit-comment', 'editWorkComment').executeTest(async (server) => {
      const ref = refOf(COMMENTED, 'editWorkComment');
      const commentId = param(COMMENTED, 'editWorkComment', 'commentId');
      const outcome = await at(server.url, () =>
        TestBed.inject(WorkDetailStore).editComment(ref, commentId, sentBody('editWorkComment')),
      );
      expect(outcome.refusal).toBeUndefined();
    }));
});
