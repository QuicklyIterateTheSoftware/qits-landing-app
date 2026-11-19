/**
 * The Artifacts section's pure steps (qits-2316): which listing a store repository's type has, how
 * a count and a size read, the name search, and the old explorer's address of a row's detail page.
 * Mirrors qits-artifacts-frontend's `repository-type.ts` and `format.ts`, whose
 * `repositories/:repo` page this section replaces.
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
 * The old explorer's segment for a row's detail page below `repositories/<repo>/`; none for the ci
 * records, which have no detail page.
 */
const DETAIL_SEGMENTS: Readonly<Partial<Record<ListingKind, string>>> = {
  images: 'images',
  npm: 'packages',
  maven: 'maven-packages',
  daemons: 'daemons',
  docs: 'docs',
};

/**
 * The address of a row's detail page in the old explorer (qits-artifacts-frontend), until its
 * landing page exists: `<origin>/repositories/<repo>/<segment>/<name>`, the repository and the name
 * each one segment (`@qits/angular` is `%40qits%2Fangular`). `''` while the origin is not known
 * (the server render) or for a listing without detail pages.
 */
export function oldDetailHref(
  origin: string,
  repo: string,
  kind: ListingKind,
  name: string,
): string {
  const segment = DETAIL_SEGMENTS[kind];
  if (!origin || !segment || !name) return '';
  return `${origin}/repositories/${encodeURIComponent(repo)}/${segment}/${encodeURIComponent(name)}`;
}

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

/** `10 images`, `1 image`: a count is never drawn without the noun it counts. */
export function plural(count: number | undefined, singular: string): string {
  const n = count ?? 0;
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
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
