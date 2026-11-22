import type { ArtifactDependents, DependencyEntry } from '$core/maintenance/maintenance.consumes';

/**
 * How a cached package of qits-mirror is named in qits-maintenance's inventory (qits-2488), so the
 * Mirror section's repository page can ask which of our releases embed it and which repositories
 * pin it. Pure functions; the page holds the reads.
 */

/** The ecosystem qits-maintenance names a cache type's packages under; none for another type. */
export function ecosystemOf(type: string | undefined): 'npm' | 'maven' | 'docker' | undefined {
  switch (type) {
    case 'npm-proxy':
      return 'npm';
    case 'maven-proxy':
      return 'maven';
    case 'oci-mirror':
      return 'docker';
    default:
      return undefined;
  }
}

/**
 * The image as its upstream registry names it: Docker Hub's official images drop `library/` (a
 * Dockerfile says `FROM node`, the mirror caches `hub` › `library/node`); any other is as cached.
 */
function upstreamImage(root: string, image: string): string {
  return root === 'hub' && image.startsWith('library/') ? image.slice('library/'.length) : image;
}

/**
 * Every name qits-maintenance may hold the package under. npm and maven name it as the mirror does
 * (`left-pad`, `group:artifact`). An image is named as its `FROM` line spells it: through the
 * mirror (`hub/library/postgres`, `quay/quarkus/…`), as cached (`library/node`), or as its
 * upstream does (`node`).
 */
export function inventoryNames(root: string, type: string | undefined, pkg: string): string[] {
  if (ecosystemOf(type) !== 'docker') return [pkg];
  return [...new Set([upstreamImage(root, pkg), pkg, `${root}/${pkg}`])];
}

/**
 * The `name` glob of the pins read: the package itself, or for an image every name ending in its
 * upstream form (`*node` finds `node` and `hub/library/node`), cut to {@link inventoryNames} after.
 */
export function pinsGlob(root: string, type: string | undefined, pkg: string): string {
  return ecosystemOf(type) === 'docker' ? `*${upstreamImage(root, pkg)}` : pkg;
}

/** The inventory's entries that are this package: its ecosystem, and one of its names. */
export function pinsOf(
  dependencies: readonly DependencyEntry[],
  root: string,
  type: string | undefined,
  pkg: string,
): DependencyEntry[] {
  const ecosystem = ecosystemOf(type);
  const names = new Set(inventoryNames(root, type, pkg));
  return dependencies.filter((d) => d.ecosystem === ecosystem && names.has(d.name ?? ''));
}

/**
 * The name to ask the dependents for: the one a pin of ours uses when there is one (an image's
 * `FROM` line is also what its SBOM records), else the first of {@link inventoryNames}.
 */
export function dependentsName(
  pins: readonly DependencyEntry[],
  root: string,
  type: string | undefined,
  pkg: string,
): string {
  return pins.find((d) => d.name)?.name ?? inventoryNames(root, type, pkg)[0];
}

/** One released artifact of ours that embeds the package. */
export type PackageDependent = NonNullable<ArtifactDependents['dependents']>[number];

/** The dependents of one embedded version, in the server's order. */
export interface EmbeddedVersion {
  readonly version: string;
  readonly dependents: readonly PackageDependent[];
}

/** The dependents grouped by the version they embed, each version where it first appears. */
export function byEmbeddedVersion(dependents: readonly PackageDependent[]): EmbeddedVersion[] {
  const groups = new Map<string, PackageDependent[]>();
  for (const dependent of dependents) {
    const version = dependent.embeddedVersion ?? '';
    const group = groups.get(version) ?? [];
    group.push(dependent);
    groups.set(version, group);
  }
  return [...groups].map(([version, members]) => ({ version, dependents: members }));
}

/** Where a released artifact of ours is looked at in the Artifacts section, by ecosystem. */
export type ArtifactPage =
  | { readonly kind: 'image'; readonly repo: string; readonly image: string }
  | { readonly kind: 'npmPackage'; readonly repo: string; readonly package: string }
  | { readonly kind: 'mavenPackage'; readonly repo: string; readonly coordinate: string }
  | { readonly kind: 'daemon'; readonly repo: string; readonly daemon: string };

const IMAGE_SCOPE = 'qits/';

/**
 * The artifact's page in qits-artifacts' store, as the release page's links address it
 * (`release-links.ts`): images in `qits` (without its `qits/` prefix), npm packages in `npm`,
 * maven packages in `maven`, daemons in `daemons`. None for another ecosystem.
 */
export function artifactPage(dependent: PackageDependent): ArtifactPage | undefined {
  const name = dependent.artifactName ?? '';
  if (!name) return undefined;
  switch (dependent.artifactEcosystem) {
    case 'docker':
      return {
        kind: 'image',
        repo: 'qits',
        image: name.startsWith(IMAGE_SCOPE) ? name.slice(IMAGE_SCOPE.length) : name,
      };
    case 'npm':
      return { kind: 'npmPackage', repo: 'npm', package: name };
    case 'maven':
      return { kind: 'mavenPackage', repo: 'maven', coordinate: name };
    case 'daemon':
      return { kind: 'daemon', repo: 'daemons', daemon: name };
    default:
      return undefined;
  }
}
