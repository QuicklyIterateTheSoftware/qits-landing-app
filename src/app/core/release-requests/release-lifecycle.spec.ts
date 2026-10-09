import type { ReleaseRequest } from './release-request.consumes';
import {
  hasGenericGates,
  lifecycleSummary,
  releaseLifecycle,
  stageState,
  stepStateOf,
} from './release-lifecycle';

// Pure rules, so hand-built requests in the shapes qits-projects answers today.

/** A pending request: QA running, CI and automations pending, one automation requested. */
const pending: ReleaseRequest = {
  id: 'r1',
  state: 'PENDING',
  backingBranch: 'release/r1',
  mergedSha: '54ede496bce53bfd36f2ae3877d49e925ed5fe43',
  sources: [{ name: 'main' }, { name: 'maintenance/dependencies' }],
  approvalRequired: false,
  approvalState: 'NOT_REQUIRED',
  automations: [{ kind: 'entity-diagram', label: 'Entity diagram', state: 'REQUESTED' }],
  pipeline: {
    phases: [{ phase: 'QA', state: 'RUNNING', runId: 'qa-run' }],
    gates: [
      { between: 'QA_PUBLISH', kind: 'CI', state: 'PENDING' },
      { between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'PENDING' },
      { between: 'DEPLOY_FINALIZED', kind: 'DEPLOYMENT', state: 'PENDING' },
    ],
  },
};

/** A finalized request with no deployment: QA and publish green, the tag on main. */
const finalized: ReleaseRequest = {
  id: 'r2',
  state: 'FINALIZED',
  backingBranch: 'release/r2',
  mergedSha: 'aaaaaaa1',
  version: '2026.1009.181430',
  releasedSha: 'bbbbbbb2',
  mergedToMainAt: '2026-10-09T18:19:20Z',
  approvalRequired: false,
  approvalState: 'NOT_REQUIRED',
  pipeline: {
    phases: [
      { phase: 'QA', state: 'SUCCESS', runId: 'qa' },
      { phase: 'PUBLISH', state: 'SUCCESS', runId: 'pub' },
    ],
    gates: [
      { between: 'QA_PUBLISH', kind: 'CI', state: 'PASSED' },
      { between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'PASSED' },
      { between: 'PUBLISH_DEPLOY', kind: 'PUBLISH', state: 'PASSED', detail: 'finished green' },
    ],
  },
};

const labels = (request: ReleaseRequest) =>
  releaseLifecycle(request).map((stage) => [stage.label, stage.state]);

describe('release lifecycle', () => {
  it('draws every stage, top to bottom, whatever the request has reached', () => {
    expect(labels(pending)).toEqual([
      ['P1 · Fold & automations', 'running'],
      ['P2 · CI / QA', 'running'],
      ['P3 · Quality gates', 'pending'],
      ['P4 · Publish', 'pending'],
      ['P5 · Deployment', 'pending'],
      ['P6 · Deployment quality gates', 'pending'],
      ['→ Finalized', 'pending'],
    ]);
  });

  it('marks the first unsettled stage as current, with QA beside the fold, and greys the rest', () => {
    const stages = releaseLifecycle(pending);
    expect(stages.map((stage) => [stage.current, stage.future])).toEqual([
      [true, false],
      [true, false],
      [false, true],
      [false, true],
      [false, true],
      [false, true],
      [false, true],
    ]);
  });

  it('names each gate as its own row, with the approval always among them', () => {
    const gates = releaseLifecycle(pending)[2].steps;
    expect(gates.map((step) => [step.label, step.word])).toEqual([
      ['CI build passed', 'pending'],
      ['Automations passed or waived', 'pending'],
      ['Approval', 'not required'],
    ]);
    expect(gates[2].state).toBe('skipped');
  });

  it('asks a person on the approval while a pending request waits for one', () => {
    const asked = releaseLifecycle({
      ...pending,
      approvalRequired: true,
      approvalState: 'WAITING',
      pipeline: {
        ...pending.pipeline,
        gates: [{ between: 'QA_PUBLISH', kind: 'APPROVAL', state: 'PENDING' }],
      },
    })[2].steps;
    expect(asked.map((step) => [step.label, step.asks ?? false])).toEqual([['Approval', true]]);
  });

  it('says a deploying request’s rollback is not reported, and skips deployment otherwise', () => {
    const deploying = releaseLifecycle(pending);
    expect(deploying[5].steps.map((step) => [step.label, step.state])).toEqual([
      ['Deployment live', 'pending'],
      ['Not rolled back', 'not-reported'],
    ]);
    const plain = releaseLifecycle(finalized);
    expect([plain[4].state, plain[5].state]).toEqual(['skipped', 'skipped']);
  });

  it('settles a finalized request: every stage passed or skipped, none current', () => {
    const stages = releaseLifecycle(finalized);
    expect(stages.map((stage) => stage.state)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
      'skipped',
      'skipped',
      'passed',
    ]);
    expect(stages.some((stage) => stage.current)).toBe(false);
    expect(stages[3].steps.map((step) => [step.label, step.word])).toEqual([
      ['Tag the release', '2026.1009.181430'],
      ['Release run of the tag', 'success'],
      ['Release pipeline of the tag green', 'passed'],
    ]);
  });

  it('shows a conflicted fold as failed, and links the QA run but never the deployment id as one', () => {
    const conflicted = releaseLifecycle({
      ...pending,
      state: 'CONFLICTED',
      mergedSha: undefined,
      conflict: { target: 'release/r1', conflicts: [{ path: 'pom.xml' }] },
      pipeline: {
        phases: [
          { phase: 'QA', state: 'FAILED', runId: 'qa' },
          { phase: 'DEPLOY', state: 'RUNNING', runId: 'deployment-request' },
        ],
      },
    });
    expect(conflicted[0].steps[0]).toMatchObject({ state: 'failed', word: 'conflicted' });
    expect(conflicted[1].steps[0]).toMatchObject({ runId: 'qa', rerunnable: true });
    expect(conflicted[4].steps[0]).toMatchObject({
      runId: null,
      deploymentRequestId: 'deployment-request',
    });
  });

  it('draws the backend’s generic gate shape as it comes: label, position, sub-checks, run', () => {
    const gates = [
      {
        kind: 'SECURITY',
        label: 'No known vulnerability',
        position: 'AFTER_QA',
        state: 'FAILED',
        detail: '1 critical',
        runId: 'scan',
        checks: [{ name: 'CVE-2026-1', state: 'FAILED', detail: 'in libfoo' }],
      },
      { kind: 'SMOKE', label: 'Smoke test', position: 'AFTER_DEPLOY', state: 'PASSED' },
    ];
    expect(hasGenericGates(gates)).toBe(true);
    expect(hasGenericGates([{ kind: 'CI', state: 'PASSED' }])).toBe(false);
    const stages = releaseLifecycle({
      ...pending,
      pipeline: { ...pending.pipeline, gates: gates as never },
    });
    expect(stages[2].steps[0]).toMatchObject({
      label: 'No known vulnerability',
      state: 'failed',
      detail: '1 critical',
      runId: 'scan',
      checks: [{ name: 'CVE-2026-1', state: 'failed', word: 'failed', detail: 'in libfoo' }],
    });
    // The backend says which checks it has, so nothing is added as not reported.
    expect(stages[5].steps.map((step) => step.label)).toEqual(['Smoke test']);
  });

  it('reads the backend’s words as states, an unknown one as unknown', () => {
    expect(
      ['SUCCESS', 'FRESH', 'REQUESTED', 'WAITING', 'NOT_REQUIRED', 'WAIVED', 'SUPERSEDED', 'X'].map(
        stepStateOf,
      ),
    ).toEqual([
      'passed',
      'passed',
      'running',
      'pending',
      'skipped',
      'skipped',
      'pending',
      'unknown',
    ]);
  });

  it('sums a stage: a failure wins, then running; all passed or skipped is passed', () => {
    const step = (state: Parameters<typeof stageState>[0][number]['state']) =>
      ({ state }) as Parameters<typeof stageState>[0][number];
    expect(stageState([step('passed'), step('failed'), step('running')])).toBe('failed');
    expect(stageState([step('passed'), step('pending')])).toBe('running');
    expect(stageState([step('passed'), step('skipped')])).toBe('passed');
    expect(stageState([step('skipped')])).toBe('skipped');
  });
});

describe('lifecycle summary', () => {
  it('lines up automations, CI, gate pips, publish, deployment, its gates and finalized', () => {
    const points = lifecycleSummary({
      ...pending,
      automations: [
        { kind: 'a', label: 'Entity diagram', state: 'FRESH' },
        { kind: 'b', label: 'Estate pins', state: 'RUNNING' },
        { kind: 'c', label: 'Baselines', state: 'REQUESTED' },
      ],
    });
    expect(points.map((point) => [point.kind, point.label, point.state])).toEqual([
      ['chip', 'Automations 1/3', 'running'],
      ['chip', 'CI', 'running'],
      ['pip', 'CI build passed', 'pending'],
      ['pip', 'Automations passed or waived', 'pending'],
      ['pip', 'Approval', 'skipped'],
      ['chip', 'Publish', 'pending'],
      ['chip', 'Deploy', 'pending'],
      ['pip', 'Deployment live', 'pending'],
      ['pip', 'Not rolled back', 'not-reported'],
      ['chip', 'Finalized', 'pending'],
    ]);
    expect(points[2].title).toBe('CI build passed: pending');
  });

  it('leaves out automations when none apply, and deployment when nothing deploys', () => {
    expect(lifecycleSummary(finalized).map((point) => point.label)).toEqual([
      'CI',
      'CI build passed',
      'Automations passed or waived',
      'Approval',
      'Publish',
      'Finalized',
    ]);
  });

  it('reads CI and publish from the gates when the answer has no pipeline', () => {
    const points = lifecycleSummary({
      id: 'r3',
      state: 'RELEASED',
      gates: [
        { kind: 'CI', state: 'PASSED' },
        { kind: 'PUBLISH', state: 'PENDING' },
      ],
    });
    const withRows = lifecycleSummary({
      id: 'r4',
      state: 'PENDING',
      gates: [{ kind: 'AUTOMATIONS', state: 'PENDING' }],
    });
    expect(withRows[0]).toMatchObject({ label: 'Automations', state: 'pending' });
    expect(points.map((point) => point.label).slice(0, 2)).toEqual(['CI', 'CI build passed']);
    expect(points.find((point) => point.key === 'qa')?.state).toBe('passed');
    expect(points.find((point) => point.key === 'publish')?.state).toBe('running');
  });
});
