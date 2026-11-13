import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
  type DestroyRef,
} from '@angular/core';
import { qitsResource, type QitsDomainEvent, type QitsRefreshOn } from '@qits/angular';
import { payloadField } from '$core/events/refresh-on';
import { ResourceFamily } from '$core/resources/resource-family';
import { DOCS_REPOSITORY, newestVersion, type DocsSite } from './docs.consumes';
import { DOCS_FILE, DOCS_SITES, DOCS_VERSION, DOCS_VERSIONS } from './docs.operations';
import { asManifest, inlineAssets, type RoutesManifest } from './routes-manifest';

/** The prefix of a frontend's frozen-routes site (qits-1948). */
const ROUTES_SITE = '@routes/';

/** The bundle's manifest in a routes site's version. */
const MANIFEST_FILE = 'manifest.json';

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

/** A repository's frozen routes, as `load(repo)` found them. */
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

const bundleKey = ({ site, version }: BundleVersion) => `${site}@${version}`;
const fileKey = (bundle: BundleVersion, file: string) => `${bundleKey(bundle)}/${file}`;

/** Where a read stands, as far as a step after it needs: still open, failed, or answered. */
const settled = (read: { hasValue(): boolean; status(): string } | undefined) =>
  !!read && (read.hasValue() || read.status() === 'error');

/**
 * The `@routes/` site whose newest version names `repo` (`git.repository.name`), with that version;
 * `none` when no site's does; `error` when a site's versions could not be read and so no answer is
 * sure; `loading` until every site's versions answered.
 */
export function routesSiteOf(
  repo: string,
  sites: readonly DocsSite[],
  versionsOf: (
    site: string,
  ) => { hasValue(): boolean; status(): string; value(): unknown } | undefined,
): BundleVersion | 'none' | 'error' | 'loading' {
  let failed = false;
  for (const site of sites) {
    const read = versionsOf(site.name ?? '');
    if (!read || !settled(read)) return 'loading';
    if (!read.hasValue()) {
      failed = true;
      continue;
    }
    const newest = newestVersion(site, read.value() as Parameters<typeof newestVersion>[1]);
    if (newest?.repository === repo)
      return { site: site.name ?? '', version: newest.version ?? '' };
  }
  return failed ? 'error' : 'none';
}

/** Whether two bundles are the same: the same status, and the same version and manifest read. */
function sameBundle(a: RoutesBundle | undefined, b: RoutesBundle | undefined): boolean {
  if (a?.status !== b?.status) return false;
  if (a?.status !== 'loaded' || b?.status !== 'loaded') return true;
  return a.site === b.site && a.version === b.version && a.manifest === b.manifest;
}

/** Whether two records hold the same bundles (`sameBundle`) for the same repositories. */
function sameBundles(
  a: Readonly<Record<string, RoutesBundle>>,
  b: Readonly<Record<string, RoutesBundle>>,
): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => sameBundle(a[key], b[key]));
}

/** `blob` as a `data:` URL, with its media type; null when it cannot be read. */
export function blobDataUrl(blob: Blob): Promise<string | null> {
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
 * A root service holding `qitsResource`s over `docs.operations.ts` (qits-2146; it was
 * `RoutesBundleStore`).
 *
 * - `load(repo)` finds the site from declared metadata, never from the name (`routesSiteOf`: the
 *   `@routes/` site whose newest version's `git.repository.name` is `repo`; none: `none`), from the
 *   docs sites (`DOCS_SITES`) and each `@routes/` site's versions (`DOCS_VERSIONS`), then reads
 *   that version's `manifest.json` (`DOCS_FILE`). In the browser only (the server render has no
 *   session to send); again after a failure.
 * - `freeze(bundle, file)` reads one freeze's HTML when its tab is shown, and the bundle's
 *   `assets/*` once (`DOCS_VERSION`'s file list, then each file as a blob), as `data:` URLs.
 *   `preview(bundle, file)` answers the HTML with its asset references inlined (`inlineAssets`)
 *   once both are in, else null. A failed asset is left out (the frame falls back to another
 *   font), so it never blocks the preview.
 *
 * Every read carries the bearer (`qitsBearerInterceptor`), which a frame or a `<base href>` at the
 * store never would.
 *
 * Staleness (qits-1270): `SCMRelease` of a repository a page follows (`follow`; `repositoryName`,
 * else `repository`) → the list and every site's versions (each resource's `refreshOn`), so the
 * bundle moves to the new version's manifest, at most once a second. Only a release publishes a new
 * version, and the docs store emits no event of its own. Manifests, freezes and assets are keyed by
 * site and version, and a published version never changes, so nothing makes them stale.
 */
@Injectable({ providedIn: 'root' })
export class RoutesBundles {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);

  /** The repositories whose bundle a page asked for. */
  private readonly repos = signal<ReadonlySet<string>>(new Set());

  /** The repositories the open pages follow (`follow`). */
  private readonly followed = new Set<() => string | undefined>();

  /** A release of a followed repository. */
  private readonly releases: QitsRefreshOn = {
    names: ['SCMRelease'],
    when: (event) => this.released(event),
  };

  /** Every docs site, once a page asked for a bundle. */
  private readonly sites = qitsResource(
    DOCS_SITES,
    () =>
      this.browser && this.repos().size ? { path: { repository: DOCS_REPOSITORY } } : undefined,
    { refreshOn: this.releases },
  );

  /** Each `@routes/` site's versions, by site name. */
  private readonly versions = new ResourceFamily(DOCS_VERSIONS, this.injector, this.releases);

  /** Each bundle's file list, by `bundleKey`. */
  private readonly fileLists = new ResourceFamily(DOCS_VERSION, this.injector);

  /** Each file read (a manifest, a freeze, an asset), by `fileKey`. */
  private readonly files = new ResourceFamily(DOCS_FILE, this.injector);

  /** The bundles a freeze was asked of, whose assets are read, by `bundleKey`. */
  private readonly previewed = signal<ReadonlyMap<string, BundleVersion>>(new Map());

  /** Each asset as a `data:` URL, by `fileKey`; null when it could not be read. */
  private readonly dataUrls = signal<ReadonlyMap<string, string | null>>(new Map());

  /** The assets being turned into `data:` URLs, by `fileKey`. */
  private readonly converting = new Set<string>();

  /** Each manifest checked once, by the answer it was read from. */
  private readonly manifests = new WeakMap<object, RoutesManifest | null>();

  /** The `@routes/` sites the list names. */
  private readonly routesSites = computed((): readonly DocsSite[] =>
    this.sites.hasValue()
      ? (this.sites.value()?.sites ?? []).filter((site) => site.name?.startsWith(ROUTES_SITE))
      : [],
  );

  /** Each asked repository's site, or where finding it stands. */
  private readonly found = computed(() => {
    const found = new Map<string, BundleVersion | 'none' | 'error' | 'loading'>();
    for (const repo of this.repos()) {
      if (!this.sites.hasValue()) {
        found.set(repo, this.sites.status() === 'error' ? 'error' : 'loading');
      } else {
        found.set(
          repo,
          routesSiteOf(repo, this.routesSites(), (site) => this.versions.get(site)),
        );
      }
    }
    return found;
  });

  /**
   * Each asked repository's bundle, by repository name. Equal while no bundle changes, so a page's
   * effect over its bundle runs again only when that bundle moved.
   */
  readonly bundles = computed(
    (): Readonly<Record<string, RoutesBundle>> => {
      const bundles: Record<string, RoutesBundle> = {};
      for (const [repo, site] of this.found()) {
        if (typeof site === 'string') {
          bundles[repo] = { status: site };
          continue;
        }
        const read = this.files.get(fileKey(site, MANIFEST_FILE));
        if (!read || !settled(read)) bundles[repo] = { status: 'loading' };
        else if (!read.hasValue()) bundles[repo] = { status: 'error' };
        else {
          const manifest = this.manifestOf(read.value());
          bundles[repo] = manifest ? { status: 'loaded', ...site, manifest } : { status: 'error' };
        }
      }
      return bundles;
    },
    { equal: sameBundles },
  );

  constructor() {
    // Each routes site's versions, read once the list names it.
    effect(() => {
      const names = this.routesSites().map((site) => site.name ?? '');
      untracked(() => {
        for (const site of names) {
          if (!this.versions.get(site)) {
            this.versions.read(site, { path: { repository: DOCS_REPOSITORY, site } });
          }
        }
      });
    });
    // Each found bundle's manifest.
    effect(() => {
      const sites = [...this.found().values()].filter(
        (site): site is BundleVersion => typeof site === 'object',
      );
      untracked(() => {
        for (const site of sites) {
          if (!this.files.get(fileKey(site, MANIFEST_FILE))) this.readFile(site, MANIFEST_FILE);
        }
      });
    });
    // Each previewed bundle's asset list, then each asset.
    effect(() => {
      for (const bundle of this.previewed().values()) {
        const list = this.fileLists.get(bundleKey(bundle));
        if (!list?.hasValue()) continue;
        const assets = (list.value()?.files ?? []).filter((file) => file.startsWith('assets/'));
        untracked(() => {
          for (const file of assets) {
            if (!this.files.get(fileKey(bundle, file))) this.readFile(bundle, file, AS_BLOB);
          }
        });
      }
    });
    // Each asset read, as a `data:` URL.
    effect(() => {
      for (const bundle of this.previewed().values()) {
        for (const file of this.assetFiles(bundle) ?? []) {
          const key = fileKey(bundle, file);
          const read = this.files.get(key);
          if (!read || !settled(read) || this.converting.has(key)) continue;
          this.converting.add(key);
          const blob: unknown = read.hasValue() ? read.value() : null;
          if (!(blob instanceof Blob)) {
            untracked(() => this.dataUrls.update((urls) => new Map(urls).set(key, null)));
            continue;
          }
          void blobDataUrl(blob).then((url) =>
            this.dataUrls.update((urls) => new Map(urls).set(key, url)),
          );
        }
      }
    });
  }

  /** Reads `repo`'s bundle once, and again after a failure. */
  load(repo: string): void {
    if (!untracked(this.repos).has(repo)) {
      this.repos.update((repos) => new Set(repos).add(repo));
      return;
    }
    if (untracked(this.bundles)[repo]?.status !== 'error') return;
    untracked(() => {
      if (this.sites.status() === 'error') this.sites.reload();
      for (const site of this.routesSites()) {
        const name = site.name ?? '';
        if (this.versions.get(name)?.status() === 'error') {
          this.versions.read(name, { path: { repository: DOCS_REPOSITORY, site: name } });
        }
      }
      const site = this.found().get(repo);
      if (typeof site === 'object') this.readFile(site, MANIFEST_FILE);
    });
  }

  /**
   * Reads the bundle of the repository `repo` names again after its release (see the staleness
   * note), until `destroy` is destroyed.
   */
  follow(repo: () => string | undefined, destroy: DestroyRef): void {
    this.followed.add(repo);
    destroy.onDestroy(() => this.followed.delete(repo));
  }

  /** Starts reading one freeze, unless held, and the bundle's assets, unless held. */
  freeze(bundle: BundleVersion, file: string): void {
    this.readFile(bundle, file, AS_TEXT);
    const key = bundleKey(bundle);
    if (untracked(this.previewed).has(key)) return;
    this.previewed.update((bundles) => new Map(bundles).set(key, bundle));
    this.fileLists.read(key, {
      path: { repository: DOCS_REPOSITORY, site: bundle.site, version: bundle.version },
    });
  }

  /** What is held for one freeze. */
  freezeRead(bundle: BundleVersion, file: string): FreezeRead | undefined {
    const read = this.files.get(fileKey(bundle, file));
    if (!read) return undefined;
    if (!settled(read)) return { status: 'loading' };
    const html: unknown = read.hasValue() ? read.value() : null;
    return typeof html === 'string' ? { status: 'loaded', html } : { status: 'error' };
  }

  /** The freeze's HTML with its assets inlined, once both are read; else null. */
  preview(bundle: BundleVersion, file: string): string | null {
    const read = this.freezeRead(bundle, file);
    const assets = this.assets(bundle);
    if (read?.status !== 'loaded' || assets === 'loading') return null;
    return inlineAssets(read.html, assets);
  }

  /** The bundle's `assets/*` paths; none when its file list failed; undefined until it answered. */
  private assetFiles(bundle: BundleVersion): readonly string[] | undefined {
    const list = this.fileLists.get(bundleKey(bundle));
    if (!list || !settled(list)) return undefined;
    if (!list.hasValue()) return [];
    return (list.value()?.files ?? []).filter((file) => file.startsWith('assets/'));
  }

  /** The bundle's assets as `data:` URLs (keyed by `assets/<file>`), or `loading`. */
  private assets(bundle: BundleVersion): 'loading' | Readonly<Record<string, string>> {
    const files = this.assetFiles(bundle);
    if (!files) return 'loading';
    const urls = this.dataUrls();
    const assets: Record<string, string> = {};
    for (const file of files) {
      const key = fileKey(bundle, file);
      if (!urls.has(key)) return 'loading';
      const url = urls.get(key);
      if (url) assets[file] = url;
    }
    return assets;
  }

  /** Starts reading `file` of the bundle's version (in the form `as` asks for), unless held. */
  private readFile(
    bundle: BundleVersion,
    file: string,
    as?: typeof AS_TEXT | typeof AS_BLOB,
  ): void {
    this.files.read(fileKey(bundle, file), {
      path: { repository: DOCS_REPOSITORY, site: bundle.site, version: bundle.version, path: file },
      ...as,
    });
  }

  /** The answer as a manifest (`asManifest`), checked once per answer. */
  private manifestOf(value: unknown): RoutesManifest | null {
    if (!value || typeof value !== 'object') return asManifest(value);
    let manifest = this.manifests.get(value);
    if (manifest === undefined) {
      manifest = asManifest(value);
      this.manifests.set(value, manifest);
    }
    return manifest;
  }

  /** Whether `event` is a release of a repository a page follows. */
  private released(event: QitsDomainEvent): boolean {
    const released = payloadField(event, 'repositoryName') ?? payloadField(event, 'repository');
    return !!released && [...this.followed].some((repo) => repo() === released);
  }
}
