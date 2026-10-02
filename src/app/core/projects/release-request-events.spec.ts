import { affectsReleaseRequests, RELEASE_REQUEST_EVENTS } from './release-request-events';

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

  it('listens to request, release, build and deployment events, rollbacks included', () => {
    expect(RELEASE_REQUEST_EVENTS).toEqual([
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
