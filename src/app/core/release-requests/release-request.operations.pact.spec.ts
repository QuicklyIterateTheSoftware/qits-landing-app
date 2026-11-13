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
import { consume } from '@qits/angular';
import { getReleaseRequest } from '../../api/projects';
import { assertPactPart } from '../../../testing/pact-part';
import { heldBy, projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  GET_RELEASE_REQUEST,
  UNBOUND_RELEASE_REQUEST,
  type ReleaseRequest,
} from './release-request.consumes';
import {
  APPROVAL_ELIGIBILITY,
  APPROVE_RELEASE,
  COMMIT_BUILDS,
  DECLINE_RELEASE,
  MOVE_SOURCE,
  OVERRIDE_UPSTREAM,
  RELEASE_ARTIFACTS,
  RELEASE_COMMITS,
  RELEASE_REQUEST,
  RERUN_AUTOMATION,
  RERUN_PHASE,
  SET_SOURCE_PRIORITY,
  WAIVE_AUTOMATIONS,
  WITHDRAW_RELEASE,
} from './release-request.operations';
import {
  decisionParams,
  moveParams,
  overrideParams,
  priorityParams,
  rerunAutomationParams,
  rerunPhaseParams,
  waiveParams,
  withdrawParams,
} from './release-request-writes';

/**
 * The release request operations' part of qits-landing-app's pact with qits-projects-service
 * (`release-request.operations.ts`), in `pacts/qits-landing-app_qits-projects-service.json` beside
 * the other parts (see `src/testing/pact-part.ts`).
 *
 * Moved here from `ReleaseRequestStore`'s pact spec when the store went (qits-2146), unchanged: the
 * same descriptions, states, requests and bound fields. Each test runs the operation's own `fetch`
 * (a write with the params `release-request-writes.ts` builds, as the patterns send them) against a
 * pact mock server answering with qits-projects' golden master; each interaction's `operationId`
 * and `consumes` are the operation's (its provider checked against this spec's literal).
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
  obsolete: 'a repository with a tagged release whose request went obsolete mid-publish',
} as const;

/**
 * The eligibility read (epic qits-1038), recorded by qits-projects from 2026.1022.75745 on, which
 * is what this repository now pins (`@qits/projects-golden-masters`): the recording holds both the
 * door's own answer and the awaiting-approval request's `approvalRequirements`, so this spec binds
 * them as recorded rather than adding them on top.
 */
const ELIGIBILITY = 'getReleaseRequestApprovalEligibility';

/**
 * The source move (qits-1665), recorded by qits-projects on the frozen state (rr-1's
 * `ticket/contract-12` into rr-2) from the release that adds the door. The pinned
 * `@qits/projects-golden-masters` may predate it: the interaction then skips itself (`isRecorded`,
 * read off the installed package, as `desk.operations.pact.spec.ts` does), the committed pact
 * holds no move, and once qits-maintenance bumps the pin to a release that records it the test
 * runs on its own and the pact is rewritten with `QITS_GOLDEN_UPDATE`.
 */
const MOVE = 'moveReleaseRequestSource';

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
  MOVE,
];

/** The paths a pact binds of `consumes`: all but those the store reads unbound (qits-1673). */
const UNBOUND: ReadonlySet<string> = new Set(
  // The move answers two requests, `from` and `to`, each read as `request` is.
  ['request', 'from', 'to'].flatMap((key) =>
    UNBOUND_RELEASE_REQUEST.map((path) => path.replace(/^request\./, `${key}.`)),
  ),
);
const bindable = (consumes: readonly string[]) => consumes.filter((path) => !UNBOUND.has(path));

/** The request's arrays that grow with every ask (qits-1673), so no pact pins their length. */
const GROWING = ['participants', 'items'] as const;

/** Where an answer holds a request: `request`, or the move's `from` and `to` (qits-1665). */
const REQUEST_KEYS = ['request', 'from', 'to'] as const;

interface WrittenPact {
  readonly interactions: readonly {
    readonly response: {
      readonly body?: {
        readonly content?: Partial<
          Record<(typeof REQUEST_KEYS)[number], Record<string, unknown> | null>
        >;
      };
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
    for (const at of REQUEST_KEYS) {
      const request = interaction.response.body?.content?.[at];
      if (!request) continue;
      for (const key of GROWING) {
        const values = request[key];
        if (!Array.isArray(values)) continue;
        request[key] = values.slice(0, 1);
        const rules = interaction.response.matchingRules?.body;
        if (rules)
          rules[`$.${at}.${key}`] = { combine: 'AND', matchers: [{ match: 'type', min: 0 }] };
      }
    }
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

/** What an interaction takes of an operation: its provider, operationId and `consumes`. */
interface Bound {
  readonly provider: string;
  readonly operationId: string;
  readonly consumes: readonly string[];
}

const given = (slug: InteractionSlug, state: string, op: Bound) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is not ${PROVIDER}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction: slug },
    consumes: heldBy(masters, state, op.operationId, bindable(op.consumes)),
  });
};

/**
 * `getReleaseRequest`, which the app no longer calls (the page reads the request through its
 * project), kept for the screenshot specs' states (see the per-state block below).
 */
const GET_REQUEST: Bound = {
  provider: PROVIDER,
  operationId: 'getReleaseRequest',
  consumes: GET_RELEASE_REQUEST,
};

let dir = '';
let pact: PactV4;

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

/** Whether `state`/`operationId` is recorded in the `@qits/projects-golden-masters` installed. */
function isRecorded(state: string, operationId: string): boolean {
  try {
    masters.operation(state, operationId);
    return true;
  } catch {
    return false;
  }
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
    given('show-release-request', STATES.everyState, RELEASE_REQUEST).executeTest(
      async (server) => {
        const { params } = masters.operation(STATES.everyState, 'getProjectReleaseRequest');
        const ref = params['requestQualifiedId'];
        const { data } = await at(server.url, () =>
          RELEASE_REQUEST.fetch({ path: { projectId: params['projectId'], ref } }),
        );
        expect(data?.request?.id).toBe(params['requestId']);
        expect(data?.request?.repoId).toBe(params['repositoryId']);
        expect(data?.request?.qualifiedId).toBe(ref);
      },
    ));

  // Epic qits-1580, the soft feature freeze. qits-projects records two requests of one repository
  // here: rr-1, frozen at its threshold with rr-2 queued behind it (getReleaseRequest), and rr-2,
  // queued behind rr-1 (getProjectReleaseRequest, by rr-2's logical id). So each queue id the page
  // links is bound where it is set, not only as a recorded null.
  it('show-release-request: a frozen request, with the one queued behind it', () =>
    given('show-release-request', STATES.frozen, GET_REQUEST).executeTest(async (server) => {
      const { repoId, requestId } = recorded(STATES.frozen, 'getReleaseRequest');
      const { data } = await at(server.url, () =>
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
    given('show-release-request', STATES.frozen, RELEASE_REQUEST).executeTest(async (server) => {
      const { params } = masters.operation(STATES.frozen, 'getProjectReleaseRequest');
      const ref = params['queuedRequestQualifiedId'];
      const { data } = await at(server.url, () =>
        RELEASE_REQUEST.fetch({ path: { projectId: params['projectId'], ref } }),
      );
      const request = data?.request;
      expect(request?.id).toBe(params['queuedRequestId']);
      expect(request?.queuedBehind).toBe(params['requestId']);
      expect(request?.queuedBehindQualifiedId).toBeTruthy();
      expect(request?.featureFreeze?.frozen).toBe(false);
    }));

  // An obsolete request (qits-2039): taken over mid-publish by a later request, which it names
  // (`supersededBy`), and carrying a work item. The page links both (epic qits-2000).
  it('show-release-request: an obsolete request, read through its project by its logical id', () =>
    given('show-release-request', STATES.obsolete, RELEASE_REQUEST).executeTest(async (server) => {
      const { params } = masters.operation(STATES.obsolete, 'getProjectReleaseRequest');
      const ref = params['requestQualifiedId'];
      const { data } = await at(server.url, () =>
        RELEASE_REQUEST.fetch({ path: { projectId: params['projectId'], ref } }),
      );
      const request = data?.request;
      expect(request?.state).toBe('OBSOLETE');
      // An item's work item is read unbound (UNBOUND_RELEASE_REQUEST), so the mock server does
      // not answer it; the page's spec shows it from the recording.
      expect(request?.supersededBy).toBeTruthy();
    }));

  // The page's reads, once per state the screenshot specs show. Each runs on its own: the mock
  // server matches a provider-state path by type, so a second read in the same test would get the
  // first one's answer.
  describe.each([
    [STATES.awaitingApproval, 'PENDING', true, false],
    [STATES.released, 'RELEASED', true, true],
    [STATES.conflicted, 'CONFLICTED', false, false],
    [STATES.refolded, 'READY', true, false],
    // Its failed build filed a bug ticket (`gateTicketId`), which the facts link (epic qits-2000).
    [STATES.rejected, 'REJECTED', true, false],
  ] as const)('show-release-request: %s', (state, expected, folded, released) => {
    // The page reads the request through its project (getProjectReleaseRequest, pacted above),
    // which qits-projects records in one state only. The screenshot specs show these four states,
    // and answer the project's read with each state's getReleaseRequest recording (the same
    // `{ request }` shape); `goldenMaster` serves only pacted recordings, so this keeps
    // getReleaseRequest's interaction per state, made on its own. Drop it once qits-projects
    // records getProjectReleaseRequest in these states.
    it('the request', () =>
      given('show-release-request', state, GET_REQUEST).executeTest(async (server) => {
        const { repoId, requestId } = recorded(state, 'getReleaseRequest');
        const { data } = await at(server.url, () =>
          consume(getReleaseRequest({ path: { repoId, requestId } }), GET_RELEASE_REQUEST),
        );
        expect(data?.request?.state).toBe(expected);
        if (state === STATES.awaitingApproval) {
          const request = data?.request as ReleaseRequest | undefined;
          expect(request?.approvalRequirements?.[0]?.admits).toEqual(['person']);
        }
      }));

    it('the commits its fold brought in, with their parents and the sources’ tips', () =>
      given('show-release-request', state, RELEASE_COMMITS).executeTest(async (server) => {
        const { repoId, requestId } = recorded(state, 'listReleaseRequestCommits');
        const { data } = await at(server.url, () =>
          RELEASE_COMMITS.fetch({ path: { repoId, requestId } }),
        );
        expect(data?.commits?.every((commit) => Array.isArray(commit.parents))).toBe(true);
      }));

    if (folded)
      it('the CI verdicts on its fold', () =>
        given('show-release-request', state, COMMIT_BUILDS).executeTest(async (server) => {
          const op = masters.operation(state, 'listCommitBuilds');
          const repoId = op.params['repositoryId'];
          const commitHash = op.params['mergedSha'];
          const { data } = await at(server.url, () =>
            COMMIT_BUILDS.fetch({ path: { repoId, commitHash } }),
          );
          expect(Array.isArray(data?.builds)).toBe(true);
        }));

    if (released)
      it('what it published', () =>
        given('show-release-request', state, RELEASE_ARTIFACTS).executeTest(async (server) => {
          const { repoId, requestId } = recorded(state, 'getReleaseRequestArtifacts');
          const { data } = await at(server.url, () =>
            RELEASE_ARTIFACTS.fetch({ path: { repoId, requestId } }),
          );
          expect(Array.isArray(data?.artifacts)).toBe(true);
        }));
  });

  // Epic qits-1038: which requirements on the fold the viewer may satisfy, bound to what
  // qits-projects records for the door from 2026.1022.75745 on: the requirement ids under the
  // answer's `eligibility` envelope.
  it('show-release-request: what the viewer may approve', () =>
    given('show-release-request', STATES.awaitingApproval, APPROVAL_ELIGIBILITY).executeTest(
      async (server) => {
        const { repoId, requestId } = recorded(STATES.awaitingApproval, ELIGIBILITY);
        const { data } = await at(server.url, () =>
          APPROVAL_ELIGIBILITY.fetch({ path: { repoId, requestId } }),
        );
        const { eligibility } = masters.body(STATES.awaitingApproval, ELIGIBILITY);
        expect(data?.eligibility?.eligibleRequirementIds).toEqual(
          eligibility.eligibleRequirementIds,
        );
      },
    ));

  it('set-release-source-priority: a branch’s priority changes', () =>
    given('set-release-source-priority', STATES.awaitingApproval, SET_SOURCE_PRIORITY).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(
          STATES.awaitingApproval,
          'setReleaseSourcePriority',
        );
        const { data } = await at(server.url, () =>
          SET_SOURCE_PRIORITY.fetch(
            priorityParams({ repoId, requestId }, body['branch'], body['priority']),
          ),
        );
        expect(data?.request?.id).toBe(requestId);
      },
    ));

  it('approve-release-request: a person approves the fold', () =>
    given('approve-release-request', STATES.buildRuns, APPROVE_RELEASE).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(STATES.buildRuns, 'approveReleaseRequest');
        const { data } = await at(server.url, () =>
          APPROVE_RELEASE.fetch(
            decisionParams({ repoId, requestId }, body['mergedSha'], body['note']),
          ),
        );
        expect(data?.request?.approvalState).toBe('APPROVED');
      },
    ));

  it('decline-release-request: a person declines the fold', () =>
    given('decline-release-request', STATES.awaitingApproval, DECLINE_RELEASE).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(
          STATES.awaitingApproval,
          'declineReleaseRequest',
        );
        const { data } = await at(server.url, () =>
          DECLINE_RELEASE.fetch(
            decisionParams({ repoId, requestId }, body['mergedSha'], body['note']),
          ),
        );
        expect(data?.request?.approvalState).toBe('DECLINED');
      },
    ));

  it('withdraw-release-request: a person calls the ask off', () =>
    given('withdraw-release-request', STATES.awaitingApproval, WITHDRAW_RELEASE).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(
          STATES.awaitingApproval,
          'withdrawReleaseRequest',
        );
        const { data } = await at(server.url, () =>
          WITHDRAW_RELEASE.fetch(withdrawParams({ repoId, requestId }, body['reason'])),
        );
        expect(data?.request?.state).toBe('WITHDRAWN');
      },
    ));

  it.skipIf(!isRecorded(STATES.frozen, MOVE))(
    'move-release-request-source: a branch leaves the frozen request for the one queued after it',
    () =>
      given('move-release-request-source', STATES.frozen, MOVE_SOURCE).executeTest(
        async (server) => {
          const { repoId, requestId, body } = recorded(STATES.frozen, MOVE);
          const { data: outcome } = await at(server.url, () =>
            MOVE_SOURCE.fetch(moveParams({ repoId, requestId }, body['branch'], body['reason'])),
          );
          // The mock server answers each array's elements from the recorded first one, so which
          // branches each side holds is the plain spec's to check (`release-lane-header.spec.ts`).
          expect(outcome?.from?.id).toBe(requestId);
          expect(outcome?.to?.id).toBeTruthy();
          expect(outcome?.to?.id).not.toBe(requestId);
          expect(outcome?.to?.queuedBehind).toBe(requestId);
        },
      ),
  );

  it('override-release-upstream: a person lets the request start QA past one upstream', () =>
    given('override-release-upstream', STATES.heldByUpstream, OVERRIDE_UPSTREAM).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(
          STATES.heldByUpstream,
          'overrideReleaseRequestUpstream',
        );
        const { data } = await at(server.url, () =>
          OVERRIDE_UPSTREAM.fetch(
            overrideParams({ repoId, requestId }, body['upstreamRequestId'], body['note']),
          ),
        );
        const gate = data?.request?.qualityGates?.find(
          (entry) => entry.kind === 'upstream-in-flight',
        );
        expect(gate?.checks?.[0]?.state).toBe('PASSED');
        expect(gate?.checks?.[0]?.detail).toMatch(/^Overridden by /);
      },
    ));

  // Skipped: qits-projects recorded these two calls with a `{}` body, but neither operation takes a
  // body and the client sends none, so the mock server refuses the call. Unskip once the provider
  // records them without a body.
  it.skip('rerun-release-phase: a failed test run runs again', () =>
    given('rerun-release-phase', STATES.rejected, RERUN_PHASE).executeTest(async (server) => {
      const { repoId, requestId, path } = recorded(STATES.rejected, 'rerunReleasePipelinePhase');
      const phase = /\/pipeline\/([^/]+)\/rerun$/.exec(path)![1];
      const { data } = await at(server.url, () =>
        RERUN_PHASE.fetch(rerunPhaseParams({ repoId, requestId }, phase)),
      );
      expect(data?.request?.id).toBe(requestId);
    }));

  it.skip('rerun-release-automation: a failed automation runs again', () =>
    given('rerun-release-automation', STATES.failedAutomation, RERUN_AUTOMATION).executeTest(
      async (server) => {
        const { repoId, requestId, path } = recorded(
          STATES.failedAutomation,
          'rerunReleaseRequestAutomation',
        );
        const kind = /\/automations\/([^/]+)\/runs$/.exec(path)![1];
        const { response } = await at(server.url, () =>
          RERUN_AUTOMATION.fetch(rerunAutomationParams({ repoId, requestId }, kind)),
        );
        expect(response?.status).toBe(202);
      },
    ));

  it('waive-release-automations: a person waives the automations gate for the fold', () =>
    given('waive-release-automations', STATES.failedAutomation, WAIVE_AUTOMATIONS).executeTest(
      async (server) => {
        const { repoId, requestId, body } = recorded(
          STATES.failedAutomation,
          'waiveReleaseRequestAutomations',
        );
        const { data } = await at(server.url, () =>
          WAIVE_AUTOMATIONS.fetch(
            waiveParams({ repoId, requestId }, body['foldSha'], body['reason']),
          ),
        );
        expect(data?.request?.id).toBe(requestId);
      },
    ));
});
