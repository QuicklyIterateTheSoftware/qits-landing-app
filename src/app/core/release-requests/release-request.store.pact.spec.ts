import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { addGoldenInteraction } from '@qits/angular/testing';
import { consume, NOTHING } from '@qits/angular';
import {
  getReleaseRequest,
  getReleaseRequestArtifacts,
  listCommitBuilds,
  listReleaseRequestCommits,
} from '../../api/projects';
import { assertPactPart } from '../../../testing/pact-part';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  CHANGED_RELEASE_REQUEST,
  GET_APPROVAL_ELIGIBILITY,
  GET_PROJECT_RELEASE_REQUEST,
  GET_RELEASE_ARTIFACTS,
  GET_RELEASE_REQUEST,
  LIST_COMMIT_BUILDS,
  LIST_RELEASE_REQUEST_COMMITS,
  UNBOUND_RELEASE_REQUEST,
  type ReleaseRequest,
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
  everyState: 'a project with release requests in every state',
  awaitingApproval: 'a release request awaiting approval',
  buildRuns: 'a release request awaiting approval while its build runs',
  released: 'a released release request',
  conflicted: 'a conflicted release request',
  refolded: 'a refolded release request',
  rejected: 'a release request rejected by its build',
  failedAutomation: 'a release request held by a failed automation',
  heldByUpstream: 'a release request held by an upstream release',
  frozen: 'a frozen release request with a queued next request',
} as const;

/**
 * The eligibility read (epic qits-1038), recorded by qits-projects from 2026.1022.75745 on, which
 * is what this repository now pins (`@qits/projects-golden-masters`): the recording holds both the
 * door's own answer and the awaiting-approval request's `approvalRequirements`, so this spec binds
 * them as recorded rather than adding them on top.
 */
const ELIGIBILITY = 'getReleaseRequestApprovalEligibility';

/** The operations this spec owns in that file. */
const OPERATIONS = [
  ELIGIBILITY,
  'getProjectReleaseRequest',
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
  'overrideReleaseRequestUpstream',
];

/** The paths a pact binds of `consumes`: all but those the store reads unbound (qits-1673). */
const UNBOUND: ReadonlySet<string> = new Set(UNBOUND_RELEASE_REQUEST);
const bindable = (consumes: readonly string[]) => consumes.filter((path) => !UNBOUND.has(path));

/** The request's arrays that grow with every ask (qits-1673), so no pact pins their length. */
const GROWING = ['participants', 'items'] as const;

interface WrittenPact {
  readonly interactions: readonly {
    readonly response: {
      readonly body?: { readonly content?: { request?: Record<string, unknown> | null } };
      readonly matchingRules?: { body?: Record<string, unknown> };
    };
  }[];
}

/**
 * `addGoldenInteraction` pins every array to the length qits-projects recorded. A request's
 * `participants` (everyone who asked) and `items` (one per explicit source) grow with every ask, so
 * this opens them (`type`, min 0, no max) on every interaction whose recording holds them, and cuts
 * each to its first recorded element: pact-jvm verifies every answered element against it, so it
 * must hold no null (an item's `workItem`, null where the branch names no work item, is never
 * bound: `UNBOUND_RELEASE_REQUEST`). An array recorded empty stays `[]`, unpinned. Runs on the pact
 * this spec just generated, before `assertPactPart`, so the mock server still answered with the
 * whole recording.
 */
function openEndedGrowingArrays(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as WrittenPact;
  for (const interaction of written.interactions) {
    const request = interaction.response.body?.content?.request;
    if (!request) continue;
    for (const key of GROWING) {
      const values = request[key];
      if (!Array.isArray(values)) continue;
      request[key] = values.slice(0, 1);
      const rules = interaction.response.matchingRules?.body;
      if (rules)
        rules[`$.request.${key}`] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
    }
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

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
    consumes: heldBy(masters, state, operationId, bindable(consumes)),
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
      openEndedGrowingArrays(join(dir, `${CONSUMER}-${PROVIDER}.json`));
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

  it('show-release-request: the request, read through its project by its logical id', () =>
    given(
      'show-release-request',
      STATES.everyState,
      'getProjectReleaseRequest',
      GET_PROJECT_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params } = masters.operation(STATES.everyState, 'getProjectReleaseRequest');
      const ref = params['requestQualifiedId'];
      await store.load(params['projectId'], ref);
      const view = store.of(ref);
      expect(view?.request.value?.id).toBe(params['requestId']);
      expect(view?.request.value?.repoId).toBe(params['repositoryId']);
      expect(view?.qualifiedId).toBe(ref);
    }));

  // Epic qits-1580, the soft feature freeze. qits-projects records two requests of one repository
  // here: rr-1, frozen at its threshold with rr-2 queued behind it (getReleaseRequest), and rr-2,
  // queued behind rr-1 (getProjectReleaseRequest, by rr-2's logical id). So each queue id the page
  // links is bound where it is set, not only as a recorded null.
  it('show-release-request: a frozen request, with the one queued behind it', () =>
    given(
      'show-release-request',
      STATES.frozen,
      'getReleaseRequest',
      GET_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const { repoId, requestId } = recorded(STATES.frozen, 'getReleaseRequest');
      const { data } = await readOnItsOwn(server.url, () =>
        consume(getReleaseRequest({ path: { repoId, requestId } }), GET_RELEASE_REQUEST),
      );
      const { params } = masters.operation(STATES.frozen, 'getReleaseRequest');
      expect(data?.request?.featureFreeze?.frozen).toBe(true);
      expect(data?.request?.queuedNext).toBe(params['queuedRequestId']);
      expect(data?.request?.queuedNextQualifiedId).toBe(params['queuedRequestQualifiedId']);
      // A pinned array answers its first recorded element at every index (here `main`), so the
      // markers are bound by type; which source counts is the plain specs' business.
      expect(typeof data?.request?.sources?.[0]?.feature).toBe('boolean');
      expect(typeof data?.request?.sources?.[0]?.explicitJoin).toBe('boolean');
    }));

  it('show-release-request: a queued request, read through its project by its logical id', () =>
    given(
      'show-release-request',
      STATES.frozen,
      'getProjectReleaseRequest',
      GET_PROJECT_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { params } = masters.operation(STATES.frozen, 'getProjectReleaseRequest');
      const ref = params['queuedRequestQualifiedId'];
      await store.load(params['projectId'], ref);
      const request = store.of(ref)?.request.value;
      expect(request?.id).toBe(params['queuedRequestId']);
      expect(request?.queuedBehind).toBe(params['requestId']);
      expect(request?.queuedBehindQualifiedId).toBeTruthy();
      expect(request?.featureFreeze?.frozen).toBe(false);
    }));

  // The page's reads, once per state the screenshot specs show. Each runs on its own: the mock
  // server matches a provider-state path by type, so a second read in the same test would get the
  // first one's answer.
  describe.each([
    [STATES.awaitingApproval, 'PENDING', true, false],
    [STATES.released, 'RELEASED', true, true],
    [STATES.conflicted, 'CONFLICTED', false, false],
    [STATES.refolded, 'READY', true, false],
  ] as const)('show-release-request: %s', (state, expected, folded, released) => {
    // The page reads the request through its project (getProjectReleaseRequest, pacted above),
    // which qits-projects records in one state only. The screenshot specs show these four states,
    // and answer the project's read with each state's getReleaseRequest recording (the same
    // `{ request }` shape); `goldenMaster` serves only pacted recordings, so this keeps
    // getReleaseRequest's interaction per state, made on its own. Drop it once qits-projects
    // records getProjectReleaseRequest in these states.
    it('the request', () =>
      given('show-release-request', state, 'getReleaseRequest', GET_RELEASE_REQUEST).executeTest(
        async (server) => {
          const { repoId, requestId } = recorded(state, 'getReleaseRequest');
          const { data } = await readOnItsOwn(server.url, () =>
            consume(getReleaseRequest({ path: { repoId, requestId } }), GET_RELEASE_REQUEST),
          );
          expect(data?.request?.state).toBe(expected);
          if (state === STATES.awaitingApproval) {
            const request = data?.request as ReleaseRequest | undefined;
            expect(request?.approvalRequirements?.[0]?.admits).toEqual(['person']);
          }
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

  // Epic qits-1038: which requirements on the fold the viewer may satisfy, bound to what
  // qits-projects records for the door from 2026.1022.75745 on: the requirement ids under the
  // answer's `eligibility` envelope.
  it('show-release-request: what the viewer may approve', () =>
    given(
      'show-release-request',
      STATES.awaitingApproval,
      ELIGIBILITY,
      GET_APPROVAL_ELIGIBILITY,
    ).executeTest(async (server) => {
      const { repoId, requestId } = recorded(STATES.awaitingApproval, ELIGIBILITY);
      const store = storeAt(server.url);
      const read = await store.approvalEligibility(repoId, requestId);
      expect(read.status).toBe('loaded');
      const { eligibility } = masters.body(STATES.awaitingApproval, ELIGIBILITY);
      expect(read.value?.eligibleRequirementIds).toEqual(eligibility.eligibleRequirementIds);
    }));

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

  it('override-release-upstream: a person lets the request start QA past one upstream', () =>
    given(
      'override-release-upstream',
      STATES.heldByUpstream,
      'overrideReleaseRequestUpstream',
      CHANGED_RELEASE_REQUEST,
    ).executeTest(async (server) => {
      const store = storeAt(server.url);
      const { repoId, requestId, body } = recorded(
        STATES.heldByUpstream,
        'overrideReleaseRequestUpstream',
      );
      const outcome = await store.overrideUpstream(
        repoId,
        requestId,
        body['upstreamRequestId'],
        body['note'],
      );
      const gate = outcome.request?.qualityGates?.find(
        (entry) => entry.kind === 'upstream-in-flight',
      );
      expect(gate?.checks?.[0]?.state).toBe('PASSED');
      expect(gate?.checks?.[0]?.detail).toMatch(/^Overridden by /);
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
