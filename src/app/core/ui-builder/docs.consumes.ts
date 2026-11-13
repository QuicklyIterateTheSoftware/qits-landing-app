import type { Consumed } from '@qits/angular';
import type { ListDocsSitesResponses, ListDocsVersionsResponses } from '../../api/artifacts';

/**
 * What the app reads from qits-artifacts' docs store (qits-1950, qits-1951, qits-1994), where a
 * frontend's release publishes `@routes/<application>` and a service's `@contracts/<application>`.
 * `docs.operations.ts` declares each read with these, and `docs.operations.pact.spec.ts` binds the
 * same.
 */

/** Every docs site, to keep the `@routes/` or `@contracts/` ones and their newest version. */
export const LIST_DOCS_SITES = ['sites[].name', 'sites[].latestVersion'] as const;

/**
 * A site's versions, to learn which repository its newest version names (`git.repository.name`).
 * `metadata` is a map whose keys hold dots, so it is bound whole.
 */
export const LIST_DOCS_VERSIONS = ['versions[].version', 'versions[].metadata'] as const;

/** A routes bundle's file paths, once per bundle, to read its `assets/*`. */
export const GET_DOCS_VERSION = ['files'] as const;

/**
 * One published file: a routes bundle's `manifest.json`, a freeze's HTML and the bundle's assets
 * (a font); a contracts bundle's `entities.json`, `golden-masters/index.json`, a recorded response,
 * `database/index.json` and a diagram. The answer is a file as published, not an API schema, so
 * the pact binds its status and media type, never a field; the app checks each file's shape itself
 * (`asManifest`, `asEntityMap`, `asGoldenIndex`, `asDatabaseIndex`).
 */
export const GET_DOCS_FILE = [] as const;

/** A docs repository's sites, cut to what the app reads. */
export type DocsSites = Consumed<ListDocsSitesResponses[200], typeof LIST_DOCS_SITES>;

/** One site of the catalog, cut to what the app reads. */
export type DocsSite = NonNullable<DocsSites['sites']>[number];

/** A site's versions, cut to what the app reads. */
export type DocsVersions = Consumed<ListDocsVersionsResponses[200], typeof LIST_DOCS_VERSIONS>;

/** The metadata key a release writes from the repository itself. */
export const REPOSITORY_NAME = 'git.repository.name';

/** The docs repository of qits-artifacts' store, where `@routes/` and `@contracts/` are published. */
export const DOCS_REPOSITORY = 'docs';

/**
 * The site's newest version (the catalog's `latestVersion`, else the first: the list is newest
 * first) and the repository it names (`git.repository.name`); undefined when it has none.
 */
export function newestVersion(
  site: DocsSite,
  versions: DocsVersions | undefined,
): { readonly version?: string; readonly repository?: string } | undefined {
  const all = versions?.versions ?? [];
  const newest = all.find((v) => v.version === site.latestVersion) ?? all[0];
  if (!newest) return undefined;
  const repository = newest.metadata?.[REPOSITORY_NAME];
  return {
    version: newest.version,
    repository: typeof repository === 'string' ? repository : undefined,
  };
}
