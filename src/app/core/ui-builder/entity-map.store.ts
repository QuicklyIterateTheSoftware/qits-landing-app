import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { injectRefreshOn, payloadField } from '$core/events/refresh-on';
import { getDocsFile, listDocsSites, listDocsVersions } from '../../api/artifacts';
import { GET_DOCS_FILE, LIST_DOCS_SITES, LIST_DOCS_VERSIONS } from './entity-map.consumes';
import { asEntityMap, type EntityMap } from './entity-map';

/** The docs repository of qits-artifacts' store, where `@contracts/<app>` sites are published. */
const REPOSITORY = 'docs';

/** The prefix of a service's contracts site (qits-1945). */
const CONTRACTS_SITE = '@contracts/';

/** The metadata key the release writes from the repository itself. */
const REPOSITORY_NAME = 'git.repository.name';

/** The entity map's file in a contracts site's version. */
const ENTITIES_FILE = 'entities.json';

/** A `@contracts/` site's newest version, with the repository that version names. */
export interface ContractsSite {
  readonly site: string;
  readonly version: string;
  /** The version's `git.repository.name` (`qits-projects-service`). */
  readonly repository: string;
}

/** Every `@contracts/` site, as `load()` found them. */
export interface ContractsSites {
  /** The sites whose newest version names a repository. */
  readonly sites: readonly ContractsSite[];
  /** The sites whose versions could not be read, so which repository they name is unknown. */
  readonly unreadable: readonly string[];
}

/** The catalog of contracts sites. */
export type ContractsCatalog =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | ({ readonly status: 'loaded' } & ContractsSites);

/** One site's `entities.json`, read on demand. */
export type EntityMapRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** The version holds no `entities.json` (a 404): no entity map published, not an error. */
  | { readonly status: 'none' }
  | { readonly status: 'loaded'; readonly map: EntityMap };

interface EntityMapState {
  /** The contracts sites; null until `load()`. */
  readonly catalog: ContractsCatalog | null;
  /** Each map read, by `mapKey`. */
  readonly maps: Readonly<Record<string, EntityMapRead>>;
}

const mapKey = ({ site, version }: { site: string; version: string }) => `${site}@${version}`;

/**
 * Every `@contracts/` site with its newest version and the repository that version names
 * (`git.repository.name`); a site whose newest version names none is left out, and one whose
 * versions cannot be read is `unreadable`. Null when the catalog cannot be read. Each read is one
 * of the steps `EntityMapStore` makes, exported so its pact spec can make them one at a time.
 */
export async function contractsSitesOf(): Promise<ContractsSites | null> {
  const { data, error } = await consume(
    listDocsSites({ path: { repository: REPOSITORY } }),
    LIST_DOCS_SITES,
  );
  if (error !== undefined || !data) return null;
  const sites = (data.sites ?? []).filter((site) => site.name?.startsWith(CONTRACTS_SITE));
  const found = await Promise.all(
    sites.map(async (site): Promise<ContractsSite | 'unnamed' | string> => {
      const name = site.name ?? '';
      const answer = await consume(
        listDocsVersions({ path: { repository: REPOSITORY, site: name } }),
        LIST_DOCS_VERSIONS,
      );
      if (answer.error !== undefined || !answer.data) return name;
      const versions = answer.data.versions ?? [];
      // Newest first; the catalog's `latestVersion` names it should the order ever differ.
      const newest = versions.find((v) => v.version === site.latestVersion) ?? versions[0];
      const repository = newest?.metadata?.[REPOSITORY_NAME];
      return repository && newest.version
        ? { site: name, version: newest.version, repository }
        : 'unnamed';
    }),
  );
  return {
    sites: found.filter((entry): entry is ContractsSite => typeof entry === 'object'),
    unreadable: found.filter(
      (entry): entry is string => typeof entry === 'string' && entry !== 'unnamed',
    ),
  };
}

/**
 * The version's `entities.json`, read as JSON and checked by `asEntityMap`; `none` when the version
 * holds none (a 404); null when the read fails or the file is not a map.
 */
export async function entityMapOf({
  site,
  version,
}: {
  site: string;
  version: string;
}): Promise<EntityMap | 'none' | null> {
  const { data, error, response } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site, version, path: ENTITIES_FILE } }),
    GET_DOCS_FILE,
  );
  if (response?.status === 404) return 'none';
  // The file is `application/json`, read as JSON (the default); no schema types it.
  return error === undefined ? asEntityMap(data as unknown) : null;
}

/**
 * The services' entity maps (qits-1950), from qits-artifacts' docs store, where every release of a
 * service that declares `contracts.entities` publishes `entities.json` in `@contracts/<application>`
 * (qits-1945).
 *
 * - `load()` lists the docs sites and reads each `@contracts/` site's versions, to learn which
 *   repository its newest version names (`contractsSitesOf`): found from declared metadata, never
 *   from the name. The UI builder keeps the sites its scope covers.
 * - `readMap(site)` reads that version's `entities.json` (`entityMapOf`), once. A 404 is `none`
 *   (no entity map published), any other failure `error`, for that site alone.
 *
 * The site and the file path go on the wire through `literalDocsPaths` (`docs-paths.ts`), as
 * `RoutesBundleStore`'s do. The catalog is read by this store itself, not shared with
 * `RoutesBundleStore`: each store stays one read path, at the cost of one more `listDocsSites`.
 *
 * Staleness (qits-1270): `SCMRelease` of the frontend (`follow`'s `repo`) or of a repository a
 * contracts site names → the catalog (`refresh()`), at most once a second. Only a release publishes
 * a new version, and the docs store emits no event of its own. Maps are keyed by site and version,
 * and a published version never changes, so nothing makes them stale.
 */
export const EntityMapStore = signalStore(
  { providedIn: 'root' },
  withState<EntityMapState>({ catalog: null, maps: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    async function read(): Promise<ContractsCatalog> {
      const found = await contractsSitesOf();
      return found ? { status: 'loaded', ...found } : { status: 'error' };
    }

    /** Fetch again, keeping a loaded catalog through a failed read. */
    async function refresh(): Promise<void> {
      const next = await read();
      if (next.status === 'error' && store.catalog()?.status === 'loaded') return;
      patchState(store, { catalog: next });
    }

    async function readMap(site: ContractsSite): Promise<void> {
      const map = await entityMapOf(site);
      patchState(store, {
        maps: {
          ...store.maps(),
          [mapKey(site)]:
            map === null
              ? { status: 'error' }
              : map === 'none'
                ? { status: 'none' }
                : { status: 'loaded', map },
        },
      });
    }

    return {
      /** Reads the catalog once, and again after an error. */
      async load(): Promise<void> {
        const current = store.catalog();
        if (current && current.status !== 'error') return;
        patchState(store, { catalog: { status: 'loading' } });
        patchState(store, { catalog: await read() });
      },

      refresh,

      /**
       * Reads the catalog again after a release of the frontend `repo` names, or of a repository a
       * contracts site names (see the store's staleness note), until `destroy` is destroyed.
       */
      follow(repo: () => string | undefined, destroy: DestroyRef): void {
        refreshOn(
          {
            names: ['SCMRelease'],
            when: (event) => {
              const released =
                payloadField(event, 'repositoryName') ?? payloadField(event, 'repository');
              if (!released || store.catalog() === null) return false;
              const catalog = store.catalog();
              return (
                released === repo() ||
                (catalog?.status === 'loaded' &&
                  catalog.sites.some((site) => site.repository === released))
              );
            },
            refresh: () => refresh(),
          },
          destroy,
        );
      },

      /** Starts reading one site's map, unless held (again after an error). */
      readMap(site: ContractsSite): void {
        const key = mapKey(site);
        const current = store.maps()[key];
        if (current && current.status !== 'error') return;
        patchState(store, { maps: { ...store.maps(), [key]: { status: 'loading' } } });
        void readMap(site);
      },

      /** What is held for one site's map. */
      mapRead(site: ContractsSite): EntityMapRead | undefined {
        return store.maps()[mapKey(site)];
      },
    };
  }),
);
