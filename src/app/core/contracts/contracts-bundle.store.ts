import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { GET_DOCS_FILE } from '$core/ui-builder/entity-map.consumes';
import type { ContractsSite } from '$core/ui-builder/entity-map.store';
import {
  goldenIndexOf,
  goldenResponse,
  safeRecordedFile,
  type GoldenIndex,
  type GoldenOperation,
} from '$core/ui-builder/golden-masters.store';
import { getDocsFile } from '../../api/artifacts';
import {
  asDatabaseIndex,
  mermaidOf,
  tableOf,
  unitOf,
  type DatabaseIndex,
} from './database-diagram';

/** The docs repository of qits-artifacts' store, where `@contracts/<app>` sites are published. */
const REPOSITORY = 'docs';

/** The ER diagrams' index in a contracts site's version (qits-2014). */
const DATABASE_INDEX = 'database/index.json';

/**
 * Asks Angular's `HttpRequest` for the body as text, not JSON (the diagrams are `text/markdown`).
 * The generated options do not name `responseType`, but the client hands every option to the
 * request's init, which reads it.
 */
const AS_TEXT = { responseType: 'text' } as const;

/** One bundle's `golden-masters/index.json`. */
export type GoldenIndexRead =
  | { readonly status: 'loading' }
  /** Unreadable, or not an index. */
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly index: GoldenIndex };

/** One recorded response. */
export type RecordingRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** The index records no file (a byte answer), the answer has no body, or it is not JSON. */
  | { readonly status: 'none' }
  /** Pretty-printed JSON. */
  | { readonly status: 'loaded'; readonly json: string };

/** The ER diagram of the persistence unit holding one entity (qits-2014). */
export type DiagramRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /**
   * The version publishes no `database/index.json` or no such diagram (a 404), or no unit holds
   * the entity: no diagram published, not an error.
   */
  | { readonly status: 'none' }
  /**
   * `definition` is the mermaid block's body, without the fence; `table` is the entity's own table
   * as the index names it (null when it names none), which the diagram draws as one of its boxes.
   */
  | {
      readonly status: 'loaded';
      readonly unit: string;
      readonly table: string | null;
      readonly definition: string;
    };

interface ContractsBundleState {
  /** By `siteKey`. */
  readonly indexes: Readonly<Record<string, GoldenIndexRead>>;
  /** By `recordingKey`. */
  readonly recordings: Readonly<Record<string, RecordingRead>>;
  /** By `diagramKey`. */
  readonly diagrams: Readonly<Record<string, DiagramRead>>;
}

const siteKey = ({ site, version }: ContractsSite) => `${site}@${version}`;
const diagramKey = (site: ContractsSite, entity: string) => `${siteKey(site)}#${entity}`;
const recordingKey = (site: ContractsSite, op: GoldenOperation) =>
  `${siteKey(site)}/${op.file ?? `${op.operationId}#${op.status}`}`;

/**
 * The version's `database/index.json` (qits-2014), read as JSON and checked by `asDatabaseIndex`;
 * `none` when the version holds none (a 404, as every bundle published before qits-2014); null
 * when the read fails or the file is not an index. Exported, as `diagramFileOf` is, so the pact
 * spec can make the read alone.
 */
export async function databaseIndexOf({
  site,
  version,
}: ContractsSite): Promise<DatabaseIndex | 'none' | null> {
  const { data, error, response } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site, version, path: DATABASE_INDEX } }),
    GET_DOCS_FILE,
  );
  if (response?.status === 404) return 'none';
  // The file is `application/json`, read as JSON (the default); no schema types it.
  return error === undefined ? asDatabaseIndex(data as unknown) : null;
}

/**
 * One unit's diagram, `database/<file>` of the version, as its Markdown text; `none` on a 404;
 * null when the read fails, or when `file` is not plain relative segments (`safeRecordedFile`),
 * which is then not read: the docs path keeps `/` literal on the wire.
 */
export async function diagramFileOf(
  { site, version }: ContractsSite,
  file: string,
): Promise<string | 'none' | null> {
  if (!safeRecordedFile(file)) return null;
  const { data, error, response } = await consume(
    getDocsFile({
      path: { repository: REPOSITORY, site, version, path: `database/${file}` },
      ...AS_TEXT,
    }),
    GET_DOCS_FILE,
  );
  if (response?.status === 404) return 'none';
  const markdown = data as unknown;
  return error === undefined && typeof markdown === 'string' ? markdown : null;
}

/**
 * A repository's contracts bundle for its contracts and entities pages (qits-1994): the provider
 * states a service's `@contracts/<application>` docs site publishes, and their recorded responses.
 * Which site is the repository's, and its `entities.json`, come from `EntityMapStore` (the catalog
 * by `git.repository.name`, `contractsSitesOf`, and `readMap`), so the UI builder and these pages
 * share one catalog read and one read per map.
 *
 * - `readIndex(site)` reads the version's `golden-masters/index.json` through `goldenIndexOf`, the
 *   call popover's read and cache (`golden-masters.store.ts`), checked by `asGoldenIndex`.
 * - `readRecording(site, operation)` reads one recorded response lazily through `goldenResponse`,
 *   which never reads a file outside the index's own tree (`safeRecordedFile`) nor one the index
 *   records none for (a byte answer, qits-1934).
 * - `readDiagram(site, entity)` (qits-2014) reads the version's `database/index.json`
 *   (`databaseIndexOf`, once per version), finds the unit whose `entities[].entity` is `entity`
 *   (`unitOf`), reads that unit's `database/<file>` (`diagramFileOf`) and keeps its fenced mermaid
 *   block (`mermaidOf`). A 404 on either file, or no unit holding the entity, is `none`; a file
 *   that is not an index, or a diagram file without a mermaid block, is `error`.
 *
 * Every read is `getDocsFile` of qits-artifacts' docs store; the store calls no other operation.
 * The site and the file path go on the wire through `literalDocsPaths` (`docs-paths.ts`).
 * A failed read is not kept, so asking again retries.
 *
 * Staleness (qits-1270): none. All are keyed by site and version, and a published version never
 * changes; a newer version is a new catalog entry, which `EntityMapStore.follow` reads again.
 */
export const ContractsBundleStore = signalStore(
  { providedIn: 'root' },
  withState<ContractsBundleState>({ indexes: {}, recordings: {}, diagrams: {} }),
  withMethods((store) => {
    /** Each version's database index read, by `siteKey`; a failed read is dropped, to retry. */
    const databaseIndexes = new Map<string, Promise<DatabaseIndex | 'none' | null>>();

    function databaseIndex(site: ContractsSite): Promise<DatabaseIndex | 'none' | null> {
      const key = siteKey(site);
      let found = databaseIndexes.get(key);
      if (!found) {
        found = databaseIndexOf(site).catch(() => null);
        void found.then((index) => {
          if (index === null) databaseIndexes.delete(key);
        });
        databaseIndexes.set(key, found);
      }
      return found;
    }

    async function diagramOf(site: ContractsSite, entity: string): Promise<DiagramRead> {
      const index = await databaseIndex(site);
      if (index === null) return { status: 'error' };
      const unit = index === 'none' ? null : unitOf(index, entity);
      if (!unit) return { status: 'none' };
      const markdown = await diagramFileOf(site, unit.file).catch(() => null);
      if (markdown === null) return { status: 'error' };
      if (markdown === 'none') return { status: 'none' };
      const definition = mermaidOf(markdown);
      return definition === null
        ? { status: 'error' }
        : { status: 'loaded', unit: unit.unit, table: tableOf(unit, entity), definition };
    }

    async function readDiagram(site: ContractsSite, entity: string): Promise<void> {
      const read = await diagramOf(site, entity);
      patchState(store, {
        diagrams: { ...store.diagrams(), [diagramKey(site, entity)]: read },
      });
    }

    async function readIndex(site: ContractsSite): Promise<void> {
      const index = await goldenIndexOf(site).catch(() => null);
      patchState(store, {
        indexes: {
          ...store.indexes(),
          [siteKey(site)]: index ? { status: 'loaded', index } : { status: 'error' },
        },
      });
    }

    async function readRecording(site: ContractsSite, op: GoldenOperation): Promise<void> {
      const body = await goldenResponse(site, op).catch(() => null);
      const read: RecordingRead =
        body === null
          ? { status: 'error' }
          : typeof body === 'string'
            ? { status: 'none' }
            : { status: 'loaded', json: JSON.stringify(body, null, 2) };
      patchState(store, { recordings: { ...store.recordings(), [recordingKey(site, op)]: read } });
    }

    return {
      /** Starts reading the site's index, unless held (again after an error). */
      readIndex(site: ContractsSite): void {
        const current = store.indexes()[siteKey(site)];
        if (current && current.status !== 'error') return;
        patchState(store, {
          indexes: { ...store.indexes(), [siteKey(site)]: { status: 'loading' } },
        });
        void readIndex(site);
      },

      /** What is held for the site's index. */
      indexRead(site: ContractsSite): GoldenIndexRead | undefined {
        return store.indexes()[siteKey(site)];
      },

      /**
       * Starts reading one recorded response, unless held (again after an error). An operation
       * without a file, or answered 204 No Content (its file holds `null`), is `none` at once:
       * there is nothing to read.
       */
      readRecording(site: ContractsSite, op: GoldenOperation): void {
        const key = recordingKey(site, op);
        const current = store.recordings()[key];
        if (current && current.status !== 'error') return;
        if (op.file === null || op.status === 204) {
          patchState(store, { recordings: { ...store.recordings(), [key]: { status: 'none' } } });
          return;
        }
        patchState(store, { recordings: { ...store.recordings(), [key]: { status: 'loading' } } });
        void readRecording(site, op);
      },

      /** What is held for one recorded response. */
      recordingRead(site: ContractsSite, op: GoldenOperation): RecordingRead | undefined {
        return store.recordings()[recordingKey(site, op)];
      },

      /** Starts reading the ER diagram of `entity`'s unit, unless held (again after an error). */
      readDiagram(site: ContractsSite, entity: string): void {
        const key = diagramKey(site, entity);
        const current = store.diagrams()[key];
        if (current && current.status !== 'error') return;
        patchState(store, { diagrams: { ...store.diagrams(), [key]: { status: 'loading' } } });
        void readDiagram(site, entity);
      },

      /** What is held for the ER diagram of `entity`'s unit. */
      diagramRead(site: ContractsSite, entity: string): DiagramRead | undefined {
        return store.diagrams()[diagramKey(site, entity)];
      },
    };
  }),
);
