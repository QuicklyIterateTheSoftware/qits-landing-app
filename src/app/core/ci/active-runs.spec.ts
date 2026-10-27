import { activeRunsOf, type RunLike } from './active-runs';

const REQUEST = 'request-1';

describe('activeRunsOf', () => {
  it('finds nothing without a request or runs', () => {
    expect(
      activeRunsOf(undefined, [{ id: 'a', status: 'RUNNING', releaseRequestId: REQUEST }]),
    ).toEqual([]);
    expect(activeRunsOf(REQUEST, undefined)).toEqual([]);
    expect(activeRunsOf(REQUEST, [])).toEqual([]);
  });

  it('keeps queued and running runs that name the request, and drops finished ones', () => {
    const runs: RunLike[] = [
      { id: 'done', status: 'SUCCESS', releaseRequestId: REQUEST },
      { id: 'other', status: 'RUNNING', releaseRequestId: 'request-2' },
      { id: 'qa', status: 'QUEUED', releaseRequestId: REQUEST },
    ];
    expect(activeRunsOf(REQUEST, runs)).toEqual([
      { runId: 'qa', kind: 'ci', status: 'QUEUED', label: 'CI queued' },
    ]);
  });

  it('finds a run the request names, and an automation run by its branch', () => {
    const runs: RunLike[] = [
      {
        id: 'auto',
        status: 'RUNNING',
        branch: `maintenance/automations/dependency-bump/${REQUEST}`,
      },
      { id: 'other-auto', status: 'RUNNING', branch: 'maintenance/automations/dependency-bump/x' },
      { id: 'gate', status: 'RUNNING', branch: 'ticket/x' },
    ];
    expect(activeRunsOf(REQUEST, runs, ['gate', null, undefined])).toEqual([
      { runId: 'gate', kind: 'ci', status: 'RUNNING', label: 'CI running' },
      { runId: 'auto', kind: 'automation', status: 'RUNNING', label: 'Automation running' },
    ]);
  });

  it('shows one run per kind: a running one before a queued one, else the newest', () => {
    const runs: RunLike[] = [
      { id: 'queued-new', status: 'QUEUED', releaseRequestId: REQUEST },
      { id: 'queued-old', status: 'QUEUED', releaseRequestId: REQUEST },
      { id: 'running', status: 'RUNNING', releaseRequestId: REQUEST },
    ];
    expect(activeRunsOf(REQUEST, runs).map((run) => run.runId)).toEqual(['running']);
    expect(activeRunsOf(REQUEST, runs.slice(0, 2)).map((run) => run.runId)).toEqual(['queued-new']);
  });
});
