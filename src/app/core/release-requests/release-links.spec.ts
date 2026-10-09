import { artifactLinks, releaseLinks, repositoryScope } from './release-links';

// Pure rules, so hand-built artifacts (ported from qits-projects-frontend's artifact links spec).

const SCOPE = '/qits/qits-ci/qits-ci-service/';

describe('release links', () => {
  it('addresses a repository by its component, the wrapper by its project', () => {
    expect(repositoryScope('qits', 'components/qits-ci/qits-ci-service', 'qits-ci-service')).toBe(
      SCOPE,
    );
    expect(repositoryScope('qits', undefined, 'qits')).toBe('/qits/');
    expect(repositoryScope('qits', 'tools/x', 'x')).toBe('/qits/');
  });

  it('addresses an image by its application, and its SBOM by its full name, unscoped', () => {
    expect(
      artifactLinks({ type: 'docker', name: 'qits/qits-ci', version: '2026.1.1' }, SCOPE),
    ).toEqual([
      { label: 'qits/qits-ci', app: 'artifacts', path: `${SCOPE}repositories/qits/images/qits-ci` },
      { label: 'SBOM', app: 'artifacts', path: '/artifacts/sboms/docker/qits/qits-ci/-/2026.1.1' },
    ]);
  });

  it('addresses a maven coordinate, an npm package and docs', () => {
    expect(artifactLinks({ type: 'maven', name: 'eu.x:y', version: '1' }, SCOPE)[0].path).toBe(
      `${SCOPE}repositories/maven/maven-packages/eu.x:y`,
    );
    expect(artifactLinks({ type: 'npm', name: '@qits/a', version: '1' }, SCOPE)).toEqual([
      { label: '@qits/a', app: 'artifacts', path: `${SCOPE}repositories/npm/packages/%40qits%2Fa` },
    ]);
    expect(artifactLinks({ type: 'docs', name: 'guide', version: '2' }, SCOPE)).toEqual([
      { label: 'guide', app: 'docs', path: `${SCOPE}read/guide/-/2` },
    ]);
  });

  it('draws a type nothing serves as a name without a link', () => {
    expect(artifactLinks({ type: 'helm', name: 'chart', version: '1' }, SCOPE)).toEqual([
      { label: 'chart' },
    ]);
  });

  it('links the tag, the commit, the deployment only when something deploys, and the train', () => {
    const base = { slug: 'qits', scope: SCOPE, repoId: 'r1', repoName: 'qits-ci-service' };
    expect(
      releaseLinks({ ...base, version: '2026.1.1', releasedSha: 'abc', deployable: true }).map(
        (link) => [link.app, link.path],
      ),
    ).toEqual([
      ['githost', `${SCOPE}tags/2026.1.1`],
      ['githost', `${SCOPE}commit/abc`],
      ['deployments', '/qits/deployment-requests/by-release/r1/2026.1.1'],
      ['maintenance', '/qits/trains/by-release/qits-ci-service/2026.1.1'],
    ]);
    expect(
      releaseLinks({ ...base, version: '2026.1.1', deployable: false }).map((link) => link.app),
    ).toEqual(['githost', 'maintenance']);
    expect(releaseLinks({ ...base, deployable: true })).toEqual([]);
  });
});
