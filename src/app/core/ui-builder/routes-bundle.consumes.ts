/**
 * What `RoutesBundleStore` reads from qits-artifacts' docs store (qits-1951). The store passes these
 * to `consume(...)`, and its pact spec binds the same.
 */

/** `load(repo)`: every docs site, to keep the `@routes/` ones and their newest version. */
export const LIST_DOCS_SITES = ['sites[].name', 'sites[].latestVersion'] as const;

/**
 * `load(repo)`: each `@routes/` site's versions, to find the one whose newest version names the
 * repository in its metadata (`git.repository.name`). `metadata` is a map whose keys hold dots, so
 * it is bound whole.
 */
export const LIST_DOCS_VERSIONS = ['versions[].version', 'versions[].metadata'] as const;

/** `freeze(...)`, once per bundle: the bundle's file paths, to read its `assets/*`. */
export const GET_DOCS_VERSION = ['files'] as const;

/**
 * `load(repo)` (the `manifest.json`), `freeze(...)` (a freeze's HTML) and the bundle's assets (a
 * font): a file's bytes. The answer is a file as published, not an API schema, so the pact binds
 * its status and media type, never a field; the store checks the manifest's shape itself
 * (`asManifest`).
 */
export const GET_DOCS_FILE = [] as const;
