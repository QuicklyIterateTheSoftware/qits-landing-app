import { artifactLinks, readerPath, releaseLinks, repositoryScope } from './release-links';

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
      artifactLinks({ type: 'docker', name: 'qits/qits-ci', version: '2026.1.1' }, SCOPE, 'qits'),
    ).toEqual([
      { label: 'qits/qits-ci', app: 'artifacts', path: `${SCOPE}repositories/qits/images/qits-ci` },
      { label: 'SBOM', app: 'artifacts', path: '/artifacts/sboms/docker/qits/qits-ci/-/2026.1.1' },
    ]);
  });

  it('addresses a maven coordinate, an npm package and docs', () => {
    expect(
      artifactLinks({ type: 'maven', name: 'eu.x:y', version: '1' }, SCOPE, 'qits')[0].path,
    ).toBe(`${SCOPE}repositories/maven/maven-packages/eu.x:y`);
    expect(artifactLinks({ type: 'npm', name: '@qits/a', version: '1' }, SCOPE, 'qits')).toEqual([
      { label: '@qits/a', app: 'artifacts', path: `${SCOPE}repositories/npm/packages/%40qits%2Fa` },
    ]);
    expect(artifactLinks({ type: 'docs', name: '@guides/x', version: '2' }, SCOPE, 'qits')).toEqual(
      [{ label: '@guides/x', path: '/projects/qits/docs/read/@guides%2Fx/-/2' }],
    );
    expect(
      artifactLinks({ type: 'userflows', name: '@userflows/x', version: 'abc' }, SCOPE, 'qits'),
    ).toEqual([{ label: '@userflows/x', path: '/projects/qits/docs/read/@userflows%2Fx/-/abc' }]);
    // No version to read, no reader to open.
    expect(artifactLinks({ type: 'docs', name: '@guides/x' }, SCOPE, 'qits')).toEqual([
      { label: '@guides/x' },
    ]);
  });

  it('addresses the docs reader with the site as one segment (qits-2337)', () => {
    expect(readerPath('qits', '@apidocs/qits-ci', '2026.1.1')).toBe(
      '/projects/qits/docs/read/@apidocs%2Fqits-ci/-/2026.1.1',
    );
    expect(readerPath('a b', 'storybook', 'v 1')).toBe(
      '/projects/a%20b/docs/read/storybook/-/v%201',
    );
  });

  it('draws a type nothing serves as a name without a link', () => {
    expect(artifactLinks({ type: 'helm', name: 'chart', version: '1' }, SCOPE, 'qits')).toEqual([
      { label: 'chart' },
    ]);
  });

  it('links the tag, the commit, the deployment only when something deploys, and the adoption', () => {
    const base = { slug: 'qits', scope: SCOPE, repoId: 'r1', repoName: 'qits-ci-service' };
    expect(
      releaseLinks({ ...base, version: '2026.1.1', releasedSha: 'abc', deployable: true }).map(
        (link) => [link.app, link.path],
      ),
    ).toEqual([
      ['githost', `${SCOPE}tags/2026.1.1`],
      ['githost', `${SCOPE}commit/abc`],
      [undefined, '/projects/qits/deployments/requests/by-release/r1/2026.1.1'],
      [undefined, '/projects/qits/components/qits-ci-service/adoption/2026.1.1'],
    ]);
    expect(
      releaseLinks({ ...base, version: '2026.1.1', deployable: false }).map((link) => link.app),
    ).toEqual(['githost', undefined]);
    expect(releaseLinks({ ...base, deployable: true })).toEqual([]);
  });

  it('links the deployment requests of the release in this app, each segment encoded', () => {
    const [deployment] = releaseLinks({
      slug: 'qits',
      scope: SCOPE,
      repoId: 'repo/1',
      version: '2026.1.1+x',
      deployable: true,
    }).filter((link) => link.label === 'The deployment of this release');
    expect(deployment).toEqual({
      label: 'The deployment of this release',
      path: '/projects/qits/deployments/requests/by-release/repo%2F1/2026.1.1%2Bx',
      release: { repoId: 'repo/1', version: '2026.1.1+x' },
    });
  });

  it('links the adoption of the release in this app, each segment encoded', () => {
    const [adoption] = releaseLinks({
      slug: 'qits',
      scope: SCOPE,
      repoName: 'repo/1',
      version: '2026.1.1+x',
      deployable: false,
    }).filter((link) => link.label === 'Adoption of this release');
    expect(adoption).toEqual({
      label: 'Adoption of this release',
      path: '/projects/qits/components/repo%2F1/adoption/2026.1.1%2Bx',
      adoption: { repository: 'repo/1', version: '2026.1.1+x' },
    });
  });
});
