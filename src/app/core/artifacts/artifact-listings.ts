/**
 * The Artifacts section's pure steps (qits-2316): which listing a store repository's type has, how
 * a count and a size read, and the name search; the image page's (qits-2324): a digest shortened,
 * the tags newest push first, the untagged manifests counted; the maven package page's
 * (qits-2325): a coordinate split, the versions newest publish first, the files sorted, the SBOMs
 * joined to the versions; and the npm package page's (qits-2326): a package name split from its
 * scope (the rest shared with the maven page's). Mirrors qits-artifacts-frontend's
 * `repository-type.ts` and `format.ts`, whose `repositories/:repo` page this section replaces. No
 * row links into the old explorer any more: every listing's detail page is this app's own
 * (qits-2324 to qits-2328, and the npm package page of qits-2326, the last).
 */

/** The listings a store repository can have, one per type that has one. */
export type ListingKind = 'images' | 'npm' | 'maven' | 'daemons' | 'docs' | 'records';

/** The store repository the section opens on: the seeded platform image repository. */
export const DEFAULT_STORE_REPOSITORY = 'qits';

/**
 * The listing a repository of `type` has; undefined for a type with none here (today `sboms`),
 * which makes no second request.
 */
export function listingOf(type: string | undefined): ListingKind | undefined {
  switch (type) {
    case 'oci-images':
      return 'images';
    case 'npm-packages':
      return 'npm';
    case 'maven-packages':
      return 'maven';
    case 'daemon-binaries':
      return 'daemons';
    case 'docs':
      return 'docs';
    case 'ci-screenshots':
    case 'ci-videos':
      return 'records';
    default:
      return undefined;
  }
}

/** What a listing holds, in the plural: "This repository holds no <noun>." */
export const LISTING_NOUNS: Readonly<Record<ListingKind, string>> = {
  images: 'images',
  npm: 'packages',
  maven: 'Maven coordinates',
  daemons: 'daemons',
  docs: 'documentation sites',
  records: 'records',
};

/**
 * What a repository of `type` counts, as a word: `itemCount` is images here, packages there,
 * deployed files for maven, published versions for the daemons and for docs, and records for the
 * ci types.
 */
export function itemNoun(type: string | undefined): string {
  switch (type) {
    case 'oci-images':
      return 'image';
    case 'npm-packages':
      return 'package';
    case 'maven-packages':
      return 'file';
    case 'daemon-binaries':
    case 'docs':
      return 'version';
    default:
      return 'record';
  }
}

/**
 * `10 images`, `1 image`: a count is never drawn without the noun it counts. A noun that does not
 * take an `s` names its plural (`plural(3, 'registry', 'registries')`).
 */
export function plural(
  count: number | undefined,
  singular: string,
  many: string = `${singular}s`,
): string {
  const n = count ?? 0;
  return `${n} ${n === 1 ? singular : many}`;
}

/** What is drawn for a size the service did not measure. */
export const UNKNOWN_SIZE = 'not measured';

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

/**
 * `4.04 GiB`, `164 MiB`, `85.0 KiB`, `0 B`: binary units, three significant figures, whole bytes
 * below a KiB; a missing size is {@link UNKNOWN_SIZE}, never `0 B`.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return UNKNOWN_SIZE;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/** The rows whose `key` holds `search` (trimmed, any case); every row for an empty search. */
export function searched<T>(
  rows: readonly T[],
  search: string,
  key: (row: T) => string,
): readonly T[] {
  const needle = search.trim().toLocaleLowerCase();
  return needle ? rows.filter((row) => key(row).toLocaleLowerCase().includes(needle)) : rows;
}

/** A record's metadata as `key=value · key=value`; `—` when it has none. */
export function metadataLine(metadata: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(metadata ?? {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' · ') : '—';
}

/** The length a commit hash is shortened to. */
const SHORT_COMMIT = 7;

/**
 * Where a docs version came from (qits-2328), from the metadata keys sites carry: the repository, the branch (only
 * `@userflows/*` sites name one), the commit shortened, and the release request (changelogs name
 * one), joined by ` · `; `—` when none is present. Plain text: the store joins to no project.
 */
export function publishedFrom(metadata: Readonly<Record<string, string>> | undefined): string {
  const held = metadata ?? {};
  const parts = [
    held['git.repository.name'],
    held['git.branch.name'],
    held['git.commit.hash']?.slice(0, SHORT_COMMIT),
    held['release.request.qualified-id'],
  ].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : '—';
}

/**
 * `sha256:1b91a3dfff59`: a digest's algorithm and the first 12 characters of its hex, as the old
 * explorer shortened them; a digest without an algorithm is cut the same; `—` for none.
 */
export function shortDigest(digest: string | null | undefined): string {
  if (!digest) return '—';
  const colon = digest.indexOf(':');
  const algorithm = colon >= 0 ? digest.slice(0, colon + 1) : '';
  return `${algorithm}${digest.slice(colon + 1, colon + 13)}`;
}

/** An instant's epoch milliseconds; 0 for none or one that does not parse (sorted last). */
const epochOf = (iso: string | null | undefined): number => Date.parse(iso ?? '') || 0;

/**
 * The tags newest push first (`createdAt`), a tag without one last, then by name; never mutates
 * `tags`.
 */
export function newestPushFirst<T extends { readonly tag?: string; readonly createdAt?: string }>(
  tags: readonly T[],
): readonly T[] {
  return [...tags].sort(
    (a, b) =>
      epochOf(b.createdAt) - epochOf(a.createdAt) || (a.tag ?? '').localeCompare(b.tag ?? ''),
  );
}

/** How many manifests no tag names (their `tags` empty or absent). */
export function untaggedCount(manifests: readonly { readonly tags?: readonly string[] }[]): number {
  return manifests.filter((manifest) => (manifest.tags ?? []).length === 0).length;
}

/**
 * A maven coordinate, `groupId:artifactId`, split at its last colon; a name without one is all
 * artifactId.
 */
export function splitCoordinate(coordinate: string): {
  readonly groupId: string;
  readonly artifactId: string;
} {
  const colon = coordinate.lastIndexOf(':');
  return colon < 0
    ? { groupId: '', artifactId: coordinate }
    : { groupId: coordinate.slice(0, colon), artifactId: coordinate.slice(colon + 1) };
}

/**
 * An npm package name split into its scope and its own name (qits-2326): `@qits/angular` is scope
 * `@qits` and name `angular`; an unscoped name has no scope (`''`). Split at the first `/`, which
 * a scoped name holds once.
 */
export function splitPackageName(packageName: string): {
  readonly scope: string;
  readonly name: string;
} {
  const slash = packageName.indexOf('/');
  return packageName.startsWith('@') && slash > 0
    ? { scope: packageName.slice(0, slash), name: packageName.slice(slash + 1) }
    : { scope: '', name: packageName };
}

/** Two versions compared as people read them: `2100.10.0` after `2100.9.0`. */
const byVersion = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The versions newest publish first (`publishedAt`), a version without one (absent or null, as an
 * npm version whose publish was not recorded) last, then the higher version first; never mutates `versions`. The store answers in its own order (oldest first).
 */
export function newestPublishFirst<
  T extends { readonly version?: string; readonly publishedAt?: string | null },
>(versions: readonly T[]): readonly T[] {
  return [...versions].sort(
    (a, b) =>
      epochOf(b.publishedAt) - epochOf(a.publishedAt) ||
      byVersion(b.version ?? '', a.version ?? ''),
  );
}

/** A version's file names in order (the store answers them in either order); never mutates. */
export function sortedFiles(files: readonly string[] | undefined): readonly string[] {
  return [...(files ?? [])].sort((a, b) => a.localeCompare(b));
}

/** The SBOMs by the release version each documents. */
export function sbomsByVersion<T extends { readonly version?: string }>(
  sboms: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(sboms.flatMap((sbom) => (sbom.version ? [[sbom.version, sbom] as const] : [])));
}

/**
 * How many SBOMs document a version the store no longer holds (its files were swept, the SBOM
 * kept).
 */
export function orphanSbomCount(
  sboms: readonly { readonly version?: string }[],
  versions: readonly { readonly version?: string }[],
): number {
  const stored = new Set(versions.map((version) => version.version));
  return sboms.filter((sbom) => !stored.has(sbom.version)).length;
}
