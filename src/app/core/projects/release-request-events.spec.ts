import {
  affectsReleaseRequest,
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

describe('affectsReleaseRequest', () => {
  const request = {
    id: 'rr1',
    repoId: 'repo1',
    state: 'RELEASED',
    version: '2026.1016.65430',
    mergedSha: 'fold1',
    releasedSha: 'tag1',
  };
  const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });

  it('counts an event that names this request, and none that names another', () => {
    for (const name of [
      'ReleaseRequestStateChanged',
      'ReleaseRequestChanged',
      'SCMRelease',
      'BuildSuccessful',
    ]) {
      expect(affectsReleaseRequest(event(name, { releaseRequestId: 'rr1' }), request)).toBe(true);
      expect(affectsReleaseRequest(event(name, { releaseRequestId: 'rr2' }), request)).toBe(false);
    }
  });

  it('counts a SoftwareRelease of its repository and version only', () => {
    const released = (repository: string, version: string) =>
      event('SoftwareRelease', { repoId: repository, repository, version });
    expect(affectsReleaseRequest(released('repo1', request.version), request)).toBe(true);
    expect(affectsReleaseRequest(released('repo1', '2026.1.1'), request)).toBe(false);
    expect(affectsReleaseRequest(released('repo2', request.version), request)).toBe(false);
    // Before the tag, any release of its repository.
    expect(
      affectsReleaseRequest(released('repo1', '2026.1.1'), { ...request, version: undefined }),
    ).toBe(true);
  });

  it('counts a build of its repository at its fold or tag that names no request', () => {
    const built = (repoId: string, commitSha: string) =>
      event('BuildFailed', { repoId, commitSha, branch: 'main' });
    expect(affectsReleaseRequest(built('repo1', 'fold1'), request)).toBe(true);
    expect(affectsReleaseRequest(built('repo1', 'tag1'), request)).toBe(true);
    expect(affectsReleaseRequest(built('repo1', 'other'), request)).toBe(false);
    expect(affectsReleaseRequest(built('repo2', 'fold1'), request)).toBe(false);
  });

  it('counts a deployment of its version while it is RELEASED, and no other', () => {
    const deployed = (version: string) =>
      event('DeploymentActive', { applicationName: 'qits-ci', version });
    const rolledBack = event('DeploymentFailed', {
      status: 'ROLLED_BACK',
      version: request.version,
    });
    expect(affectsReleaseRequest(deployed(request.version), request)).toBe(true);
    expect(affectsReleaseRequest(rolledBack, request)).toBe(true);
    expect(affectsReleaseRequest(deployed('2026.1.1'), request)).toBe(false);
    expect(
      affectsReleaseRequest(deployed(request.version), { ...request, state: 'FINALIZED' }),
    ).toBe(false);
  });

  it('counts nothing else, and nothing before the request is read', () => {
    expect(
      affectsReleaseRequest(event('SCMPublishCommit', { repoId: 'repo1', sha: 'fold1' }), request),
    ).toBe(false);
    expect(
      affectsReleaseRequest(event('ReleaseRequestChanged', { releaseRequestId: 'rr1' }), {}),
    ).toBe(false);
  });
});
