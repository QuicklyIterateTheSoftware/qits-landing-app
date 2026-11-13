import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction } from '@qits/angular/testing';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { assertPactPart, type OwnedOperation } from '../../../testing/pact-part';
import { countsAsWork } from './work.consumes';
import { PROJECT_CARD_WORK } from './work.operations';

/**
 * The work operations' part of qits-landing-app's pact with qits-projects-service
 * (`work.operations.ts`, qits-2146), in `pacts/qits-landing-app_qits-projects-service.json` beside
 * `WorkStore`'s and the other operations' parts (see `src/testing/pact-part.ts`):
 * `show-project-work` (`PROJECT_CARD_WORK`), a project card's count of the project's work, in a
 * project with refined work, the first of two projects, and a project with none.
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
  { operationId: 'listProjectWork', interactions: ['show-project-work'] },
];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-work-operations-pact-'));
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

  it('declares the provider this spec binds', () =>
    expect(PROJECT_CARD_WORK.provider).toBe(PROVIDER));

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
});
