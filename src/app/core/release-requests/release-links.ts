import type { PlatformApp } from '$core/platform/platform-origins';
import type { ReleaseArtifact } from './release-request.consumes';

/**
 * Addresses in other platform applications for a release (ported from qits-projects-frontend's
 * `release-artifact-links` and the detail page's links). Each is an application and a path below
 * its origin; the page joins them with `PlatformOrigins.page(app)`.
 */

/** A link to another application: its label, and where, when it can be spelled. */
export interface AppLink {
  readonly label: string;
  readonly app?: PlatformApp;
  readonly path?: string;
}

/**
 * Where a repository sits in its project, as the platform's SPAs address it:
 * `/<project slug>/<group>/<repository>/`, the group being the component directory of its wrapper
 * path (`components/<group>/<repository>`). A repository outside a component (the wrapper itself)
 * is addressed by the project alone: `/<project slug>/`.
 */
export function repositoryScope(
  slug: string,
  wrapperPath: string | undefined,
  repoName: string | undefined,
): string {
  const parts = (wrapperPath ?? '').split('/').filter((part) => part.length > 0);
  if (parts.length === 3 && parts[0] === 'components' && repoName) {
    return `/${slug}/${parts[1]}/${repoName}/`;
  }
  return `/${slug}/`;
}

const IMAGE_SCOPE = 'qits/';

/**
 * Where a published artifact can be looked at: an image or a Maven or npm package in qits-artifacts
 * (scoped to the project, `scope`), its SBOM (wire address, not scoped), and docs or user flows in
 * qits-docs. A type nothing serves is a name without a link.
 */
export function artifactLinks(artifact: ReleaseArtifact, scope: string): readonly AppLink[] {
  const name = artifact.name ?? '';
  const version = artifact.version ?? '';
  switch (artifact.type) {
    case 'docker':
      return [
        {
          label: name,
          app: 'artifacts',
          path: `${scope}repositories/qits/images/${name.startsWith(IMAGE_SCOPE) ? name.slice(IMAGE_SCOPE.length) : name}`,
        },
        { label: 'SBOM', app: 'artifacts', path: `/artifacts/sboms/docker/${name}/-/${version}` },
      ];
    case 'maven':
      return [
        {
          label: name,
          app: 'artifacts',
          path: `${scope}repositories/maven/maven-packages/${name}`,
        },
        { label: 'SBOM', app: 'artifacts', path: `/artifacts/sboms/maven/${name}/-/${version}` },
      ];
    case 'npm':
      return [
        {
          label: name,
          app: 'artifacts',
          path: `${scope}repositories/npm/packages/${encodeURIComponent(name)}`,
        },
      ];
    case 'docs':
    case 'userflows':
      return [{ label: name, app: 'docs', path: `${scope}read/${name}/-/${version}` }];
    default:
      return [{ label: name }];
  }
}

/**
 * The release's own links: its tag and released commit in qits-githost, its deployment in
 * qits-deployments (only when something deploys it), and its release train in qits-maintenance.
 */
export function releaseLinks(input: {
  readonly slug: string;
  readonly scope: string;
  readonly repoId?: string;
  readonly repoName?: string;
  readonly version?: string;
  readonly releasedSha?: string;
  readonly deployable: boolean;
}): readonly AppLink[] {
  const links: AppLink[] = [];
  const { version } = input;
  if (version) {
    links.push({
      label: 'View the tag in Code',
      app: 'githost',
      path: `${input.scope}tags/${encodeURIComponent(version)}`,
    });
  }
  if (input.releasedSha) {
    links.push({
      label: 'The released commit',
      app: 'githost',
      path: `${input.scope}commit/${encodeURIComponent(input.releasedSha)}`,
    });
  }
  if (version && input.deployable && input.repoId) {
    links.push({
      label: 'The deployment of this release',
      app: 'deployments',
      path:
        `/${input.slug}/deployment-requests/by-release/${encodeURIComponent(input.repoId)}/` +
        encodeURIComponent(version),
    });
  }
  if (version && input.repoName) {
    links.push({
      label: 'The release train of this version',
      app: 'maintenance',
      path:
        `/${input.slug}/trains/by-release/${encodeURIComponent(input.repoName)}/` +
        encodeURIComponent(version),
    });
  }
  return links;
}
