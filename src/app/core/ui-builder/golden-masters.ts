/**
 * A service's golden masters (qits-1999, qits-1994), as its `@contracts/<application>` docs site
 * publishes them: `golden-masters/index.json` (the states and what each records) and one recorded
 * response per operation. The shapes, and the checks a published file gets before the app reads
 * it; `ContractsBundles` reads them (qits-2146; it was `golden-masters.store.ts`'s plain functions
 * and `ContractsBundleStore`).
 */

/** The index of a contracts site's golden masters. */
export const GOLDEN_INDEX_FILE = 'golden-masters/index.json';

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
 * Where the recorded response of `operation` is, under the version's root; null when the index
 * records no file (a byte answer), or names a file outside its own tree (`safeRecordedFile`), which
 * is then not read.
 */
export function recordedFilePath(operation: GoldenOperation): string | null {
  return operation.file !== null && safeRecordedFile(operation.file)
    ? `golden-masters/${operation.file}`
    : null;
}
