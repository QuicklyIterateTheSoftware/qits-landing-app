import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { client as orchestratorClient } from '../../api/orchestrator/client.gen';
import { provideHeyApiClient } from '../../api/orchestrator/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import {
  heldBy,
  isRecorded,
  orchestratorGoldenMasters as masters,
} from '../../../testing/golden-masters';
import { ARTIFACTS_CLEANUP_PLAN, ARTIFACTS_CLEANUP_SWEEP } from './cleanup.operations';

/**
 * The cleanup page's part of qits-landing-app's pact with qits-orchestrator-service (qits-2329), in
 * `pacts/qits-landing-app_qits-orchestrator-service.json`: the Artifacts section's cleanup page
 * (`cleanup.operations.ts`). The same file holds the Orchestrator section's process page, whose
 * part `core/orchestrator/processes.operations.pact.spec.ts` owns (`assertPactPart`, qits-2359).
 *
 * One store repository's plan and its sweep, in "a repository the cleanup can plan" (the
 * `repository` param, `daemons`): the provider serves qits-artifacts' recording of a plan over
 * supplied pins, one daemon version condemned and two kept, the sweep figures zeroed; and the
 * sweep's receipt, which withholds that version whole as younger than the grace window, so nothing
 * is deleted. And the plan in "a repository the cleanup has nothing to delete in" (`daemons` with
 * only its two kept versions: the dead list empty, so the page draws no Run), which skips itself
 * until the pin records it. The recordings carry exactly those entries (no `listFilteredTo`), so each list binds
 * its recorded count. A plan without the dead list (qits-orchestrator's recordings before
 * qits-2329) skips the spec and writes no pact.
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-orchestrator-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const PLANNABLE = 'a repository the cleanup can plan';
const NOTHING_TO_DELETE = 'a repository the cleanup has nothing to delete in';
const PLAN = ARTIFACTS_CLEANUP_PLAN.operationId;

/** The operations this spec owns in that file. */
const OPERATIONS = [ARTIFACTS_CLEANUP_PLAN.operationId, ARTIFACTS_CLEANUP_SWEEP.operationId];

/** Whether the pinned recording holds the dead list; until then the spec writes no pact. */
const RECORDED =
  isRecorded(PLANNABLE, PLAN, masters) &&
  heldBy(masters, PLANNABLE, PLAN, ['dead[].identity']).length > 0;

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-cleanup-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(orchestratorClient),
    ],
  });
  orchestratorClient.setConfig({ baseUrl: url });
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

/** The repository `state` recorded `operationId` for. */
const repositoryOf = (state: string, operationId: string): string =>
  masters.operation(state, operationId).params['repository'];

describe('qits-landing-app → qits-orchestrator-service pact: the cleanup page', () => {
  afterAll(() => {
    orchestratorClient.setConfig({ baseUrl: '' });
    try {
      if (RECORDED) {
        assertPactPart(
          join(dir, `${CONSUMER}-${PROVIDER}.json`),
          COMMITTED,
          OPERATIONS,
          'QITS_GOLDEN_UPDATE',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!RECORDED)(
    'show-artifacts-cleanup-plan: what a cleanup would delete and keep, each with its rule',
    () =>
      given(ARTIFACTS_CLEANUP_PLAN, PLANNABLE, 'show-artifacts-cleanup-plan').executeTest(
        async (server) => {
          const repository = repositoryOf(PLANNABLE, PLAN);
          const { data } = await at(server.url, () =>
            ARTIFACTS_CLEANUP_PLAN.fetch({ path: { repository } }),
          );
          expect(data?.executable).toBe(true);
          expect(data?.error).toBeNull();
          expect(data?.strategy).toBeTruthy();
          expect(data?.configuration?.rule).toBeTruthy();
          const [dead] = data?.dead ?? [];
          expect(dead?.identity).toBeTruthy();
          expect(dead?.rule).toBeTruthy();
          expect((data?.kept ?? []).every((kept) => !!kept.rule)).toBe(true);
          expect(typeof data?.sweep?.reclaimableBytes).toBe('number');
          expect(typeof data?.structural?.blobCount).toBe('number');
          expect((data?.pins ?? []).length).toBeGreaterThan(0);
        },
      ),
  );

  it.skipIf(!RECORDED || !isRecorded(NOTHING_TO_DELETE, PLAN, masters))(
    'show-artifacts-cleanup-plan: a plan that condemns nothing, every identity kept by a rule',
    () =>
      given(ARTIFACTS_CLEANUP_PLAN, NOTHING_TO_DELETE, 'show-artifacts-cleanup-plan').executeTest(
        async (server) => {
          const repository = repositoryOf(NOTHING_TO_DELETE, PLAN);
          const { data } = await at(server.url, () =>
            ARTIFACTS_CLEANUP_PLAN.fetch({ path: { repository } }),
          );
          expect(data?.executable).toBe(true);
          expect(data?.error).toBeNull();
          expect(data?.dead).toEqual([]);
          expect((data?.kept ?? []).length).toBeGreaterThan(0);
          expect(data?.sweep?.reclaimableBytes).toBe(0);
        },
      ),
  );

  it.skipIf(!RECORDED || !isRecorded(PLANNABLE, ARTIFACTS_CLEANUP_SWEEP.operationId, masters))(
    'sweep-artifacts-repository: the second press sweeps and answers its receipt',
    () =>
      given(ARTIFACTS_CLEANUP_SWEEP, PLANNABLE, 'sweep-artifacts-repository').executeTest(
        async (server) => {
          const repository = repositoryOf(PLANNABLE, ARTIFACTS_CLEANUP_SWEEP.operationId);
          const { data } = await at(server.url, () =>
            ARTIFACTS_CLEANUP_SWEEP.fetch({ path: { repository } }),
          );
          expect(data?.executedAt).toBeTruthy();
          expect(data?.aborted).toBeNull();
          expect(data?.deleted).toEqual([]);
          const [withheld] = data?.withheldByGraceWindow ?? [];
          expect(withheld?.identity).toBeTruthy();
          expect(typeof data?.sweep?.blobsUnlinked).toBe('number');
        },
      ),
  );
});
