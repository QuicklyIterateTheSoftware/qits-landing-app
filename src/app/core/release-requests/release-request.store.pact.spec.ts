import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { addGoldenInteraction } from '@qits/angular/testing';
import { assertPactPart } from '../../../testing/pact-part';
import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  CHANGED_RELEASE_REQUEST,
  GET_RELEASE_ARTIFACTS,
  GET_RELEASE_REQUEST,
  LIST_COMMIT_BUILDS,
  LIST_RELEASE_REQUEST_COMMITS,
} from './release-request.consumes';
import { ReleaseRequestStore } from './release-request.store';

/**
 * `ReleaseRequestStore`'s part of qits-landing-app's pact with qits-projects-service, in
 * `pacts/qits-landing-app_qits-projects-service.json` (see `projects.store.pact.spec.ts`).
 *
 * TODO(qits-112): skipped until qits-projects-service releases the provider states for one release
 * request (branch `external/rr-detail-states`) in `@qits/projects-golden-masters`. Then pin that
 * version, set the state names and operationIds below to the recorded ones, and drop the skip.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The provider states this spec needs (names to match the recordings). */
const STATES = {
  pending: 'a release request awaiting approval',
  released: 'a released release request',
  awaitingApproval: 'a release request awaiting approval while its build runs',
} as const;

/** The operations this spec owns in that file (operationIds to match the recordings). */
const OPERATIONS = [
  'getReleaseRequest',
  'listReleaseRequestCommits',
  'listCommitBuilds',
  'getReleaseRequestArtifacts',
  'setReleaseSourcePriority',
  'approveReleaseRequest',
  'declineReleaseRequest',
  'withdrawReleaseRequest',
  'rerunReleasePipelinePhase',
];

const given = (
  slug: InteractionSlug,
  state: string,
  operationId: string,
  consumes: readonly string[],
) =>
  addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes,
  });

let dir = '';
let pact: PactV4;

function storeAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(projectsClient),
    ],
  });
  projectsClient.setConfig({ baseUrl: url });
  return TestBed.inject(ReleaseRequestStore);
}

/** The repository and request a recorded call was made for. */
function addressOf(state: string, operationId: string) {
  const params = masters.operation(state, operationId).params;
  return { repoId: params['repoId'], requestId: params['requestId'] };
}

describe.skip('qits-landing-app → qits-projects-service pact: one release request', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
    pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });
  });

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

  it('show-release-request: the page reads the request', () =>
    given(
      'show-release-request',
      STATES.pending,
      'getReleaseRequest',
      GET_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'getReleaseRequest');
      await store.load(repoId, requestId);
      expect(store.of(requestId)?.request.status).toBe('loaded');
    }));

  it('show-release-request: the page reads what the fold brought in', () =>
    given(
      'show-release-request',
      STATES.pending,
      'listReleaseRequestCommits',
      LIST_RELEASE_REQUEST_COMMITS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'listReleaseRequestCommits');
      await store.load(repoId, requestId);
      expect(store.of(requestId)?.commits.status).toBe('loaded');
    }));

  it('show-release-request: the page reads the CI verdicts on the fold', () =>
    given(
      'show-release-request',
      STATES.pending,
      'listCommitBuilds',
      LIST_COMMIT_BUILDS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'getReleaseRequest');
      await store.load(repoId, requestId);
      expect(store.of(requestId)?.builds.status).toBe('loaded');
    }));

  it('show-release-request: a released request’s page reads what it published', () =>
    given(
      'show-release-request',
      STATES.released,
      'getReleaseRequestArtifacts',
      GET_RELEASE_ARTIFACTS,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.released, 'getReleaseRequestArtifacts');
      await store.load(repoId, requestId);
      expect(store.of(requestId)?.artifacts?.status).toBe('loaded');
    }));

  it('set-release-source-priority: a branch’s priority changes', () =>
    given(
      'set-release-source-priority',
      STATES.pending,
      'setReleaseSourcePriority',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'setReleaseSourcePriority');
      const outcome = await store.setSourcePriority(repoId, requestId, 'feature/x', 'HIGH');
      expect(outcome.request?.id).toBe(requestId);
    }));

  it('approve-release-request: a person approves the fold', () =>
    given(
      'approve-release-request',
      STATES.awaitingApproval,
      'approveReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.awaitingApproval, 'approveReleaseRequest');
      const outcome = await store.approve(repoId, requestId, 'TODO-the-recorded-fold');
      expect(outcome.request?.id).toBe(requestId);
    }));

  it('decline-release-request: a person declines the fold', () =>
    given(
      'decline-release-request',
      STATES.pending,
      'declineReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'declineReleaseRequest');
      const outcome = await store.decline(repoId, requestId, 'TODO-the-recorded-fold');
      expect(outcome.request?.id).toBe(requestId);
    }));

  it('withdraw-release-request: a person calls the ask off', () =>
    given(
      'withdraw-release-request',
      STATES.pending,
      'withdrawReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId } = addressOf(STATES.pending, 'withdrawReleaseRequest');
      const outcome = await store.withdraw(repoId, requestId);
      expect(outcome.request?.state).toBe('WITHDRAWN');
    }));
});
