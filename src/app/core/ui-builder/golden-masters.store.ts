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
  /** With the app root (`/projects/api/…`), `{param}` placeholders as recorded. */
  readonly path: string;
  /** The recorded query, when the call has one. */
  readonly query?: Readonly<Record<string, unknown>>;
  /** The recorded request body, when the call sends one. */
  readonly body?: unknown;
  readonly status: number;
  /** The recorded response headers the provider keeps, when it keeps any. */
  readonly responseHeaders?: Readonly<Record<string, string>>;
  /** The media type of a recorded body that is not JSON, when the index names one. */
  readonly contentType?: string;
  /**
   * The recorded response, relative to `golden-masters/`; null when the answer is bytes the index
   * records no file for (qits-1934: an image), or no body at all.
   */
  readonly file: string | null;
}

/** A provider state's dependency: a state of the same provider, or one of another. */
export type GoldenDependency = string | { readonly provider: string; readonly state: string };

/** One provider state, as `golden-masters/index.json` lists it. */
export interface GoldenState {
  readonly name: string;
  readonly slug: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly dependsOn?: readonly GoldenDependency[];
  readonly operations: readonly GoldenOperation[];
}

/** A contracts site's `golden-masters/index.json`. */
export interface GoldenIndex {
  readonly formatVersion?: number;
  /** The provider's application name (`qits-projects`). */
  readonly provider?: string;
  readonly states?: readonly GoldenState[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isGoldenOperation = (value: unknown): value is GoldenOperation =>
  isObject(value) &&
  typeof value['operationId'] === 'string' &&
  typeof value['method'] === 'string' &&
  typeof value['path'] === 'string' &&
  typeof value['status'] === 'number' &&
  (typeof value['file'] === 'string' || value['file'] === null || value['file'] === undefined);

const isGoldenState = (value: unknown): value is GoldenState =>
  isObject(value) &&
  typeof value['name'] === 'string' &&
  typeof value['slug'] === 'string' &&
  Array.isArray(value['operations']) &&
  value['operations'].every(isGoldenOperation);

/**
 * `value` as a golden-masters index when it has the index's shape (a `states` list, each with a
 * `name`, a `slug` and recorded `operations`), else null. The file is published, not an API answer,
 * so its shape is checked here; a missing `file` reads as null.
 */
export function asGoldenIndex(value: unknown): GoldenIndex | null {
  if (!isObject(value) || !Array.isArray(value['states'])) return null;
  if (!value['states'].every(isGoldenState)) return null;
  return {
    ...value,
    states: (value['states'] as GoldenState[]).map((state) => ({
      ...state,
      operations: state.operations.map((op) => ({ ...op, file: op.file ?? null })),
    })),
  };
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

/**
 * Empties the reads' cache. For the browser specs only: their files share this module, so without
 * it a read answered in one spec file is never made in the next, and which recorded answers a page
 * shows (the route ledger) would depend on the order the files run in.
 */
export function forgetContractsFiles(): void {
  cache.clear();
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

/**
 * The site's `golden-masters/index.json` (cached, see `cached`), checked by `asGoldenIndex`; null
 * when it cannot be read or is not an index.
 */
export async function goldenIndexOf(site: ContractsSite): Promise<GoldenIndex | null> {
  return asGoldenIndex(await cached(site, INDEX_FILE));
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
 * The recorded response of one operation in one state, as published; null when unreadable, when
 * the index records no file (a byte answer), or when it names a file outside its own tree
 * (`safeRecordedFile`), which is then not read.
 */
export function goldenResponse(site: ContractsSite, operation: GoldenOperation): Promise<unknown> {
  if (operation.file === null || !safeRecordedFile(operation.file)) return Promise.resolve(null);
  return cached(site, `golden-masters/${operation.file}`);
}
