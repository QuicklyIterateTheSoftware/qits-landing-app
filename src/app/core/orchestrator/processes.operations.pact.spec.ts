import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { QitsApiError } from '@qits/angular';
import { addGoldenInteraction, assertPactPart } from '@qits/angular/testing';
import { client as orchestratorClient } from '../../api/orchestrator/client.gen';
import { provideHeyApiClient } from '../../api/orchestrator/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { isRecorded, orchestratorGoldenMasters as masters } from '../../../testing/golden-masters';
import { columns } from './step-columns';
import { explainStart } from './process-runs';
import type { Process } from './processes.consumes';
import {
  PROCESS_LIST,
  PROCESS_RUN,
  PROCESS_RUN_STEP,
  PROCESS_RUNS,
  START_PROCESS_RUN,
} from './processes.operations';

/**
 * The process page's part of qits-landing-app's pact with qits-orchestrator-service (qits-2359,
 * `processes.operations.ts`), in `pacts/qits-landing-app_qits-orchestrator-service.json`, the one
 * part left of that file (the cleanup doors are gone, qits-2477; `assertPactPart`).
 *
 * The Orchestrator section's process page (`show-orchestrator-process`) reads the process in "the
 * gc process" (now listing gc, scan and sbom-check); its runs and the newest run, without bodies (`bodies=false`), in "a
 * finished gc dry run" (one dry run, 21 steps, the sweep SKIPPED); the runs in "the gc process before
 * its first run" (`[]`); and the runs and the run in "a running gc run" (one real run RUNNING, its
 * first steps SUCCEEDED, one RUNNING, the rest PENDING). A step's card (`open-orchestrator-step`)
 * reads `artifacts.plan` whole in "a finished gc dry run" (a POST with a body and a response). Dry
 * run (`start-orchestrator-dry-run`) starts one in "no active gc run" (202, the new run's id) and is
 * refused in "a running gc run" (409, the service's `message`).
 *
 * The scan and sbom-check pages (qits-2490) read the process in "the scan process" and "the
 * sbom-check process" (each lists all three, the kind's `dryRunnable` false); their runs, the
 * newest run and one step whole in "a finished scan run" (four steps in two chains, `internal.follow`
 * opened) and "a finished sbom-check run" (one step, `check`); and Run now's real start
 * (`start-orchestrator-run`, `{ dryRun: false }`) in "no active scan run" and "no active sbom-check
 * run" (202). Neither page offers Dry run, so their 400 for `{ dryRun: true }` is not bound.
 *
 * No recording holds a real gc start: the provider cannot run a real gc in its test, so gc's Run
 * now request is the page's plain spec's.
 *
 * The process list is open-ended (`openEndedProcessList`): it is bound as "at least one process
 * of this shape", never the recorded count, so a provider listing one more process still
 * satisfies it (the old pin to exactly one is what qits-orchestrator's KNOWN_WRONG names).
 *
 * qits-orchestrator records these from its release carrying qits-2359 on (the operationIds and
 * states above); on an older `@qits/orchestrator-golden-masters` pin every interaction skips itself
 * and the part is not checked, so the committed file waits for qits-maintenance's bump. Each test
 * runs the operation's own `fetch`; the interaction's `operationId` and `consumes` are the
 * operation's.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-orchestrator-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The operations this spec owns in that file. */
const OPERATIONS = [
  PROCESS_LIST.operationId,
  PROCESS_RUNS.operationId,
  PROCESS_RUN.operationId,
  PROCESS_RUN_STEP.operationId,
  START_PROCESS_RUN.operationId,
];

const PROCESS = 'the gc process';
const FINISHED = 'a finished gc dry run';
const NEVER_RAN = 'the gc process before its first run';
const RUNNING = 'a running gc run';
const IDLE = 'no active gc run';
const SCAN = 'the scan process';
const SCAN_FINISHED = 'a finished scan run';
const SCAN_IDLE = 'no active scan run';
const SBOM = 'the sbom-check process';
const SBOM_FINISHED = 'a finished sbom-check run';
const SBOM_IDLE = 'no active sbom-check run';

/** Every recording this spec binds; until the pin holds them all, nothing is bound or checked. */
const RECORDED = (
  [
    [PROCESS, PROCESS_LIST],
    [FINISHED, PROCESS_RUNS],
    [FINISHED, PROCESS_RUN],
    [FINISHED, PROCESS_RUN_STEP],
    [NEVER_RAN, PROCESS_RUNS],
    [RUNNING, PROCESS_RUNS],
    [RUNNING, PROCESS_RUN],
    [RUNNING, START_PROCESS_RUN],
    [IDLE, START_PROCESS_RUN],
    [SCAN, PROCESS_LIST],
    [SCAN_FINISHED, PROCESS_RUNS],
    [SCAN_FINISHED, PROCESS_RUN],
    [SCAN_FINISHED, PROCESS_RUN_STEP],
    [SCAN_IDLE, START_PROCESS_RUN],
    [SBOM, PROCESS_LIST],
    [SBOM_FINISHED, PROCESS_RUNS],
    [SBOM_FINISHED, PROCESS_RUN],
    [SBOM_FINISHED, PROCESS_RUN_STEP],
    [SBOM_IDLE, START_PROCESS_RUN],
  ] as const
).every(([state, op]) => isRecorded(state, op.operationId, masters));

/** One matcher of a generated pact's body rule, e.g. `{ match: 'type', min: 1, max: 1 }`. */
interface Matcher {
  readonly match: string;
  min?: number;
  max?: number;
}
interface GeneratedPact {
  readonly interactions: readonly {
    readonly comments?: {
      readonly references?: { readonly ['qits-call']?: { readonly operationId?: string } };
    };
    readonly response: {
      readonly matchingRules?: { readonly body?: Record<string, { matchers: Matcher[] }> };
    };
  }[];
}

/**
 * Opens every `listProcesses` answer the written pact binds: `addGoldenInteraction` pins a list it
 * is not told is filtered to exactly its recorded length (`min` = `max`), and the page looks up the
 * process it shows, so any list of processes of that shape serves it: at least one, no upper
 * bound.
 */
function openEndedProcessList(generated: string): void {
  const written = JSON.parse(readFileSync(generated, 'utf8')) as GeneratedPact;
  for (const interaction of written.interactions) {
    if (interaction.comments?.references?.['qits-call']?.operationId !== 'listProcesses') continue;
    const matcher = interaction.response.matchingRules?.body?.['$']?.matchers.find(
      (m) => m.match === 'type',
    );
    if (!matcher || matcher.max == null) {
      throw new Error('listProcesses no longer pins its length: update openEndedProcessList');
    }
    delete matcher.max;
    matcher.min = 1;
  }
  writeFileSync(generated, JSON.stringify(written, null, 2));
}

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-processes-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` with the client pointed at the mock server at `url`, in an injection context. */
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
  op: { provider: string; operationId: string; consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
  consumes: readonly string[] = op.consumes,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes,
  });
};

/** The provider-state param `name` of `state`'s recording of `operationId`. */
const param = (state: string, operationId: string, name: string): string =>
  masters.operation(state, operationId).params[name];

/** The `{ dryRun }` body `state` recorded its start with. */
const sentDryRun = (state: string): boolean =>
  (masters.operation(state, START_PROCESS_RUN.operationId).body as { dryRun: boolean }).dryRun;

describe('qits-landing-app → qits-orchestrator-service pact: the process page', () => {
  afterAll(() => {
    orchestratorClient.setConfig({ baseUrl: '' });
    try {
      if (RECORDED) {
        const generated = join(dir, `${CONSUMER}-${PROVIDER}.json`);
        openEndedProcessList(generated);
        assertPactPart(generated, COMMITTED, OPERATIONS, 'QITS_GOLDEN_UPDATE');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('declares the provider this spec binds', () => {
    for (const op of [PROCESS_LIST, PROCESS_RUNS, PROCESS_RUN, PROCESS_RUN_STEP, START_PROCESS_RUN])
      expect(op.provider).toBe(PROVIDER);
  });

  it.skipIf(!RECORDED)('show-orchestrator-process: the page names the process it shows', () =>
    given(PROCESS_LIST, PROCESS, 'show-orchestrator-process').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => PROCESS_LIST.fetch({}));
      expect(error).toBeUndefined();
      const gc = (data ?? []).find((known) => known.kind === 'gc');
      expect(gc?.name).toBe('Garbage collection');
      expect(gc?.description).toBeTruthy();
      expect(gc?.dryRunnable).toBe(true);
    }),
  );

  for (const [state, kind, name] of [
    [SCAN, 'scan', 'Manifest scan'],
    [SBOM, 'sbom-check', 'SBOM check'],
  ] as const) {
    it.skipIf(!RECORDED)(
      `show-orchestrator-process: the ${kind} page names its process, which has no dry run`,
      () =>
        given(PROCESS_LIST, state, 'show-orchestrator-process').executeTest(async (server) => {
          const { data, error } = await at(server.url, () => PROCESS_LIST.fetch({}));
          expect(error).toBeUndefined();
          // The mock answers the list by its shape (each element the first recorded one's), so
          // which process is the kind's is read from the recording the page is shown with.
          expect(data?.length).toBeGreaterThan(0);
          expect(typeof data?.[0]?.dryRunnable).toBe('boolean');
          expect(param(state, PROCESS_LIST.operationId, 'kind')).toBe(kind);
          const recorded = masters
            .body<Process[]>(state, PROCESS_LIST.operationId)
            .find((one) => one.kind === kind);
          expect(recorded?.name).toBe(name);
          expect(recorded?.description).toBeTruthy();
          expect(recorded?.dryRunnable).toBe(false);
        }),
    );
  }

  for (const [state, kind] of [
    [SCAN_FINISHED, 'scan'],
    [SBOM_FINISHED, 'sbom-check'],
  ] as const) {
    it.skipIf(!RECORDED)(`show-orchestrator-process: a finished ${kind} run listed`, () =>
      given(PROCESS_RUNS, state, 'show-orchestrator-process').executeTest(async (server) => {
        const listed = param(state, PROCESS_RUNS.operationId, 'kind');
        expect(listed).toBe(kind);
        const { data, error } = await at(server.url, () =>
          PROCESS_RUNS.fetch({ path: { kind: listed } }),
        );
        expect(error).toBeUndefined();
        const [run] = data ?? [];
        expect(run?.status).toBe('SUCCEEDED');
        expect(run?.dryRun).toBe(false);
        expect(run?.summary).toBeTruthy();
      }),
    );

    it.skipIf(!RECORDED)(`show-orchestrator-process: a finished ${kind} run’s steps`, () =>
      given(PROCESS_RUN, state, 'show-orchestrator-process').executeTest(async (server) => {
        const id = param(state, PROCESS_RUN.operationId, 'runId');
        const { data, error } = await at(server.url, () =>
          PROCESS_RUN.fetch({ path: { id }, query: { bodies: false } }),
        );
        expect(error).toBeUndefined();
        expect(data?.dryRun).toBe(false);
        expect(data?.steps?.length).toBeGreaterThan(0);
        expect((data?.steps ?? []).every((step) => step.status === 'SUCCEEDED')).toBe(true);
      }),
    );

    it.skipIf(!RECORDED)(`open-orchestrator-step: one step of a ${kind} run, whole`, () =>
      given(PROCESS_RUN_STEP, state, 'open-orchestrator-step').executeTest(async (server) => {
        const id = param(state, PROCESS_RUN_STEP.operationId, 'runId');
        const stepId = param(state, PROCESS_RUN_STEP.operationId, 'stepId');
        const { data, error } = await at(server.url, () =>
          PROCESS_RUN_STEP.fetch({ path: { id, stepId } }),
        );
        expect(error).toBeUndefined();
        expect(data?.id).toBe(stepId);
        expect(data?.request?.url).toBeTruthy();
        expect(JSON.parse(data?.response ?? 'null')).toBeTruthy();
        expect(data?.responseBytes).toBeGreaterThan(0);
      }),
    );
  }

  for (const [state, kind] of [
    [SCAN_IDLE, 'scan'],
    [SBOM_IDLE, 'sbom-check'],
  ] as const) {
    it.skipIf(!RECORDED)(`start-orchestrator-run started: Run now starts a real ${kind} run`, () =>
      given(START_PROCESS_RUN, state, 'start-orchestrator-run').executeTest(async (server) => {
        const started = param(state, START_PROCESS_RUN.operationId, 'kind');
        expect(started).toBe(kind);
        expect(sentDryRun(state)).toBe(false);
        const { data, error } = await at(server.url, () =>
          START_PROCESS_RUN.fetch({ path: { kind: started }, body: { dryRun: false } }),
        );
        expect(error).toBeUndefined();
        expect(data?.id).toBeTruthy();
      }),
    );
  }

  it.skipIf(!RECORDED)('show-orchestrator-process: the runs, newest first, a dry run listed', () =>
    given(PROCESS_RUNS, FINISHED, 'show-orchestrator-process').executeTest(async (server) => {
      const kind = param(FINISHED, PROCESS_RUNS.operationId, 'kind');
      const { data, error } = await at(server.url, () => PROCESS_RUNS.fetch({ path: { kind } }));
      expect(error).toBeUndefined();
      const [run] = data ?? [];
      expect(data).toHaveLength(1);
      expect(run?.status).toBe('SUCCEEDED');
      expect(run?.dryRun).toBe(true);
      expect(run?.finishedAt).toBeTruthy();
      expect(run?.summary).toBeTruthy();
    }),
  );

  it.skipIf(!RECORDED)(
    'show-orchestrator-process: the run, its steps without bodies, laid out by depth',
    () =>
      given(PROCESS_RUN, FINISHED, 'show-orchestrator-process').executeTest(async (server) => {
        const id = param(FINISHED, PROCESS_RUN.operationId, 'runId');
        const { data, error } = await at(server.url, () =>
          PROCESS_RUN.fetch({ path: { id }, query: { bodies: false } }),
        );
        expect(error).toBeUndefined();
        expect(data?.id).toBe(id);
        const steps = data?.steps ?? [];
        expect(steps.length).toBeGreaterThan(1);
        expect(columns(steps).length).toBeGreaterThan(1);
        const sweep = steps.find((step) => step.status === 'SKIPPED');
        expect(sweep?.error).toBe('dry run');
        expect(sweep?.request).toBeNull();
        const plan = steps.find((step) => step.request?.method === 'POST');
        expect(plan?.responseBytes).toBeGreaterThan(0);
      }),
  );

  it.skipIf(!RECORDED)(
    'open-orchestrator-step: one step whole, its request body and its response',
    () =>
      given(PROCESS_RUN_STEP, FINISHED, 'open-orchestrator-step').executeTest(async (server) => {
        const id = param(FINISHED, PROCESS_RUN_STEP.operationId, 'runId');
        const stepId = param(FINISHED, PROCESS_RUN_STEP.operationId, 'stepId');
        const { data, error } = await at(server.url, () =>
          PROCESS_RUN_STEP.fetch({ path: { id, stepId } }),
        );
        expect(error).toBeUndefined();
        expect(data?.id).toBe(stepId);
        expect(data?.request?.method).toBe('POST');
        expect(JSON.parse(data?.request?.body ?? 'null')).toBeTruthy();
        expect(JSON.parse(data?.response ?? 'null')).toBeTruthy();
        expect(data?.responseBytes).toBeGreaterThan(0);
      }),
  );

  it.skipIf(!RECORDED)('show-orchestrator-process: a process that never ran lists no runs', () =>
    given(PROCESS_RUNS, NEVER_RAN, 'show-orchestrator-process').executeTest(async (server) => {
      const kind = param(NEVER_RAN, PROCESS_RUNS.operationId, 'kind');
      const { data, error } = await at(server.url, () => PROCESS_RUNS.fetch({ path: { kind } }));
      expect(error).toBeUndefined();
      expect(data).toEqual([]);
    }),
  );

  it.skipIf(!RECORDED)('show-orchestrator-process: a running run is listed unfinished', () =>
    given(PROCESS_RUNS, RUNNING, 'show-orchestrator-process').executeTest(async (server) => {
      const kind = param(RUNNING, PROCESS_RUNS.operationId, 'kind');
      const { data, error } = await at(server.url, () => PROCESS_RUNS.fetch({ path: { kind } }));
      expect(error).toBeUndefined();
      const [run] = data ?? [];
      expect(run?.status).toBe('RUNNING');
      expect(run?.finishedAt).toBeNull();
      expect(run?.summary).toBeNull();
    }),
  );

  it.skipIf(!RECORDED)(
    'show-orchestrator-process: a running run’s steps, some done, one running, the rest pending',
    () =>
      given(PROCESS_RUN, RUNNING, 'show-orchestrator-process').executeTest(async (server) => {
        const id = param(RUNNING, PROCESS_RUN.operationId, 'runId');
        const { data, error } = await at(server.url, () =>
          PROCESS_RUN.fetch({ path: { id }, query: { bodies: false } }),
        );
        expect(error).toBeUndefined();
        expect(data?.status).toBe('RUNNING');
        const statuses = new Set((data?.steps ?? []).map((step) => step.status));
        expect([...statuses].sort()).toEqual(['PENDING', 'RUNNING', 'SUCCEEDED']);
      }),
  );

  it.skipIf(!RECORDED)('start-orchestrator-dry-run started: Dry run starts a run', () =>
    given(START_PROCESS_RUN, IDLE, 'start-orchestrator-dry-run').executeTest(async (server) => {
      const kind = param(IDLE, START_PROCESS_RUN.operationId, 'kind');
      const { data, error } = await at(server.url, () =>
        START_PROCESS_RUN.fetch({ path: { kind }, body: { dryRun: sentDryRun(IDLE) } }),
      );
      expect(sentDryRun(IDLE)).toBe(true);
      expect(error).toBeUndefined();
      expect(data?.id).toBeTruthy();
    }),
  );

  it.skipIf(!RECORDED)(
    'start-orchestrator-dry-run refused: a run already active is refused in the service’s words',
    () =>
      given(
        START_PROCESS_RUN,
        RUNNING,
        'start-orchestrator-dry-run',
        START_PROCESS_RUN.errorConsumes,
      ).executeTest(async (server) => {
        const kind = param(RUNNING, START_PROCESS_RUN.operationId, 'kind');
        const { data, error, response } = await at(server.url, () =>
          START_PROCESS_RUN.fetch({ path: { kind }, body: { dryRun: sentDryRun(RUNNING) } }),
        );
        expect(data).toBeUndefined();
        expect(response?.status).toBe(409);
        const refusal = new QitsApiError(409, error, START_PROCESS_RUN);
        expect(explainStart(refusal)).toMatch(/^Not started: a gc run is already active: /);
      }),
  );
});
