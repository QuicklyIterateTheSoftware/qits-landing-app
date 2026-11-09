import { consume } from '@qits/angular';
import { getDocsFile } from '../../api/artifacts';
import { GET_DOCS_FILE } from './entity-map.consumes';
import type { ContractsSite } from './entity-map.store';

/**
 * A service's golden masters for the UI builder's call popover (qits-1999), read from its
 * `@contracts/<application>` docs site in qits-artifacts' docs store at the version `site` names:
 * `golden-masters/index.json` (the states and what each records) and one recorded response.
 *
 * Plain functions rather than a signal store: the popover reads once per call it opens, and a
 * published version never changes, so the reads are cached per site, version and path here, and
 * nothing goes stale. A failed read is dropped from the cache, so opening the popover again
 * retries. The site and the path go on the wire through `literalDocsPaths` (`docs-paths.ts`), as
 * `EntityMapStore`'s do.
 */

/** The docs repository of qits-artifacts' store, where `@contracts/<app>` sites are published. */
const REPOSITORY = 'docs';

/** The index of a contracts site's golden masters. */
const INDEX_FILE = 'golden-masters/index.json';

/** One recorded call against a state. */
export interface GoldenOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  /** Relative to `golden-masters/`. */
  readonly file: string;
}

/** One provider state, as `golden-masters/index.json` lists it. */
export interface GoldenState {
  readonly name: string;
  readonly slug: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly dependsOn?: readonly (string | { readonly provider: string; readonly state: string })[];
  readonly operations: readonly GoldenOperation[];
}

interface GoldenIndex {
  readonly states?: readonly GoldenState[];
}

/** Reads by `<site>@<version>/<path>`. */
const cache = new Map<string, Promise<unknown>>();

/**
 * One file of the site's version, as published: parsed JSON for a JSON file, else its text; null
 * when the read fails. The pact binds the read's status and media type, never the file's content.
 */
export async function contractsFileOf(site: ContractsSite, path: string): Promise<unknown> {
  const { data, error } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site: site.site, version: site.version, path } }),
    GET_DOCS_FILE,
  );
  return error === undefined ? (data as unknown) : null;
}

function cached(site: ContractsSite, path: string): Promise<unknown> {
  const key = `${site.site}@${site.version}/${path}`;
  let found = cache.get(key);
  if (!found) {
    found = contractsFileOf(site, path).catch(() => null);
    void found.then((value) => {
      if (value === null) cache.delete(key);
    });
    cache.set(key, found);
  }
  return found;
}

/** The named state and its recording of `operationId`; null when the site lists no such state. */
export async function goldenCall(
  site: ContractsSite,
  state: string,
  operationId: string,
): Promise<{ state: GoldenState; operation: GoldenOperation | null } | null> {
  const index = (await cached(site, INDEX_FILE)) as GoldenIndex | null;
  const states: readonly GoldenState[] = Array.isArray(index?.states) ? index.states : [];
  const found = states.find((s) => s.name === state);
  if (!found) return null;
  return {
    state: found,
    operation: found.operations.find((o) => o.operationId === operationId) ?? null,
  };
}

/**
 * A recorded file's path as the index gives it, when it is plain relative segments: letters,
 * digits, `.`, `_` and `-`, no `.` or `..` segment, no leading `/`, no backslash or `%`. The docs
 * path keeps `/` literal on the wire, so a `..` in an index would otherwise reach another path of
 * the store with the person's bearer.
 */
export function safeRecordedFile(file: string): boolean {
  return /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(file) && !/(^|\/)\.\.?(\/|$)/.test(file);
}

/**
 * The recorded response of one operation in one state, as published; null when unreadable, or
 * when the index names a file outside its own tree (`safeRecordedFile`), which is then not read.
 */
export function goldenResponse(site: ContractsSite, operation: GoldenOperation): Promise<unknown> {
  if (!safeRecordedFile(operation.file)) return Promise.resolve(null);
  return cached(site, `golden-masters/${operation.file}`);
}
