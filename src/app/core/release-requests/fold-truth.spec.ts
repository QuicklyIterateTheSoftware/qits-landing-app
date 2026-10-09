import type { CiRun } from '$core/ci/ci-runs.consumes';
import type { ReleaseRequest } from './release-request.consumes';
import { currentFoldPhases } from './fold-truth';
import { currentGates, releaseLifecycle } from './release-lifecycle';

// The live shape of request dd113f4c right after a re-fold (hand-built: pure rules).

const request: ReleaseRequest = {
  id: 'dd113f4c',
  state: 'PENDING',
  mergedSha: '92c13f3b',
  gates: [
    { kind: 'CI', state: 'PENDING' },
    { kind: 'AUTOMATIONS', state: 'PASSED' },
  ],
  pipeline: {
    // The phase race: QA still names the cancelled run of the previous fold.
    phases: [{ phase: 'QA', state: 'CANCELLED', runId: 'f8d55001' }],
    // A pipeline gate list that lags behind the request's own gates.
    gates: [
      { between: 'QA_PUBLISH', kind: 'CI', state: 'FAILED', detail: 'a build went red' },
      { between: 'QA_PUBLISH', kind: 'AUTOMATIONS', state: 'PASSED' },
    ],
  },
};

const runs: readonly CiRun[] = [
  {
    id: '3784abc1',
    status: 'RUNNING',
    commitSha: '92c13f3b',
    releaseRequestId: 'dd113f4c',
    phase: 'RELEASE_REQUEST',
  },
  {
    id: 'f8d55001',
    status: 'CANCELLED',
    commitSha: 'd1620cf1',
    releaseRequestId: 'dd113f4c',
    phase: 'RELEASE_REQUEST',
  },
  {
    id: 'fb1da093',
    status: 'FAILED',
    commitSha: 'd1620cf1',
    releaseRequestId: 'dd113f4c',
    phase: 'RELEASE_REQUEST',
  },
];

describe('the current fold only', () => {
  it('takes each gate’s state from the request’s own gates, its place from the pipeline', () => {
    expect(currentGates(request).map((gate) => [gate.kind, gate.state, gate.between])).toEqual([
      ['CI', 'PENDING', 'QA_PUBLISH'],
      ['AUTOMATIONS', 'PASSED', 'QA_PUBLISH'],
    ]);
    const gates = releaseLifecycle(request)[2].steps;
    expect(gates[0]).toMatchObject({ label: 'Tests passed', state: 'pending', attention: false });
  });

  it('replaces a QA phase whose run is of an earlier fold with the fold’s own run', () => {
    const fixed = currentFoldPhases(request, runs);
    expect(fixed.pipeline?.phases?.[0]).toMatchObject({ runId: '3784abc1', state: 'RUNNING' });
    expect(releaseLifecycle(fixed)[1].steps[0]).toMatchObject({
      state: 'running',
      runId: '3784abc1',
    });
  });

  it('shows the phase pending while the fold has no run, and leaves a current phase alone', () => {
    const none = currentFoldPhases(request, runs.slice(1));
    expect(none.pipeline?.phases?.[0]).toMatchObject({ state: 'PENDING', runId: undefined });
    const current = {
      ...request,
      pipeline: { phases: [{ phase: 'QA', state: 'RUNNING', runId: '3784abc1' }] },
    };
    expect(currentFoldPhases(current, runs)).toBe(current);
    expect(currentFoldPhases(request, undefined)).toBe(request);
  });
});
