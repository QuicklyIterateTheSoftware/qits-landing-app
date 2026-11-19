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
import { deploymentsGoldenMasters as masters, isRecorded } from '../../../testing/golden-masters';
import { isCompletedRequest, isHeldForApproval } from './deployment-requests';
import { PROJECT_DEPLOYMENT_REQUESTS } from './deployments.operations';

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
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-deployments-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const WITH_REQUESTS = 'a project with deployment requests';
const WITHOUT_REQUESTS = 'a project with no deployment requests';
const LIST = PROJECT_DEPLOYMENT_REQUESTS.operationId;
/** Whether the pinned golden masters record either state; until then the spec writes no pact. */
const RECORDED =
  isRecorded(WITH_REQUESTS, LIST, masters) || isRecorded(WITHOUT_REQUESTS, LIST, masters);

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
    consumes: op.consumes,
  });
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
});
