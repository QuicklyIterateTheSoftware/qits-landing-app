import type { PlatformApp } from '$core/platform/platform-origins';
import type { ReleaseArtifact } from './release-request.consumes';

/**
 * Addresses in other platform applications for a release (ported from qits-projects-frontend's
 * `release-artifact-links` and the detail page's links). Each is an application and a path below
 * its origin; the page joins them with `PlatformOrigins.page(app)`.
 */

/**
 * A link to another application: its label, and where, when it can be spelled. One with no `app`
 * and a `path` is a page of this app (`path` is its address from the root); `release` then names
 * the release whose deployment requests it opens (qits-2323), and `adoption` the release whose
 * adoption page it opens (qits-2333), for the page's exit.
 */
export interface AppLink {
  readonly label: string;
  readonly app?: PlatformApp;
  readonly path?: string;
  readonly release?: { readonly repoId: string; readonly version: string };
  readonly adoption?: { readonly repository: string; readonly version: string };
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
 * this app's docs reader at the released version (qits-2337, `readerPath`). A type nothing serves
 * is a name without a link.
 */
export function artifactLinks(
  artifact: ReleaseArtifact,
  scope: string,
  slug: string,
): readonly AppLink[] {
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
      return name && version && slug
        ? [{ label: name, path: readerPath(slug, name, version) }]
        : [{ label: name }];
    default:
      return [{ label: name }];
  }
}

/**
 * The docs reader's address of `site` at `version` in project `slug` (qits-2337):
 * `/projects/<slug>/docs/read/<site>/-/<version>`, the site one segment with its `/` escaped, as
 * the reader's own links name it (`@` stays literal, as the router writes it). That address redirects
 * to the reader under the site's publisher (qits-2486), which this page does not need to know.
 */
export function readerPath(slug: string, site: string, version: string): string {
  const segment = (value: string) => encodeURIComponent(value).replace(/%40/g, '@');
  return `/projects/${segment(slug)}/docs/read/${segment(site)}/-/${segment(version)}`;
}

/**
 * Where qits-docs reads a docs site, below the docs app's origin: `<scope>read/<site>/-/<version>`,
 * or the site's newest version without one (`<scope>read/<site>`). The site's name keeps its `/`:
 * the reader takes every segment after `read` as the name. The landing app's own links go to
 * {@link readerPath} (qits-2337); this stays for a page with no project to scope the reader to.
 */
export function docsReadPath(scope: string, site: string, version?: string): string {
  return version ? `${scope}read/${site}/-/${version}` : `${scope}read/${site}`;
}

/**
 * The release's own links: its tag and released commit in qits-githost, its deployment requests in
 * this app's Deployments section (only when something deploys it, qits-2323), and its adoption
 * (how far it got downstream) under its repository in this app (qits-2333, qits-2489; it replaces
 * the retired release train in qits-maintenance-frontend).
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
      path:
        `/projects/${encodeURIComponent(input.slug)}/deployments/requests/by-release/` +
        `${encodeURIComponent(input.repoId)}/${encodeURIComponent(version)}`,
      release: { repoId: input.repoId, version },
    });
  }
  if (version && input.repoName) {
    links.push({
      label: 'Adoption of this release',
      path:
        `/projects/${encodeURIComponent(input.slug)}/components/` +
        `${encodeURIComponent(input.repoName)}/adoption/${encodeURIComponent(version)}`,
      adoption: { repository: input.repoName, version },
    });
  }
  return links;
}
