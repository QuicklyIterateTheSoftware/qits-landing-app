import type { DestroyRef } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { injectRefreshOn, payloadField } from '$core/events/refresh-on';
import { getDocsFile, getDocsVersion, listDocsSites, listDocsVersions } from '../../api/artifacts';
import {
  GET_DOCS_FILE,
  GET_DOCS_VERSION,
  LIST_DOCS_SITES,
  LIST_DOCS_VERSIONS,
} from './routes-bundle.consumes';
import { asManifest, inlineAssets, type RoutesManifest } from './routes-manifest';

/** The docs repository of qits-artifacts' store, where `@routes/<app>` sites are published. */
const REPOSITORY = 'docs';

/** The prefix of a frontend's frozen-routes site (qits-1948). */
const ROUTES_SITE = '@routes/';

/** The metadata key the release writes from the repository itself. */
const REPOSITORY_NAME = 'git.repository.name';

/**
 * Asks Angular's `HttpRequest` for the body in another form than JSON. The generated options do not
 * name `responseType`, but the client hands every option to the request's init, which reads it.
 */
const AS_TEXT = { responseType: 'text' } as const;
const AS_BLOB = { responseType: 'blob' } as const;

/** One version of a docs site. */
export interface BundleVersion {
  readonly site: string;
  readonly version: string;
}

/** A repository's frozen routes, as `load(repo)` left them. */
export type RoutesBundle =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  /** No `@routes/` site's newest version names the repository. */
  | { readonly status: 'none' }
  | (BundleVersion & { readonly status: 'loaded'; readonly manifest: RoutesManifest });

/** One freeze's HTML, read on demand. */
export type FreezeRead =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly html: string };

/** A bundle's `assets/*` as `data:` URLs (keyed by `assets/<file>`), or `loading`. */
type Assets = 'loading' | Readonly<Record<string, string>>;

interface RoutesBundleState {
  /** Each repository's bundle, by repository name. */
  readonly bundles: Readonly<Record<string, RoutesBundle>>;
  /** Each freeze read, by `freezeKey`. */
  readonly freezes: Readonly<Record<string, FreezeRead>>;
  /** Each bundle's assets, by `bundleKey`. */
  readonly assets: Readonly<Record<string, Assets>>;
}

const bundleKey = (site: string, version: string) => `${site}@${version}`;
const freezeKey = (site: string, version: string, file: string) =>
  `${bundleKey(site, version)}#${file}`;

/**
 * The `@routes/` site whose newest version names `repo` (`git.repository.name`), with that
 * version; `none` when no site's does; null when a read failed and so no answer is sure. Lists the
 * docs sites, then each `@routes/` site's versions. Each read is one of the steps
 * `RoutesBundleStore` makes, exported so its pact spec can make them one at a time.
 */
export async function routesSiteOf(repo: string): Promise<BundleVersion | 'none' | null> {
  const { data, error } = await consume(
    listDocsSites({ path: { repository: REPOSITORY } }),
    LIST_DOCS_SITES,
  );
  if (error !== undefined || !data) return null;
  const sites = (data.sites ?? []).filter((site) => site.name?.startsWith(ROUTES_SITE));
  const found = await Promise.all(
    sites.map(async (site): Promise<BundleVersion | 'other' | null> => {
      const name = site.name ?? '';
      const answer = await consume(
        listDocsVersions({ path: { repository: REPOSITORY, site: name } }),
        LIST_DOCS_VERSIONS,
      );
      if (answer.error !== undefined || !answer.data) return null;
      const versions = answer.data.versions ?? [];
      // Newest first; the catalog's `latestVersion` names it should the order ever differ.
      const newest = versions.find((v) => v.version === site.latestVersion) ?? versions[0];
      return newest?.metadata?.[REPOSITORY_NAME] === repo
        ? { site: name, version: newest.version ?? '' }
        : 'other';
    }),
  );
  for (const entry of found) if (entry !== null && entry !== 'other') return entry;
  return found.includes(null) ? null : 'none';
}

/** The bundle's `manifest.json`, read as JSON and checked by `asManifest`; null when it fails. */
export async function routesManifestOf({ site, version }: BundleVersion) {
  const { data, error } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site, version, path: 'manifest.json' } }),
    GET_DOCS_FILE,
  );
  // The file is `application/json`, read as JSON (the default); no schema types it.
  return error === undefined ? asManifest(data as unknown) : null;
}

/** One freeze's HTML; null when it cannot be read. */
export async function freezeHtmlOf({ site, version }: BundleVersion, file: string) {
  const { data, error } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site, version, path: file }, ...AS_TEXT }),
    GET_DOCS_FILE,
  );
  const html = data as unknown;
  return error === undefined && typeof html === 'string' ? html : null;
}

/** The paths of the bundle's `assets/*`, from the version's file list; none when it fails. */
export async function assetFilesOf({ site, version }: BundleVersion): Promise<readonly string[]> {
  const { data, error } = await consume(
    getDocsVersion({ path: { repository: REPOSITORY, site, version } }),
    GET_DOCS_VERSION,
  );
  return error === undefined ? (data?.files ?? []).filter((f) => f.startsWith('assets/')) : [];
}

/** One file of the bundle as a `data:` URL with its media type; null when it cannot be read. */
export async function dataUrlOf({ site, version }: BundleVersion, file: string) {
  const { data, error } = await consume(
    getDocsFile({ path: { repository: REPOSITORY, site, version, path: file }, ...AS_BLOB }),
    GET_DOCS_FILE,
  );
  const blob = data as unknown;
  return error === undefined && blob instanceof Blob ? blobDataUrl(blob) : null;
}

/** `blob` as a `data:` URL, with its media type; null when it cannot be read. */
function blobDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * A frontend's frozen routes (qits-1951), from qits-artifacts' docs store, where every release of a
 * frontend that declares `contracts.routes` publishes them as `@routes/<application>` (qits-1948).
 *
 * - `load(repo)` finds the site from declared metadata, never from the name (`routesSiteOf`: the
 *   `@routes/` site whose newest version's `git.repository.name` is `repo`; none: `none`), then
 *   reads that version's `manifest.json` (`routesManifestOf`).
 * - `freeze(bundle, file)` reads one freeze's HTML when its tab is shown, and the bundle's
 *   `assets/*` once (`getDocsVersion`'s file list), as `data:` URLs. `preview(bundle, file)`
 *   answers the HTML with its asset references inlined (`inlineAssets`) once both are in, else
 *   null. A failed asset is left out (the frame falls back to another font), so it never blocks
 *   the preview.
 *
 * Every read carries the bearer (`qitsBearerInterceptor`), which a frame or a `<base href>` at the
 * store never would. The site and the file path go on the wire as the store reads them through
 * `literalDocsPaths` (`docs-paths.ts`), which `app.config.ts` puts on the artifacts client.
 *
 * Staleness (qits-1270): `SCMRelease` of the repository (`repositoryName`, else `repository`) →
 * its bundle (`refresh(repo)`), at most once a second. Only a release publishes a new version, and
 * the docs store emits no event of its own. Freezes and assets are keyed by site and version, and a
 * published version never changes, so nothing makes them stale.
 */
export const RoutesBundleStore = signalStore(
  { providedIn: 'root' },
  withState<RoutesBundleState>({ bundles: {}, freezes: {}, assets: {} }),
  withMethods((store) => {
    const refreshOn = injectRefreshOn();

    function setBundle(repo: string, value: RoutesBundle): void {
      patchState(store, { bundles: { ...store.bundles(), [repo]: value } });
    }

    async function read(repo: string): Promise<RoutesBundle> {
      const found = await routesSiteOf(repo);
      if (found === null) return { status: 'error' };
      if (found === 'none') return { status: 'none' };
      const manifest = await routesManifestOf(found);
      return manifest ? { status: 'loaded', ...found, manifest } : { status: 'error' };
    }

    /** Fetch again, keeping a loaded answer through a failed read. */
    async function refresh(repo: string): Promise<void> {
      const next = await read(repo);
      if (next.status === 'error' && store.bundles()[repo]?.status === 'loaded') return;
      setBundle(repo, next);
    }

    async function readFreeze(bundle: BundleVersion, file: string): Promise<void> {
      const html = await freezeHtmlOf(bundle, file);
      patchState(store, {
        freezes: {
          ...store.freezes(),
          [freezeKey(bundle.site, bundle.version, file)]:
            html === null ? { status: 'error' } : { status: 'loaded', html },
        },
      });
    }

    async function readAssets(bundle: BundleVersion): Promise<void> {
      const files = await assetFilesOf(bundle);
      const read = await Promise.all(
        files.map(async (file) => [file, await dataUrlOf(bundle, file)] as const),
      );
      patchState(store, {
        assets: {
          ...store.assets(),
          [bundleKey(bundle.site, bundle.version)]: Object.fromEntries(
            read.filter((entry): entry is readonly [string, string] => entry[1] !== null),
          ),
        },
      });
    }

    return {
      /** Fetches `repo`'s bundle once, and again after an error. */
      async load(repo: string): Promise<void> {
        const current = store.bundles()[repo];
        if (current && current.status !== 'error') return;
        setBundle(repo, { status: 'loading' });
        setBundle(repo, await read(repo));
      },

      refresh,

      /**
       * Reads the bundle of the repository `repo` names again after its release (see the store's
       * staleness note), until `destroy` is destroyed.
       */
      follow(repo: () => string | undefined, destroy: DestroyRef): void {
        refreshOn(
          {
            names: ['SCMRelease'],
            when: (event) => {
              const name = repo();
              const released =
                payloadField(event, 'repositoryName') ?? payloadField(event, 'repository');
              return !!name && released === name;
            },
            refresh: () => {
              const name = repo();
              return name ? refresh(name) : undefined;
            },
          },
          destroy,
        );
      },

      /** Starts reading one freeze, unless held, and the bundle's assets, unless held. */
      freeze(bundle: BundleVersion, file: string): void {
        const key = freezeKey(bundle.site, bundle.version, file);
        const current = store.freezes()[key];
        if (!current || current.status === 'error') {
          patchState(store, { freezes: { ...store.freezes(), [key]: { status: 'loading' } } });
          void readFreeze(bundle, file);
        }
        const assets = bundleKey(bundle.site, bundle.version);
        if (store.assets()[assets] === undefined) {
          patchState(store, { assets: { ...store.assets(), [assets]: 'loading' } });
          void readAssets(bundle);
        }
      },

      /** What is held for one freeze. */
      freezeRead(bundle: BundleVersion, file: string): FreezeRead | undefined {
        return store.freezes()[freezeKey(bundle.site, bundle.version, file)];
      },

      /** The freeze's HTML with its assets inlined, once both are read; else null. */
      preview(bundle: BundleVersion, file: string): string | null {
        const read = store.freezes()[freezeKey(bundle.site, bundle.version, file)];
        const assets = store.assets()[bundleKey(bundle.site, bundle.version)];
        if (read?.status !== 'loaded' || assets === undefined || assets === 'loading') return null;
        return inlineAssets(read.html, assets);
      },
    };
  }),
);
