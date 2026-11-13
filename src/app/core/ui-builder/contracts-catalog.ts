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
import { isMissing, ResourceFamily } from '$core/resources/resource-family';
import { DOCS_REPOSITORY, newestVersion, type DocsSite } from './docs.consumes';
import { DOCS_FILE, DOCS_SITES, DOCS_VERSIONS } from './docs.operations';
import { asEntityMap, type EntityMap } from './entity-map';

/** The prefix of a service's contracts site (qits-1945). */
const CONTRACTS_SITE = '@contracts/';

/** The entity map's file in a contracts site's version. */
const ENTITIES_FILE = 'entities.json';

/** A `@contracts/` site's newest version, with the repository that version names. */
export interface ContractsSite {
  readonly site: string;
  readonly version: string;
  /** The version's `git.repository.name` (`qits-projects-service`). */
  readonly repository: string;
}

/** Every `@contracts/` site, as the catalog found them. */
export interface ContractsSites {
  /** The sites whose newest version names a repository. */
  readonly sites: readonly ContractsSite[];
  /** The sites whose versions could not be read, so which repository they name is unknown. */
  readonly unreadable: readonly string[];
}

/** The catalog of contracts sites. */
export type CatalogRead =
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

/** Whether two catalog reads say the same: the same status, sites and unreadable sites. */
function sameCatalog(a: CatalogRead | null, b: CatalogRead | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.status !== b.status) return false;
  if (a.status !== 'loaded' || b.status !== 'loaded') return true;
  const site = (s: ContractsSite) => `${s.site}@${s.version}:${s.repository}`;
  return (
    a.sites.map(site).join('\n') === b.sites.map(site).join('\n') &&
    a.unreadable.join('\n') === b.unreadable.join('\n')
  );
}

const mapKey = ({ site, version }: { site: string; version: string }) => `${site}@${version}`;

/**
 * The `@contracts/` site `site` is, with its newest version and the repository that version names
 * (`newestVersion`); `unnamed` when that version names none.
 */
export function contractsSiteOf(
  site: DocsSite,
  versions: Parameters<typeof newestVersion>[1],
): ContractsSite | 'unnamed' {
  const newest = newestVersion(site, versions);
  return newest?.repository && newest.version
    ? { site: site.name ?? '', version: newest.version, repository: newest.repository }
    : 'unnamed';
}

/**
 * The services' contracts sites and entity maps (qits-1950, qits-1994), from qits-artifacts' docs
 * store, where every release of a service that declares `contracts.entities` publishes
 * `entities.json` in `@contracts/<application>` (qits-1945). A root service holding `qitsResource`s
 * over `docs.operations.ts` (qits-2146; it was `EntityMapStore`), shared by the UI builder and a
 * repository's contracts and entities pages.
 *
 * - `load()` lists the docs sites (`DOCS_SITES`) and reads each `@contracts/` site's versions
 *   (`DOCS_VERSIONS`, one resource per site), to learn which repository its newest version names
 *   (`contractsSiteOf`): found from declared metadata, never from the name. `catalog()` is loading
 *   until every site's versions answered; a site whose versions failed is `unreadable`. In the
 *   browser only (the server render has no session to send); again after a failed list.
 * - `readMap(site)` reads that version's `entities.json` (`DOCS_FILE`), once per version. A 404 is
 *   `none` (no entity map published), any other failure `error`, for that site alone, read again
 *   on the next `readMap`.
 *
 * The catalog is this service's own, not shared with `RoutesBundles`: each stays one read path, at
 * the cost of one more `listDocsSites`.
 *
 * Staleness (qits-1270): `SCMRelease` of a frontend a page follows (`follow`'s `repo`) or of a
 * repository a contracts site names → the list and every site's versions (each resource's
 * `refreshOn`), at most once a second. Only a release publishes a new version, and the docs store
 * emits no event of its own. Maps are keyed by site and version, and a published version never
 * changes, so nothing makes them stale.
 */
@Injectable({ providedIn: 'root' })
export class ContractsCatalog {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);

  /** Whether a page asked for the catalog yet: the list waits for it. */
  private readonly wanted = signal(false);

  /** The repositories the open pages follow (`follow`). */
  private readonly followed = new Set<() => string | undefined>();

  /** A release of a followed repository, or of one a contracts site names. */
  private readonly releases: QitsRefreshOn = {
    names: ['SCMRelease'],
    when: (event) => this.released(event),
  };

  /** Every docs site, once a page asked. */
  readonly sites = qitsResource(
    DOCS_SITES,
    () => (this.browser && this.wanted() ? { path: { repository: DOCS_REPOSITORY } } : undefined),
    { refreshOn: this.releases },
  );

  /** Each `@contracts/` site's versions, by site name. */
  private readonly versions = new ResourceFamily(DOCS_VERSIONS, this.injector, this.releases);

  /** Each version's `entities.json`, by `mapKey`. */
  private readonly maps = new ResourceFamily(DOCS_FILE, this.injector);

  /** The `@contracts/` sites the list names. */
  private readonly contractsSites = computed((): readonly DocsSite[] =>
    this.sites.hasValue()
      ? (this.sites.value()?.sites ?? []).filter((site) => site.name?.startsWith(CONTRACTS_SITE))
      : [],
  );

  /**
   * The catalog; null until a page asked for it. Equal while no site changes, so a page's effect
   * over it runs again only when the catalog moved.
   */
  readonly catalog = computed(
    (): CatalogRead | null => {
      if (!this.wanted()) return null;
      if (!this.sites.hasValue()) {
        return this.sites.status() === 'error' ? { status: 'error' } : { status: 'loading' };
      }
      const sites: ContractsSite[] = [];
      const unreadable: string[] = [];
      for (const site of this.contractsSites()) {
        const name = site.name ?? '';
        const read = this.versions.get(name);
        if (!read || (!read.hasValue() && read.status() !== 'error')) return { status: 'loading' };
        if (!read.hasValue()) {
          unreadable.push(name);
          continue;
        }
        const found = contractsSiteOf(site, read.value());
        if (found !== 'unnamed') sites.push(found);
      }
      return { status: 'loaded', sites, unreadable };
    },
    { equal: sameCatalog },
  );

  /** Each entity map checked once, by the answer it was read from. */
  private readonly checked = new WeakMap<object, EntityMap | null>();

  constructor() {
    // Each contracts site's versions, read once the list names it.
    effect(() => {
      const names = this.contractsSites().map((site) => site.name ?? '');
      untracked(() => {
        for (const site of names) {
          if (!this.versions.get(site)) {
            this.versions.read(site, { path: { repository: DOCS_REPOSITORY, site } });
          }
        }
      });
    });
  }

  /** Reads the catalog once, and again after a failed list. */
  load(): void {
    if (!untracked(this.wanted)) this.wanted.set(true);
    else if (untracked(() => this.sites.status() === 'error')) this.sites.reload();
  }

  /**
   * Reads the catalog again after a release of the frontend `repo` names, or of a repository a
   * contracts site names (see the staleness note), until `destroy` is destroyed.
   */
  follow(repo: () => string | undefined, destroy: DestroyRef): void {
    this.followed.add(repo);
    destroy.onDestroy(() => this.followed.delete(repo));
  }

  /** Starts reading one site's map, unless held (again after an error). */
  readMap(site: ContractsSite): void {
    this.maps.read(mapKey(site), {
      path: {
        repository: DOCS_REPOSITORY,
        site: site.site,
        version: site.version,
        path: ENTITIES_FILE,
      },
    });
  }

  /** What is held for one site's map. */
  mapRead(site: ContractsSite): EntityMapRead | undefined {
    const read = this.maps.get(mapKey(site));
    if (!read) return undefined;
    if (read.hasValue()) {
      const map = this.mapOf(read.value());
      return map ? { status: 'loaded', map } : { status: 'error' };
    }
    if (read.status() === 'error')
      return isMissing(read) ? { status: 'none' } : { status: 'error' };
    return { status: 'loading' };
  }

  /** The answer as an entity map (`asEntityMap`), checked once. */
  private mapOf(value: unknown): EntityMap | null {
    if (!value || typeof value !== 'object') return asEntityMap(value);
    let map = this.checked.get(value);
    if (map === undefined) {
      map = asEntityMap(value);
      this.checked.set(value, map);
    }
    return map;
  }

  /** Whether `event` is a release the catalog reads again after (see the staleness note). */
  private released(event: QitsDomainEvent): boolean {
    const released = payloadField(event, 'repositoryName') ?? payloadField(event, 'repository');
    if (!released || !this.wanted()) return false;
    if ([...this.followed].some((repo) => repo() === released)) return true;
    const catalog = this.catalog();
    return catalog?.status === 'loaded' && catalog.sites.some((s) => s.repository === released);
  }
}
