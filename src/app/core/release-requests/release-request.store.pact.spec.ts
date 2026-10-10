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
import { consume, NOTHING } from '@qits/angular';
import {
  getReleaseRequestArtifacts,
  listCommitBuilds,
  listReleaseRequestCommits,
} from '../../api/projects';
import { assertPactPart } from '../../../testing/pact-part';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
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
 * The page's reads are pacted once per state the screenshot specs show, so each body they flush is
 * one the provider verifies. A read binds the fields its list names that the state's recording
 * holds (`heldBy`): a field under a recorded `null` is bound in the state that has it.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-projects-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The provider states this spec uses. */
const STATES = {
  awaitingApproval: 'a release request awaiting approval',
  buildRuns: 'a release request awaiting approval while its build runs',
  released: 'a released release request',
  conflicted: 'a conflicted release request',
  refolded: 'a refolded release request',
  rejected: 'a release request rejected by its build',
  failedAutomation: 'a release request held by a failed automation',
} as const;

/** The operations this spec owns in that file. */
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
  'rerunReleaseRequestAutomation',
  'waiveReleaseRequestAutomations',
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
    consumes: heldBy(masters, state, operationId, consumes),
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

/** The repository and request of `state`, and what its recorded `operationId` sent. */
function recorded(state: string, operationId: string) {
  const op = masters.operation(state, operationId);
  return {
    repoId: op.params['repositoryId'],
    requestId: op.params['requestId'],
    // The recorded body's state params ("{mergedSha}") travel as they are: the provider puts this
    // run's values in their place.
    body: (op.body ?? {}) as Record<string, string>,
    path: op.path,
  };
}

/** One read the store makes after the request, made on its own against the mock server. */
function readOnItsOwn<T>(url: string, call: () => Promise<T>): Promise<T> {
  storeAt(url);
  return TestBed.runInInjectionContext(call);
}

describe('qits-landing-app → qits-projects-service pact: one release request', () => {
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

  // The page's reads, once per state the screenshot specs show. Each runs on its own: the mock
  // server matches a provider-state path by type, so a second read in the same test would get the
  // first one's answer.
  describe.each([
    [STATES.awaitingApproval, 'PENDING', true, false],
    [STATES.released, 'RELEASED', true, true],
    [STATES.conflicted, 'CONFLICTED', false, false],
    [STATES.refolded, 'READY', true, false],
  ] as const)('show-release-request: %s', (state, expected, folded, released) => {
    it('the request', () =>
      given('show-release-request', state, 'getReleaseRequest', GET_RELEASE_REQUEST).executeTest(
        async (server) => {
          const store = storeAt(server.url);
          const { repoId, requestId } = recorded(state, 'getReleaseRequest');
          await store.load(repoId, requestId);
          expect(store.of(requestId)?.request.value?.state).toBe(expected);
        },
      ));

    it('the commits its fold brought in, with their parents and the sources’ tips', () =>
      given(
        'show-release-request',
        state,
        'listReleaseRequestCommits',
        LIST_RELEASE_REQUEST_COMMITS,
      ).executeTest(async (server) => {
        const { repoId, requestId } = recorded(state, 'listReleaseRequestCommits');
        const { data } = await readOnItsOwn(server.url, () =>
          consume(
            listReleaseRequestCommits({ path: { repoId, requestId } }),
            LIST_RELEASE_REQUEST_COMMITS,
          ),
        );
        expect(data?.commits?.every((commit) => Array.isArray(commit.parents))).toBe(true);
      }));

    if (folded)
      it('the CI verdicts on its fold', () =>
        given('show-release-request', state, 'listCommitBuilds', LIST_COMMIT_BUILDS).executeTest(
          async (server) => {
            const op = masters.operation(state, 'listCommitBuilds');
            const repoId = op.params['repositoryId'];
            const commitHash = op.params['mergedSha'];
            const { data } = await readOnItsOwn(server.url, () =>
              consume(listCommitBuilds({ path: { repoId, commitHash } }), LIST_COMMIT_BUILDS),
            );
            expect(Array.isArray(data?.builds)).toBe(true);
          },
        ));

    if (released)
      it('what it published', () =>
        given(
          'show-release-request',
          state,
          'getReleaseRequestArtifacts',
          GET_RELEASE_ARTIFACTS,
        ).executeTest(async (server) => {
          const { repoId, requestId } = recorded(state, 'getReleaseRequestArtifacts');
          const { data } = await readOnItsOwn(server.url, () =>
            consume(
              getReleaseRequestArtifacts({ path: { repoId, requestId } }),
              GET_RELEASE_ARTIFACTS,
            ),
          );
          expect(Array.isArray(data?.artifacts)).toBe(true);
        }));
  });

  it('set-release-source-priority: a branch’s priority changes', () =>
    given(
      'set-release-source-priority',
      STATES.awaitingApproval,
      'setReleaseSourcePriority',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(
        STATES.awaitingApproval,
        'setReleaseSourcePriority',
      );
      const outcome = await store.setSourcePriority(
        repoId,
        requestId,
        body['branch'],
        body['priority'],
      );
      expect(outcome.request?.id).toBe(requestId);
    }));

  it('approve-release-request: a person approves the fold', () =>
    given(
      'approve-release-request',
      STATES.buildRuns,
      'approveReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(STATES.buildRuns, 'approveReleaseRequest');
      const outcome = await store.approve(repoId, requestId, body['mergedSha'], body['note']);
      expect(outcome.request?.approvalState).toBe('APPROVED');
    }));

  it('decline-release-request: a person declines the fold', () =>
    given(
      'decline-release-request',
      STATES.awaitingApproval,
      'declineReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(
        STATES.awaitingApproval,
        'declineReleaseRequest',
      );
      const outcome = await store.decline(repoId, requestId, body['mergedSha'], body['note']);
      expect(outcome.request?.approvalState).toBe('DECLINED');
    }));

  it('withdraw-release-request: a person calls the ask off', () =>
    given(
      'withdraw-release-request',
      STATES.awaitingApproval,
      'withdrawReleaseRequest',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(
        STATES.awaitingApproval,
        'withdrawReleaseRequest',
      );
      const outcome = await store.withdraw(repoId, requestId, body['reason']);
      expect(outcome.request?.state).toBe('WITHDRAWN');
    }));

  // Skipped: qits-projects recorded these two calls with a `{}` body, but neither operation takes a
  // body and the client sends none, so the mock server refuses the call. Unskip once the provider
  // records them without a body.
  it.skip('rerun-release-phase: a failed test run runs again', () =>
    given(
      'rerun-release-phase',
      STATES.rejected,
      'rerunReleasePipelinePhase',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, path } = recorded(STATES.rejected, 'rerunReleasePipelinePhase');
      const phase = /\/pipeline\/([^/]+)\/rerun$/.exec(path)![1];
      const outcome = await store.rerunPhase(repoId, requestId, phase);
      expect(outcome.request?.id).toBe(requestId);
    }));

  it.skip('rerun-release-automation: a failed automation runs again', () =>
    given(
      'rerun-release-automation',
      STATES.failedAutomation,
      'rerunReleaseRequestAutomation',
      NOTHING,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, path } = recorded(
        STATES.failedAutomation,
        'rerunReleaseRequestAutomation',
      );
      const kind = /\/automations\/([^/]+)\/runs$/.exec(path)![1];
      const outcome = await store.rerunAutomation(repoId, requestId, kind);
      expect(outcome.status).toBe(202);
    }));

  it('waive-release-automations: a person waives the automations gate for the fold', () =>
    given(
      'waive-release-automations',
      STATES.failedAutomation,
      'waiveReleaseRequestAutomations',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(
        STATES.failedAutomation,
        'waiveReleaseRequestAutomations',
      );
      const outcome = await store.waiveAutomations(
        repoId,
        requestId,
        body['foldSha'],
        body['reason'],
      );
      expect(outcome.request?.id).toBe(requestId);
    }));
});
