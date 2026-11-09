import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EVENT_SOURCE, REOPEN_DEBOUNCE_MS, type EventSourceLike } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { literalDocsPaths } from './docs-paths';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
  isArtifactsRecorded,
} from '../../../testing/golden-masters';
import { asEntityMap } from './entity-map';
import { EntityMapStore } from './entity-map.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A catalog with `@routes/qits-landing` and no `@contracts/` site. */
const BUNDLE = 'a published routes bundle';
const SITES_URL = '/artifacts/docs/docs';

/** The frontend whose page follows the store. */
const REPO = 'qits-landing-app';

/** Recorded from qits-1950's qits-artifacts release on; the cases that need it skip until then. */
const RECORDED = isArtifactsRecorded(CONTRACTS, 'getDocsFile');

/** The recorded contracts site's version and where its reads go (`/` and `@` literal). */
function contracts() {
  const { site, version } = masters.operation(CONTRACTS, 'getDocsFile').params;
  const versionsUrl = `${SITES_URL}/${site}`;
  return {
    site,
    version,
    versionsUrl,
    entitiesUrl: `${versionsUrl}/-/${version}/entities.json`,
  };
}

/** A stand-in for the browser's `EventSource`, so a spec can push frames. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  close(): void {
    this.readyState = 2;
  }
  push(name: string, payload: object): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ name, payload: JSON.stringify(payload) }),
      }),
    );
  }
}

/** A `DestroyRef` a spec destroys by hand. */
class ManualDestroy implements DestroyRef {
  private readonly callbacks = new Set<() => void>();
  destroyed = false;
  onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach((callback) => callback());
  }
}

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

describe('EntityMapStore', () => {
  let http: HttpTestingController;
  let sources: FakeSource[];

  beforeEach(() => {
    sources = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideTestPlatformOrigins({}),
        {
          provide: EVENT_SOURCE,
          useValue: () => {
            const source = new FakeSource();
            sources.push(source);
            return source;
          },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(artifactsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('finds no contracts site in a catalog without one', async () => {
    const store = TestBed.inject(EntityMapStore);
    const done = store.load();
    expect(store.catalog()).toEqual({ status: 'loading' });
    await settle();
    http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
    await done;
    // `@routes/qits-landing` is not a contracts site: its versions are not read.
    expect(store.catalog()).toEqual({ status: 'loaded', sites: [], unreadable: [] });
    await store.load();
    http.expectNone(SITES_URL);
  });

  it('reports a failed catalog, and reads again on the next ask', async () => {
    const store = TestBed.inject(EntityMapStore);
    const done = store.load();
    await settle();
    http.expectOne(SITES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.catalog()).toEqual({ status: 'error' });
    void store.load();
    await settle();
    http.expectOne(SITES_URL);
  });

  describe.skipIf(!RECORDED)('with a published entity map', () => {
    async function answerCatalog() {
      const { versionsUrl } = contracts();
      await settle();
      http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
      await settle();
      http.expectOne(versionsUrl).flush(masters.body(CONTRACTS, 'listDocsVersions'));
    }

    it('finds each site’s repository from its newest version’s metadata', async () => {
      const store = TestBed.inject(EntityMapStore);
      const done = store.load();
      await answerCatalog();
      await done;
      const { site, version } = contracts();
      expect(store.catalog()).toEqual({
        status: 'loaded',
        sites: [{ site, version, repository: 'qits-projects-service' }],
        unreadable: [],
      });
    });

    it('names a site whose versions cannot be read', async () => {
      const store = TestBed.inject(EntityMapStore);
      const done = store.load();
      await settle();
      http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
      await settle();
      http.expectOne(contracts().versionsUrl).flush(null, { status: 500, statusText: 'Error' });
      await done;
      expect(store.catalog()).toEqual({
        status: 'loaded',
        sites: [],
        unreadable: [contracts().site],
      });
    });

    it('reads a site’s entity map once', async () => {
      const store = TestBed.inject(EntityMapStore);
      const { site, version, entitiesUrl } = contracts();
      const at = { site, version, repository: 'qits-projects-service' };
      store.readMap(at);
      expect(store.mapRead(at)).toEqual({ status: 'loading' });
      await settle();
      const read = http.expectOne(entitiesUrl);
      expect(read.request.responseType).toBe('json');
      read.flush(masters.body(CONTRACTS, 'getDocsFile'));
      for (let i = 0; i < 10 && store.mapRead(at)?.status === 'loading'; i++) await settle();
      expect(store.mapRead(at)).toEqual({
        status: 'loaded',
        map: asEntityMap(masters.body(CONTRACTS, 'getDocsFile')),
      });
      store.readMap(at);
      await settle();
      http.expectNone(entitiesUrl);
    });

    it('takes a missing entities.json as no map published, and another failure as an error', async () => {
      const store = TestBed.inject(EntityMapStore);
      const { site, version, entitiesUrl } = contracts();
      const missing = { site, version, repository: 'qits-projects-service' };
      const failing = { site, version: `${version}.1`, repository: 'qits-projects-service' };
      store.readMap(missing);
      store.readMap(failing);
      await settle();
      http.expectOne(entitiesUrl).flush(null, { status: 404, statusText: 'Not Found' });
      http
        .expectOne(entitiesUrl.replace(`/-/${version}/`, `/-/${version}.1/`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      for (let i = 0; i < 10; i++) await settle();
      expect(store.mapRead(missing)).toEqual({ status: 'none' });
      expect(store.mapRead(failing)).toEqual({ status: 'error' });
    });
  });

  describe('follow', () => {
    /** The catalog of `state`: `@contracts/qits-projects` when recorded, else none. */
    async function answerCatalog(state: string) {
      await settle();
      http.expectOne(SITES_URL).flush(masters.body(state, 'listDocsSites'));
      if (state === CONTRACTS) {
        await settle();
        http.expectOne(contracts().versionsUrl).flush(masters.body(CONTRACTS, 'listDocsVersions'));
      }
    }

    async function followed(state = BUNDLE, destroy = new ManualDestroy()) {
      const store = TestBed.inject(EntityMapStore);
      const loaded = store.load();
      await answerCatalog(state);
      await loaded;
      vi.useFakeTimers();
      store.follow(() => REPO, destroy);
      vi.advanceTimersByTime(REOPEN_DEBOUNCE_MS);
      return { store, source: sources.at(-1)!, destroy };
    }

    afterEach(() => vi.useRealTimers());

    async function after() {
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
    }

    it('reads the catalog again after a release of the frontend', async () => {
      const { store, source } = await followed();
      source.push('SCMRelease', { repository: REPO, repositoryName: REPO, version: '2' });
      await after();
      await answerCatalog(BUNDLE);
      await settle();
      expect(store.catalog()?.status).toBe('loaded');
    });

    it.skipIf(!RECORDED)(
      'reads the catalog again after a release of a service a site names',
      async () => {
        const { source } = await followed(CONTRACTS);
        source.push('SCMRelease', { repositoryName: 'qits-projects-service', version: '2' });
        await after();
        await answerCatalog(CONTRACTS);
      },
    );

    it('ignores a release of another repository', async () => {
      const { source } = await followed();
      source.push('SCMRelease', { repositoryName: 'qits-ci-service' });
      await after();
      http.expectNone(SITES_URL);
    });

    it('stops when its page is destroyed', async () => {
      const { source, destroy } = await followed();
      destroy.destroy();
      source.push('SCMRelease', { repositoryName: REPO });
      await after();
      http.expectNone(SITES_URL);
    });
  });
});
