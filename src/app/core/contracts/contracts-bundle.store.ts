import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import type { ContractsSite } from '$core/ui-builder/entity-map.store';
import {
  goldenIndexOf,
  goldenResponse,
  type GoldenIndex,
  type GoldenOperation,
} from '$core/ui-builder/golden-masters.store';

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

interface ContractsBundleState {
  /** By `siteKey`. */
  readonly indexes: Readonly<Record<string, GoldenIndexRead>>;
  /** By `recordingKey`. */
  readonly recordings: Readonly<Record<string, RecordingRead>>;
}

const siteKey = ({ site, version }: ContractsSite) => `${site}@${version}`;
const recordingKey = (site: ContractsSite, op: GoldenOperation) =>
  `${siteKey(site)}/${op.file ?? `${op.operationId}#${op.status}`}`;

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
 *
 * Every read is `getDocsFile` of qits-artifacts' docs store; the store calls no other operation.
 * A failed read is not kept, so asking again retries.
 *
 * Staleness (qits-1270): none. Both are keyed by site and version, and a published version never
 * changes; a newer version is a new catalog entry, which `EntityMapStore.follow` reads again.
 */
export const ContractsBundleStore = signalStore(
  { providedIn: 'root' },
  withState<ContractsBundleState>({ indexes: {}, recordings: {} }),
  withMethods((store) => {
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
    };
  }),
);
