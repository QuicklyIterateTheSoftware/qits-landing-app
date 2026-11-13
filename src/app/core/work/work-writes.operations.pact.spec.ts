import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, type GoldenMasters } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import {
  isRecorded,
  NEEDS_STATE,
  projectsGoldenMasters as masters,
} from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { CREATE_WORK, REPRIORITIZE_WORK, SET_WORK_NEEDS } from './work-writes.operations';
import {
  createWorkParams,
  needsParams,
  reprioritizeParams,
  workWriteRefusal,
  type WorkDraft,
} from './work-writes';

/**
 * The work write operations' part of qits-landing-app's pact with qits-projects-service (epic
 * qits-888; `work-writes.operations.ts`, qits-2146), in
 * `pacts/qits-landing-app_qits-projects-service.json` beside the other operations' parts:
 * `CREATE_WORK` (`createWork`) from "a project with no work" (a bug ticket with its impetus), run
 * with `createWorkParams` of what the recording sent, and from "a project with ideas" refused (400:
 * a ticket without its impetus), whose `message` the form shows (qits-2004, its `refused`
 * outcome); `REPRIORITIZE_WORK` (`reprioritizeWork`) from "three reported tickets, one with a
 * priority" (qits-753: the third ticket dropped directly below the first), run with
 * `reprioritizeParams`. The interactions moved here from `work-writes.store.pact.spec.ts` with
 * `WorkWritesStore` (qits-2146), unchanged: the same descriptions, states, requests and bound
 * fields; `work-writes.ts` builds the very params the store sent.
 *
 * `SET_WORK_NEEDS` (`patchWork` of `needs`, epic qits-1899, `edit-work-needs`), from
 * `NEEDS_STATE`: the Needs panel's write, run with `needsParams`. No golden master records a patch
 * of `needs`, so it is composed from a recorded patch (`needsPatch`), as the drop's move is in
 * `project-work.operations.pact.spec.ts`: the same door, method,
 * path and status as "a reported ticket"'s patch, in `NEEDS_STATE` with its params, sending the
 * state's own need again (`neededQualifiedId` at VERIFIED, which the seed holds, so the provider
 * writes what it has), and binding the answer's `qualifiedId` alone (`PATCH_WORK_NEEDS`). The
 * state is recorded by qits-projects from 2026.1106.140436 on: until the pin reaches it, the test
 * skips itself and the committed pact holds no such interaction.
 *
 * Not bound yet: a create naming an idea (`inspiredBy`) and `patchWork` setting or clearing it.
 * qits-projects records neither, so the work item page's inspiration and the form's `inspiredBy`
 * are covered by the plain specs only; an interaction follows the recording.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);
const OPERATIONS: readonly OwnedOperation[] = [
  'createWork',
  'reprioritizeWork',
  { operationId: 'patchWork', interactions: ['edit-work-needs'] },
];

const NO_WORK = 'a project with no work';
const IDEAS = 'a project with ideas';
const RANKED = 'three reported tickets, one with a priority';
/** The recorded patch the needs write is composed from. */
const RECORDED_PATCH = 'a reported ticket';

/** The needs write `NEEDS_STATE` is given: its own need, sent again. */
const needsWrite = () => {
  const params = masters.operation(NEEDS_STATE, 'getWork').params;
  return {
    params,
    body: { needs: [{ item: params['neededQualifiedId'], status: 'VERIFIED' }] },
  };
};

/** `masters` with `NEEDS_STATE`'s `patchWork`: "a reported ticket"'s, sending `needsWrite`. */
const needsPatch: GoldenMasters = {
  operation: (state, operationId) => {
    if (state !== NEEDS_STATE || operationId !== 'patchWork') {
      return masters.operation(state, operationId);
    }
    const { params, body } = needsWrite();
    return { ...masters.operation(RECORDED_PATCH, 'patchWork'), state, params, body };
  },
  body: (state, operationId) =>
    state === NEEDS_STATE && operationId === 'patchWork'
      ? masters.body(RECORDED_PATCH, 'patchWork')
      : masters.body(state, operationId),
  text: (state, operationId) => masters.text(state, operationId),
};

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-writes-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

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

/** A create of `draft`, as the create form sends it. */
const create = (url: string, draft: WorkDraft) =>
  at(url, () => CREATE_WORK.fetch(createWorkParams(draft)));

describe('qits-landing-app → qits-projects-service pact: the work write operations', () => {
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
    for (const op of [CREATE_WORK, SET_WORK_NEEDS, REPRIORITIZE_WORK]) {
      expect(op.provider).toBe(PROVIDER);
    }
  });

  it('create-work-item: a bug ticket with its impetus', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: NO_WORK,
      operationId: CREATE_WORK.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'create-work-item' },
      consumes: CREATE_WORK.consumes,
    }).executeTest(async (server) => {
      // The body as the recording sent it, its project included: the provider's verification fills
      // in `{projectId}` from the state's params.
      const sent = masters.operation(NO_WORK, 'createWork').body as Record<string, string>;
      const { data, error } = await create(server.url, {
        archetype: 'TICKET',
        project: sent['project'],
        title: sent['title'],
        ticketType: sent['ticketType'],
        impetus: sent['impetus'],
      });
      expect(error).toBeUndefined();
      expect(data?.qualifiedId).toBeTruthy();
    }));

  it('create-work-item: a ticket without impetus is refused, in the service’s words', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: IDEAS,
      operationId: CREATE_WORK.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'create-work-item' },
      consumes: CREATE_WORK.errorConsumes,
    }).executeTest(async (server) => {
      const sent = masters.operation(IDEAS, 'createWork').body as Record<string, string>;
      const { error, response } = await create(server.url, {
        archetype: 'TICKET',
        project: sent['project'],
        title: sent['title'],
        ticketType: sent['ticketType'],
      });
      expect(workWriteRefusal(error, response?.status)).toBe('impetus is required');
    }));

  it.skipIf(!isRecorded(NEEDS_STATE, 'getWork'))(
    'edit-work-needs: the Needs panel writes the whole list',
    () =>
      addGoldenInteraction(pact, needsPatch, {
        provider: PROVIDER,
        state: NEEDS_STATE,
        operationId: SET_WORK_NEEDS.operationId,
        trigger: { kind: 'ui', app: CONSUMER, interaction: 'edit-work-needs' },
        consumes: SET_WORK_NEEDS.consumes,
      }).executeTest(async (server) => {
        const { params, body } = needsWrite();
        const { data, error } = await at(server.url, () =>
          SET_WORK_NEEDS.fetch(needsParams(params['qualifiedId'], body.needs)),
        );
        expect(error).toBeUndefined();
        expect(data?.qualifiedId).toBeTruthy();
      }),
  );

  it('reprioritize-work-item: a ticket dropped directly below a sibling', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: RANKED,
      operationId: REPRIORITIZE_WORK.operationId,
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'reprioritize-work-item' },
      consumes: REPRIORITIZE_WORK.consumes,
    }).executeTest(async (server) => {
      // The anchor as the recording sent it: the provider's verification fills in `{anchor}` from
      // the state's params.
      const { params, body } = masters.operation(RANKED, 'reprioritizeWork');
      const sent = body as Record<string, string>;
      const { data, error } = await at(server.url, () =>
        REPRIORITIZE_WORK.fetch(
          reprioritizeParams(params['qualifiedId'], { below: sent['below'] }),
        ),
      );
      expect(error).toBeUndefined();
      expect(data?.items?.length).toBeGreaterThan(0);
    }));
});
