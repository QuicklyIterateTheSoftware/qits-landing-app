import {
  affectsReleaseRequests,
  changesReleaseRequestList,
  RELEASE_REQUEST_EVENTS,
  releaseRequestIdOf,
  releaseRequestRefresh,
} from './release-request-events';

describe('affectsReleaseRequests', () => {
  const project = 'p1';
  const ofProject = (id: string) => JSON.stringify({ projectId: id, repoName: 'r' });

  it('counts an event whose payload names the project, and no other', () => {
    expect(
      affectsReleaseRequests(
        { name: 'ReleaseRequestChanged', payload: ofProject(project) },
        project,
        [],
      ),
    ).toBe(true);
    expect(
      affectsReleaseRequests(
        { name: 'ReleaseRequestStateChanged', payload: ofProject(project) },
        project,
        [],
      ),
    ).toBe(true);
    expect(
      affectsReleaseRequests({ name: 'BuildFailed', payload: ofProject('p2') }, project, []),
    ).toBe(false);
  });

  it('counts a deployment only while one of the requests is RELEASED and waiting for it', () => {
    const deployed = { name: 'DeploymentActive', payload: '{"applicationName":"qits-ci"}' };
    const rolledBack = { name: 'DeploymentFailed', payload: '{"status":"ROLLED_BACK"}' };
    expect(affectsReleaseRequests(deployed, project, [{ state: 'PENDING' }])).toBe(false);
    expect(affectsReleaseRequests(deployed, project, [{ state: 'RELEASED' }])).toBe(true);
    expect(affectsReleaseRequests(rolledBack, project, [{ state: 'RELEASED' }])).toBe(true);
  });

  it('listens to request moves and changes, release, build and deployment events, rollbacks included', () => {
    expect(RELEASE_REQUEST_EVENTS).toEqual([
      'ReleaseRequestStateChanged',
      'ReleaseRequestChanged',
      'SCMRelease',
      'SoftwareRelease',
      'BuildSuccessful',
      'BuildFailed',
      'DeploymentActive',
      'DeploymentFailed',
    ]);
  });
});

describe('release request refreshes', () => {
  /** A wrapper's request, finalized without a deployment: the event of 2026-10-16. */
  const finalized = {
    name: 'ReleaseRequestStateChanged',
    payload: JSON.stringify({
      projectId: 'p1',
      releaseRequestId: 'rr1',
      previousState: 'RELEASED',
      state: 'FINALIZED',
    }),
  };
  const created = {
    name: 'ReleaseRequestStateChanged',
    payload: JSON.stringify({ projectId: 'p1', releaseRequestId: 'rr3', state: 'PENDING' }),
  };
  const reprioritised = {
    name: 'ReleaseRequestChanged',
    payload: JSON.stringify({ projectId: 'p1', releaseRequestId: 'rr2', priority: 'HIGH' }),
  };
  const built = {
    name: 'BuildSuccessful',
    payload: JSON.stringify({ projectId: 'p1', releaseRequestId: 'rr2', runId: 'run1' }),
  };
  const deployed = { name: 'DeploymentActive', payload: '{"applicationName":"qits-ci"}' };

  it('reads the request an event names', () => {
    expect(releaseRequestIdOf(finalized)).toBe('rr1');
    expect(releaseRequestIdOf(deployed)).toBeUndefined();
  });

  it('moves the list on a state move, a creation among them, and on nothing else', () => {
    expect(changesReleaseRequestList(finalized)).toBe(true);
    expect(changesReleaseRequestList(created)).toBe(true);
    expect(changesReleaseRequestList(reprioritised)).toBe(false);
    expect(changesReleaseRequestList(built)).toBe(false);
  });

  it('reads the rows a burst names, and the list when one can move it or names no request', () => {
    expect(releaseRequestRefresh([reprioritised, built])).toEqual({ list: false, rows: ['rr2'] });
    expect(releaseRequestRefresh([reprioritised, finalized]).list).toBe(true);
    expect(releaseRequestRefresh([deployed]).list).toBe(true);
  });
});
