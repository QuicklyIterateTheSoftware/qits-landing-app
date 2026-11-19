import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as deploymentsClient } from '../../api/deployments/client.gen';
import { provideHeyApiClient } from '../../api/deployments/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import {
  deploymentsGoldenMasters as masters,
  heldBy,
  isRecorded,
} from '../../../testing/golden-masters';
import {
  isCompletedRequest,
  isDeclined,
  isHeldForApproval,
  variantsToCome,
} from './deployment-requests';
import {
  APPROVE_DEPLOYMENT_REQUEST,
  DECLINE_DEPLOYMENT_REQUEST,
  DEPLOYMENT_REQUEST,
  ENVIRONMENTS,
  PROJECT_DEPLOYMENT_REQUESTS,
  RELEASE_DEPLOYMENT_REQUESTS,
  TIER_DEPLOYMENTS,
} from './deployments.operations';

/**
 * qits-landing-app's pact with qits-deployments-service (qits-2315), in
 * `pacts/qits-landing-app_qits-deployments-service.json`: the Deployments section's reads
 * (`deployments.operations.ts`). The operations are the only users of qits-deployments' client, so
 * this file is the whole pact.
 *
 * One project's deployment requests (`?projectId=`), in a project with one request held at the
 * gate and one deployed ACTIVE through a met gate (`a project with deployment requests`), and in a
 * project none was ever asked for (`a project with no deployment requests`). qits-deployments
 * records both from 2026.1119.842 on: until the pin reaches it, each test skips
 * itself and the committed pact holds no such interaction.
 *
 * One deployment request's page (qits-2322): the request read in each state that records it (one
 * that deployed ACTIVE, one held for approval, one held to be declined), Approve and Decline (with
 * the recorded note) of the held ones, the tier's deployments (`an application deployed in an
 * environment`) and the tiers (`an environment`).
 *
 * One release's deployment requests (qits-2323, `?repoId=&version=&includeVariants=true`): a
 * release whose main application and its `private` variant both deployed (`a release with a
 * variant deployed`), and a release none was asked for (`a release with no deployment requests`,
 * recorded by qits-deployments from a later release than the first: until the pin reaches it, its
 * test skips itself and the committed pact holds no such interaction), and a release that produced
 * exactly one request (`a release with one deployment request`, recorded later still, skipped the
 * same way), which the page opens in its own place.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-deployments-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const WITH_REQUESTS = 'a project with deployment requests';
const DEPLOYED = 'a deployment request that deployed';
const HELD = 'a deployment request held for approval';
const HELD_FOR_DECLINE = 'a deployment request held for decline';
const IN_TIER = 'an application deployed in an environment';
const AN_ENVIRONMENT = 'an environment';
const WITHOUT_REQUESTS = 'a project with no deployment requests';
const RELEASE_WITH_VARIANT = 'a release with a variant deployed';
const RELEASE_WITHOUT_REQUESTS = 'a release with no deployment requests';
const RELEASE_WITH_ONE = 'a release with one deployment request';
const LIST = PROJECT_DEPLOYMENT_REQUESTS.operationId;
/** Whether the pinned golden masters record any state; until then the spec writes no pact. */
const RECORDED =
  isRecorded(WITH_REQUESTS, LIST, masters) ||
  isRecorded(WITHOUT_REQUESTS, LIST, masters) ||
  isRecorded(DEPLOYED, DEPLOYMENT_REQUEST.operationId, masters);

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-deployments-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(deploymentsClient),
    ],
  });
  deploymentsClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction for `op` in `state`, triggered by `interaction`; `op` must be `PROVIDER`'s. */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    // A request that queued nothing records `deployment: null`: its fields bind where recorded.
    consumes: heldBy(masters, state, op.operationId, op.consumes),
  });
};

/** The request `state` recorded `operationId` for. */
const requestOf = (state: string, operationId: string): string =>
  masters.operation(state, operationId).params['id'];

/** The release (`repoId`, `version`) `state` recorded its requests read for, variants included. */
const releaseOf = (state: string) => {
  const { params } = masters.operation(state, LIST);
  return { repoId: params['repoId'], version: params['version'], includeVariants: true };
};

/** The project `state` recorded its requests read for. */
const projectOf = (state: string): string => masters.operation(state, LIST).params['projectId'];

describe('qits-landing-app → qits-deployments-service pact: the Deployments section', () => {
  afterAll(() => {
    deploymentsClient.setConfig({ baseUrl: '' });
    try {
      if (RECORDED)
        assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!isRecorded(WITH_REQUESTS, LIST, masters))(
    'show-project-deployment-requests: a request held at the gate and one deployed',
    () =>
      given(
        PROJECT_DEPLOYMENT_REQUESTS,
        WITH_REQUESTS,
        'show-project-deployment-requests',
      ).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          PROJECT_DEPLOYMENT_REQUESTS.fetch({ query: { projectId: projectOf(WITH_REQUESTS) } }),
        );
        expect(error).toBeUndefined();
        const [held, deployed] = data?.deploymentRequests ?? [];
        expect(held && isHeldForApproval(held)).toBe(true);
        expect(held && isCompletedRequest(held)).toBe(false);
        expect(deployed?.qualityGate).toBe('MET');
        expect(deployed?.deploymentStatus).toBe('ACTIVE');
        expect(deployed && isCompletedRequest(deployed)).toBe(true);
      }),
  );

  it.skipIf(!isRecorded(WITHOUT_REQUESTS, LIST, masters))(
    'show-project-deployment-requests: a project none was asked for',
    () =>
      given(
        PROJECT_DEPLOYMENT_REQUESTS,
        WITHOUT_REQUESTS,
        'show-project-deployment-requests',
      ).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          PROJECT_DEPLOYMENT_REQUESTS.fetch({
            query: { projectId: projectOf(WITHOUT_REQUESTS) },
          }),
        );
        expect(error).toBeUndefined();
        expect(data?.deploymentRequests).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(RELEASE_WITH_VARIANT, LIST, masters))(
    'show-release-deployment-requests: a release whose main application and variant deployed',
    () =>
      given(
        RELEASE_DEPLOYMENT_REQUESTS,
        RELEASE_WITH_VARIANT,
        'show-release-deployment-requests',
      ).executeTest(async (server) => {
        const query = releaseOf(RELEASE_WITH_VARIANT);
        const { data, error } = await at(server.url, () =>
          RELEASE_DEPLOYMENT_REQUESTS.fetch({ query }),
        );
        expect(error).toBeUndefined();
        const rows = data?.deploymentRequests ?? [];
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.repoId === query.repoId)).toBe(true);
        expect(rows.every((row) => row.version === query.version)).toBe(true);
        const variant = rows.find((row) => row.variant);
        const main = rows.find((row) => !row.variant);
        expect(main?.variants).toContain(variant?.variant);
        expect(main && variantsToCome(main, rows)).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(RELEASE_WITHOUT_REQUESTS, LIST, masters))(
    'show-release-deployment-requests: a release none was asked for',
    () =>
      given(
        RELEASE_DEPLOYMENT_REQUESTS,
        RELEASE_WITHOUT_REQUESTS,
        'show-release-deployment-requests',
      ).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          RELEASE_DEPLOYMENT_REQUESTS.fetch({ query: releaseOf(RELEASE_WITHOUT_REQUESTS) }),
        );
        expect(error).toBeUndefined();
        expect(data?.deploymentRequests).toEqual([]);
      }),
  );

  it.skipIf(!isRecorded(RELEASE_WITH_ONE, LIST, masters))(
    'show-release-deployment-requests: a release that produced one request',
    () =>
      given(
        RELEASE_DEPLOYMENT_REQUESTS,
        RELEASE_WITH_ONE,
        'show-release-deployment-requests',
      ).executeTest(async (server) => {
        const { data, error } = await at(server.url, () =>
          RELEASE_DEPLOYMENT_REQUESTS.fetch({ query: releaseOf(RELEASE_WITH_ONE) }),
        );
        expect(error).toBeUndefined();
        const rows = data?.deploymentRequests ?? [];
        expect(rows.map((row) => row.id)).toEqual([
          masters.operation(RELEASE_WITH_ONE, LIST).params['deploymentRequestId'],
        ]);
        expect(rows[0]?.variant ?? null).toBeNull();
      }),
  );

  /** The request read in `state`, by the id it recorded. */
  const readIn = (state: string) =>
    given(DEPLOYMENT_REQUEST, state, 'show-deployment-request').executeTest(async (server) => {
      const id = requestOf(state, DEPLOYMENT_REQUEST.operationId);
      const { data, error } = await at(server.url, () =>
        DEPLOYMENT_REQUEST.fetch({ path: { id } }),
      );
      expect(error).toBeUndefined();
      expect(data?.deploymentRequest?.id).toBe(id);
      return data;
    });

  it.skipIf(!isRecorded(DEPLOYED, DEPLOYMENT_REQUEST.operationId, masters))(
    'show-deployment-request: a request that deployed ACTIVE',
    async () => {
      const data = await readIn(DEPLOYED);
      expect(data?.deploymentRequest?.qualityGate).toBe('MET');
      expect(data?.deployment?.status).toBe('ACTIVE');
    },
  );

  it.skipIf(!isRecorded(HELD, DEPLOYMENT_REQUEST.operationId, masters))(
    'show-deployment-request: a request held for approval',
    async () => {
      const data = await readIn(HELD);
      expect(data?.deploymentRequest && isHeldForApproval(data.deploymentRequest)).toBe(true);
      expect(data?.deployment ?? null).toBeNull();
    },
  );

  it.skipIf(!isRecorded(HELD_FOR_DECLINE, DEPLOYMENT_REQUEST.operationId, masters))(
    'show-deployment-request: a request held, to be declined',
    async () => {
      const data = await readIn(HELD_FOR_DECLINE);
      expect(data?.deploymentRequest && isHeldForApproval(data.deploymentRequest)).toBe(true);
    },
  );

  it.skipIf(!isRecorded(HELD, APPROVE_DEPLOYMENT_REQUEST.operationId, masters))(
    'approve-deployment-request: approving a held request queues its deployment',
    () =>
      given(APPROVE_DEPLOYMENT_REQUEST, HELD, 'approve-deployment-request').executeTest(
        async (server) => {
          const id = requestOf(HELD, APPROVE_DEPLOYMENT_REQUEST.operationId);
          const { data, error } = await at(server.url, () =>
            APPROVE_DEPLOYMENT_REQUEST.fetch({ path: { id } }),
          );
          expect(error).toBeUndefined();
          expect(data?.deploymentRequest?.qualityGate).toBe('MET');
          expect(data?.deploymentRequest?.approvedBy).toBeTruthy();
          expect(data?.deployment?.status).toBe('QUEUED');
        },
      ),
  );

  it.skipIf(!isRecorded(HELD_FOR_DECLINE, DECLINE_DEPLOYMENT_REQUEST.operationId, masters))(
    'decline-deployment-request: declining a held request, with a note, deploys nothing',
    () =>
      given(DECLINE_DEPLOYMENT_REQUEST, HELD_FOR_DECLINE, 'decline-deployment-request').executeTest(
        async (server) => {
          const op = masters.operation(HELD_FOR_DECLINE, DECLINE_DEPLOYMENT_REQUEST.operationId);
          const note = (op.body as { note?: string } | undefined)?.note;
          const { data, error } = await at(server.url, () =>
            DECLINE_DEPLOYMENT_REQUEST.fetch({ path: { id: op.params['id'] }, body: { note } }),
          );
          expect(error).toBeUndefined();
          expect(data?.deploymentRequest && isDeclined(data.deploymentRequest)).toBe(true);
          expect(data?.deployment ?? null).toBeNull();
        },
      ),
  );

  it.skipIf(!isRecorded(IN_TIER, TIER_DEPLOYMENTS.operationId, masters))(
    'show-deployment-request: the tier’s deployments',
    () =>
      given(TIER_DEPLOYMENTS, IN_TIER, 'show-deployment-request').executeTest(async (server) => {
        const op = masters.operation(IN_TIER, TIER_DEPLOYMENTS.operationId);
        const environmentId = op.params['environmentId'];
        const { data, error } = await at(server.url, () =>
          TIER_DEPLOYMENTS.fetch({ query: { environmentId } }),
        );
        expect(error).toBeUndefined();
        const [deployment] = data?.deployments ?? [];
        expect(deployment?.status).toBe('ACTIVE');
        expect(deployment?.applicationName).toBe(op.params['applicationName']);
      }),
  );

  it.skipIf(!isRecorded(AN_ENVIRONMENT, ENVIRONMENTS.operationId, masters))(
    'show-deployment-request: the tiers, for the tier’s name',
    () =>
      given(ENVIRONMENTS, AN_ENVIRONMENT, 'show-deployment-request').executeTest(async (server) => {
        const environmentId = masters.operation(AN_ENVIRONMENT, ENVIRONMENTS.operationId).params[
          'environmentId'
        ];
        const { data, error } = await at(server.url, () => ENVIRONMENTS.fetch({}));
        expect(error).toBeUndefined();
        const tier = data?.environments?.find((environment) => environment.id === environmentId);
        expect(tier?.name).toBeTruthy();
      }),
  );
});
