import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { countsAsWork } from './work.consumes';
import {
  ADD_WORK_COMMENT,
  MOVE_WORK,
  OPEN_ISSUES,
  PROJECT_CARD_WORK,
  SET_WORK_INSPIRATION,
  WORK_ITEM,
} from './work.operations';

/**
 * The work operations' part of qits-landing-app's pact with qits-projects-service
 * (`work.operations.ts`, qits-2146), in `pacts/qits-landing-app_qits-projects-service.json` beside
 * `WorkStore`'s and the other operations' parts (see `src/testing/pact-part.ts`):
 *
 * - `show-project-work` (`PROJECT_CARD_WORK`), a project card's count of the project's work, in a
 *   project with refined work, the first of two projects, and a project with none;
 * - `show-open-issues` (`OPEN_ISSUES`, `WORK_ITEM`), the Desk's open issues and each issue's
 *   description, in "a project with an open issue" (qits-2039);
 * - `comment-on-work-item` (`ADD_WORK_COMMENT`), a comment on a ticket's thread, which the Desk's
 *   Comment and Resolve write (and the work item page's thread, through `WorkDetailStore`);
 * - `move-work-item` (`MOVE_WORK`), one recorded move per status, which the Desk's Resolve sends
 *   (and the work item page's Status actions, through `WorkStore`).
 *
 * The open issues', the comment's and the moves' interactions moved here from
 * `work.store.pact.spec.ts` and `work-detail.store.pact.spec.ts` with the Desk (group 3), unchanged:
 * the same descriptions, states, requests and bound fields (the work without its needs' rows, the
 * item without its needs' rows and with its needs open-ended as there, the comment and the status
 * as the recording holds them).
 *
 * `SET_WORK_INSPIRATION` (`patchWork` of `inspiredBy`, `set-work-inspiration`) is not bound yet:
 * qits-projects records no patch of an inspiration, so the work item page's inspiration is covered
 * by its plain spec only, as it was under `WorkWritesStore`; an interaction follows the recording.
 *
 * Moved here from `work.store.pact.spec.ts`, unchanged: the same descriptions, states, requests and
 * bound fields (`PROJECT_CARD_WORK` is the list that spec bound outside its needs state, each
 * through `heldBy`, as there). None of these states records a CAMPAIGN or is a "… in detail"
 * state, so that spec's `openEndedWork` left them as written. Each interaction comes from the
 * operation itself (`OP.operationId`, `OP.consumes`; `OP.provider` held to the spec's literal
 * provider), and each test runs the operation's own `fetch` against the mock server.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  { operationId: 'listProjectWork', interactions: ['show-project-work', 'show-open-issues'] },
  { operationId: 'getWork', interactions: ['show-open-issues'] },
  'addWorkComment',
  { operationId: 'setWorkStatus', interactions: ['move-work-item'] },
];

const OPEN_ISSUE = 'a project with an open issue';
const COMMENTED = 'a ticket with a comment';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** What an interaction takes of an operation: its provider, operationId and `consumes`. */
interface Bound {
  readonly provider: string;
  readonly operationId: string;
  readonly consumes: readonly string[];
}

/** `op`'s interaction in `state` for the UI `slug`, binding `consumes` as the recording holds it. */
const bound = (op: Bound, slug: InteractionSlug, state: string, consumes = op.consumes) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is not ${PROVIDER}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: heldBy(masters, state, op.operationId, consumes),
  });
};

/** `state`'s param `name` for `operationId`. */
const param = (state: string, operationId: string, name: string) =>
  masters.operation(state, operationId).params[name];

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
 * Every `getWork` answer that binds an item's needs matches them by type, any length, as
 * `work-detail.store.pact.spec.ts`'s `openEndedNeeds` does (epic qits-1899): an item's needs grow
 * and shrink with the seed.
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

/** Runs `call` against the mock server at `url`, in an injection context. */
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

/** The card's interaction in `state`, binding `PROJECT_CARD_WORK` as far as the state holds it. */
const given = (state: string) => {
  if (PROJECT_CARD_WORK.provider !== PROVIDER) throw new Error('PROJECT_CARD_WORK is not ours');
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: PROJECT_CARD_WORK.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: 'show-project-work' },
    consumes: heldBy(masters, state, PROJECT_CARD_WORK.operationId, PROJECT_CARD_WORK.consumes),
  });
};

/** The card's read of `state`'s project. */
const cardRead = (url: string, state: string) =>
  at(url, () =>
    PROJECT_CARD_WORK.fetch({
      path: { project: masters.operation(state, 'listProjectWork').params['projectId'] },
    }),
  );

describe('qits-landing-app → qits-projects-service pact: the work operations', () => {
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

  it('declares the provider this spec binds', () => {
    for (const op of [PROJECT_CARD_WORK, OPEN_ISSUES, WORK_ITEM, ADD_WORK_COMMENT, MOVE_WORK]) {
      expect(op.provider).toBe(PROVIDER);
    }
    expect(SET_WORK_INSPIRATION.provider).toBe(PROVIDER);
  });

  it('show-project-work: the store loads a project’s work', () =>
    given('a project with refined work').executeTest(async (server) => {
      // The pact binds the entities' fields by type, not by value, so the mock answers with the
      // recorded example repeated; which statuses count is the plain spec's business.
      const { data } = await cardRead(server.url, 'a project with refined work');
      expect(data?.entities?.length).toBeGreaterThan(0);
    }));

  it('show-project-work: the work of the first of two projects', () =>
    given('two projects exist').executeTest(async (server) => {
      const { data } = await cardRead(server.url, 'two projects exist');
      expect(data?.entities).toBeDefined();
    }));

  it('show-project-work: a project with no work counts zero', () =>
    given('a project with no work').executeTest(async (server) => {
      const { data } = await cardRead(server.url, 'a project with no work');
      expect((data?.entities ?? []).filter(countsAsWork).length).toBe(0);
    }));

  // The Desk's open issues (`open-issues.ts`, qits-1819): an OPEN issue (qits-2039).
  it('show-open-issues: a project with an open issue', () =>
    bound(OPEN_ISSUES, 'show-open-issues', OPEN_ISSUE).executeTest(async (server) => {
      const project = param(OPEN_ISSUE, 'listProjectWork', 'projectId');
      const { data } = await at(server.url, () => OPEN_ISSUES.fetch({ path: { project } }));
      expect(data?.entities?.some((e) => e.archetype === 'ISSUE')).toBe(true);
    }));

  // The Desk's open issues read each issue's description (`issue-description.ts`, qits-1819): the
  // issue "a project with an open issue" records (qits-2039). The needs' rows are bound in the
  // needs state only, as the work item page's read binds them.
  it('show-open-issues: the item of a project with an open issue', () =>
    bound(
      WORK_ITEM,
      'show-open-issues',
      OPEN_ISSUE,
      WORK_ITEM.consumes.filter((path) => !path.startsWith('needs[]')),
    ).executeTest(async (server) => {
      const qualifiedId = param(OPEN_ISSUE, 'getWork', 'qualifiedId');
      const { data } = await at(server.url, () => WORK_ITEM.fetch({ path: { qualifiedId } }));
      expect(data?.archetype).toBe('ISSUE');
    }));

  it('comment-on-work-item: says something on the thread', () =>
    bound(ADD_WORK_COMMENT, 'comment-on-work-item', COMMENTED).executeTest(async (server) => {
      const qualifiedId = param(COMMENTED, 'addWorkComment', 'qualifiedId');
      const sent = masters.operation(COMMENTED, 'addWorkComment').body as { body: string };
      const { data, error } = await at(server.url, () =>
        ADD_WORK_COMMENT.fetch({ path: { qualifiedId }, body: { body: sent.body.trim() } }),
      );
      expect(error).toBeUndefined();
      expect(data?.comment?.body).toBeTruthy();
    }));

  // One recorded move per status: each state's entity moved once, by the registry's moves. A
  // verified ticket is left out: its only recorded move targets DONE, and qits-projects-service
  // refuses every caller's move of a TICKET to DONE (qits-150).
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
    // The status as the recording holds it (no `heldBy`), as `WorkStore`'s spec bound it.
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state,
      operationId: MOVE_WORK.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'move-work-item' },
      consumes: MOVE_WORK.consumes,
    }).executeTest(async (server) => {
      const { params, body } = masters.operation(state, 'setWorkStatus');
      const target = (
        body as { target: NonNullable<Parameters<typeof MOVE_WORK.fetch>[0]['body']>['target'] }
      ).target;
      const { data } = await at(server.url, () =>
        MOVE_WORK.fetch({ path: { qualifiedId: params['qualifiedId'] }, body: { target } }),
      );
      expect(data?.status).toBeTruthy();
    }),
  );
});
