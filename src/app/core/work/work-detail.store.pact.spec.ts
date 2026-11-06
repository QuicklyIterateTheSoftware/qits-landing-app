import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import {
  heldBy,
  isRecorded,
  NEEDS_STATE,
  projectsGoldenMasters as masters,
} from '../../../testing/golden-masters';
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
 * qits-965): the `getWork` (of the work item page and the Schedule tab), `listWorkComments`, `listWorkDossier` and `listWorkDossierAssets`
 * interactions, all by qualified id, in the same file as the other stores'
 * (`pacts/qits-landing-app_qits-projects-service.json`, see `src/testing/pact-part.ts`).
 *
 * One detail state per archetype and per ticket type, and "an implemented ticket" (whose page the
 * action screenshots show). Each test makes ONE of the reads `WorkDetailStore.load` makes, with the
 * store's own `consumes`, against a pact mock server answering with qits-projects' golden master: a
 * path from a provider state matches any path, so one interaction per test keeps each answer to
 * its own request. `work-detail.store.spec.ts` drives `load` as a whole. A read binds the fields its
 * list names that the state's recording holds (`heldBy`), so a field a recording does not have yet
 * (`authorAgentOf`, `editable`: qits-1452, not yet in the installed golden-masters devDependency)
 * is simply left unbound there, rather than failing the test.
 *
 * What the item needs (epic qits-1899, `needs[]`) is bound in `NEEDS_STATE` only, and open-ended
 * there (`openEndedNeeds`): every other state records it empty, which would pin it empty. No
 * interaction reads a campaign, a milestone or `dependsOn` any more (qits-1908 deletes them).
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
const OTHERS = ['an implemented ticket'];
const UNBLOCKABLE = ['a feature in detail', 'a task in detail'];
/**
 * States recording the item alone, no thread or dossier: the IN_FLIGHT ticket of the wrapper
 * closings (qits-1873), whose page says how its closing stands.
 */
const ITEM_ONLY = ['a project with VERIFIED tickets in every wrapper verdict'];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-detail-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

// A field a state's recording does not hold is left unbound (`heldBy`), never hand-written: it
// binds the moment the recording grows it. `authorAgentOf`/`editable` (qits-1452) are not yet in
// the installed `@qits/projects-golden-masters` — a devDependency qits-maintenance bumps only once
// qits-projects-service releases this — so no interaction binds them until then.
const given = (state: string, operationId: string, consumes: readonly string[]) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-work-item' },
    consumes: heldBy(
      masters,
      state,
      operationId,
      state === NEEDS_STATE ? consumes : consumes.filter((path) => !path.startsWith('needs[]')),
    ),
  });

interface WrittenPact {
  readonly interactions: readonly {
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly body?: { readonly content?: { readonly needs?: unknown } };
      readonly matchingRules?: {
        readonly body?: Record<string, { combine: string; matchers: object[] }>;
      };
    };
  }[];
}

/**
 * `addGoldenInteraction` pins `needs` to the length qits-projects recorded. An item's needs grow
 * and shrink with the seed (epic qits-1899), so every `getWork` answer that binds them matches
 * them by type, any length (`min` 0, no `max`). Runs on the pact this spec just generated, before
 * `assertPactPart`, so the mock server still answered with the whole recording.
 */
function openEndedNeeds(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as WrittenPact;
  for (const interaction of written.interactions) {
    if (interaction.comments?.references?.['qits-call']?.operationId !== 'getWork') continue;
    const rules = interaction.response.matchingRules?.body;
    if (!rules || !Array.isArray(interaction.response.body?.content?.needs)) continue;
    rules['$.needs'] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

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
    consumes: heldBy(masters, COMMENTED, operationId, WORK_COMMENT),
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
      openEndedNeeds(join(dir, `${CONSUMER}-${PROVIDER}.json`));
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

  it.each([EPIC, ...TICKETS, ...OTHERS, ...UNBLOCKABLE, ...ITEM_ONLY])(
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

  // What the item needs (epic qits-1899): a READY_FOR_DEV ticket needing another ticket at
  // VERIFIED, not met. Recorded by qits-projects from 2026.1106.140436 on: until the pin reaches
  // it, the test skips itself and the committed pact holds no such interaction.
  it.skipIf(!isRecorded(NEEDS_STATE, 'getWork'))(
    'show-work-item: the needs of a ticket that needs another',
    () =>
      given(NEEDS_STATE, 'getWork', GET_WORK).executeTest(async (server) => {
        const qualifiedId = refOf(NEEDS_STATE, 'getWork');
        const { data } = await at(server.url, () =>
          consume(getWork({ path: { qualifiedId } }), GET_WORK),
        );
        expect(data?.unmetNeeds).toBe(1);
        expect(data?.needs?.[0]).toMatchObject({ status: 'VERIFIED', met: false });
        expect(data?.needs?.[0]?.currentStatus).toBeTruthy();
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
