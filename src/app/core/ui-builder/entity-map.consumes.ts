/**
 * What `EntityMapStore` reads from qits-artifacts' docs store (qits-1950). The store passes these
 * to `consume(...)`, and its pact spec binds the same.
 */

/** `load()`: every docs site, to keep the `@contracts/` ones and their newest version. */
export const LIST_DOCS_SITES = ['sites[].name', 'sites[].latestVersion'] as const;

/**
 * `load()`: each `@contracts/` site's versions, to learn which repository its newest version names
 * (`git.repository.name`). `metadata` is a map whose keys hold dots, so it is bound whole.
 */
export const LIST_DOCS_VERSIONS = ['versions[].version', 'versions[].metadata'] as const;

/**
 * `readMap(site)`: the version's `entities.json`. The answer is a file as published, not an API
 * schema, so the pact binds its status and media type, never a field; the store checks the map's
 * shape itself (`asEntityMap`).
 */
export const GET_DOCS_FILE = [] as const;
