import type { CiRun } from '$core/ci/ci-runs.consumes';
import type { ReleaseRequest } from './release-request.consumes';
import { requestRuns } from './release-runs';

// Pure rules, so hand-built requests and runs.

const request: ReleaseRequest = {
  id: 'rr-1',
  repoId: 'repo-1',
  pipeline: {
    phases: [
      { phase: 'QA', state: 'SUCCESS', runId: 'qa-2' },
      { phase: 'PUBLISH', state: 'RUNNING', runId: 'release-1' },
      { phase: 'DEPLOY', state: 'PENDING', runId: 'deployment-request-1' },
    ],
  },
  automations: [{ kind: 'bump', label: 'Bump', state: 'FRESH', runId: 'auto-1' }],
};

const runs: readonly CiRun[] = [
  { id: 'other', releaseRequestId: 'rr-9', createdAt: '2026-10-09T12:05:00Z' },
  {
    id: 'release-1',
    releaseRequestId: 'rr-1',
    phase: 'RELEASE',
    createdAt: '2026-10-09T12:04:00Z',
  },
  { id: 'auto-1', branch: 'main', createdAt: '2026-10-09T12:03:00Z' },
  {
    id: 'qa-2',
    releaseRequestId: 'rr-1',
    phase: 'RELEASE_REQUEST',
    createdAt: '2026-10-09T12:02:00Z',
  },
  {
    id: 'qa-1',
    releaseRequestId: 'rr-1',
    phase: 'RELEASE_REQUEST',
    createdAt: '2026-10-09T12:01:00Z',
  },
];

describe('requestRuns', () => {
  it('lists the runs that name the request and the runs it names, newest first', () => {
    expect(requestRuns(request, [], runs).map((r) => [r.id, r.label])).toEqual([
      ['release-1', 'Release of the tag'],
      ['auto-1', 'Automation: Bump'],
      ['qa-2', 'Test run of the fold'],
      ['qa-1', 'Test run of the fold'],
    ]);
  });

  it('leaves out the deployment phase, whose id names a deployment request', () => {
    expect(requestRuns(request, [], runs).some((r) => r.id === 'deployment-request-1')).toBe(false);
  });

  it('keeps a run only the request names, without qits-ci’s data, last', () => {
    const named = requestRuns(request, [{ runId: 'ci-old', branch: 'release/rr-1' }], []);
    expect(named.map((r) => [r.id, r.label, r.run])).toEqual([
      ['qa-2', 'Test run of the fold', undefined],
      ['release-1', 'Release of the tag', undefined],
      ['ci-old', 'CI verdict on release/rr-1', undefined],
      ['auto-1', 'Automation: Bump', undefined],
    ]);
  });
});
