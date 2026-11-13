import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import {
  DomainEvents,
  EVENT_SOURCE,
  REOPEN_DEBOUNCE_MS,
  type EventSourceLike,
} from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { provideTestPlatformOrigins } from '../../../testing/platform-origins';
import { provideHeyApiClient } from '../../api/artifacts/client/client.gen';
import { client as artifactsClient } from '../../api/artifacts/client.gen';
import { literalDocsPaths } from './docs-paths';
import {
  artifactsGoldenMasters as masters,
  ENTITY_MAP_STATE as CONTRACTS,
} from '../../../testing/golden-masters';
import { asEntityMap } from './entity-map';
import { ContractsCatalog } from './contracts-catalog';

/** The generated client builds its request after a few awaits; let them run, and the effects. */
const settle = () => new Promise((resolve) => setTimeout(resolve));
async function tick() {
  TestBed.tick();
  await settle();
  TestBed.tick();
  await settle();
}

/** A catalog with `@routes/qits-landing` and no `@contracts/` site. */
const BUNDLE = 'a published routes bundle';
const SITES_URL = '/artifacts/docs/docs';

/** The frontend whose page follows the catalog. */
const REPO = 'qits-landing-app';

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

describe('ContractsCatalog', () => {
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
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('finds no contracts site in a catalog without one', async () => {
    const store = TestBed.inject(ContractsCatalog);
    store.load();
    expect(store.catalog()).toEqual({ status: 'loading' });
    await tick();
    http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
    await tick();
    // `@routes/qits-landing` is not a contracts site: its versions are not read.
    expect(store.catalog()).toEqual({ status: 'loaded', sites: [], unreadable: [] });
    store.load();
    await tick();
    http.expectNone(SITES_URL);
  });

  it('reports a failed catalog, and reads again on the next ask', async () => {
    const store = TestBed.inject(ContractsCatalog);
    store.load();
    await tick();
    http.expectOne(SITES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await tick();
    expect(store.catalog()).toEqual({ status: 'error' });
    store.load();
    await tick();
    http.expectOne(SITES_URL);
  });

  describe('with a published entity map', () => {
    async function answerCatalog() {
      const { versionsUrl } = contracts();
      await tick();
      http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
      await tick();
      http.expectOne(versionsUrl).flush(masters.body(CONTRACTS, 'listDocsVersions'));
      await tick();
    }

    it('finds each site’s repository from its newest version’s metadata', async () => {
      const store = TestBed.inject(ContractsCatalog);
      store.load();
      await answerCatalog();
      const { site, version } = contracts();
      expect(store.catalog()).toEqual({
        status: 'loaded',
        sites: [{ site, version, repository: 'qits-projects-service' }],
        unreadable: [],
      });
    });

    it('names a site whose versions cannot be read', async () => {
      const store = TestBed.inject(ContractsCatalog);
      store.load();
      await tick();
      http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
      await tick();
      http.expectOne(contracts().versionsUrl).flush(null, { status: 500, statusText: 'Error' });
      await tick();
      expect(store.catalog()).toEqual({
        status: 'loaded',
        sites: [],
        unreadable: [contracts().site],
      });
    });

    it('reads a site’s entity map once', async () => {
      const store = TestBed.inject(ContractsCatalog);
      const { site, version, entitiesUrl } = contracts();
      const at = { site, version, repository: 'qits-projects-service' };
      store.readMap(at);
      expect(store.mapRead(at)).toEqual({ status: 'loading' });
      await tick();
      const read = http.expectOne(entitiesUrl);
      expect(read.request.responseType).toBe('json');
      read.flush(masters.body(CONTRACTS, 'getDocsFile'));
      for (let i = 0; i < 10 && store.mapRead(at)?.status === 'loading'; i++) await tick();
      expect(store.mapRead(at)).toEqual({
        status: 'loaded',
        map: asEntityMap(masters.body(CONTRACTS, 'getDocsFile')),
      });
      store.readMap(at);
      await tick();
      http.expectNone(entitiesUrl);
    });

    it('takes a missing entities.json as no map published, and another failure as an error', async () => {
      const store = TestBed.inject(ContractsCatalog);
      const { site, version, entitiesUrl } = contracts();
      const missing = { site, version, repository: 'qits-projects-service' };
      const failing = { site, version: `${version}.1`, repository: 'qits-projects-service' };
      store.readMap(missing);
      store.readMap(failing);
      await tick();
      http.expectOne(entitiesUrl).flush(null, { status: 404, statusText: 'Not Found' });
      http
        .expectOne(entitiesUrl.replace(`/-/${version}/`, `/-/${version}.1/`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      for (let i = 0; i < 10; i++) await tick();
      expect(store.mapRead(missing)).toEqual({ status: 'none' });
      expect(store.mapRead(failing)).toEqual({ status: 'error' });
    });
  });

  describe('follow', () => {
    /** The catalog of `state`: `@contracts/qits-projects` when recorded, else none. */
    async function answerCatalog(state: string) {
      await tick();
      http.expectOne(SITES_URL).flush(masters.body(state, 'listDocsSites'));
      await tick();
      if (state === CONTRACTS) {
        http.expectOne(contracts().versionsUrl).flush(masters.body(CONTRACTS, 'listDocsVersions'));
        await tick();
      }
    }

    async function followed(state = BUNDLE, destroy = new ManualDestroy()) {
      const store = TestBed.inject(ContractsCatalog);
      store.load();
      await answerCatalog(state);
      store.follow(() => REPO, destroy);
      // The resources' `refreshOn` subscribed as they were made: the stream opens once it settles.
      await new Promise((resolve) => setTimeout(resolve, REOPEN_DEBOUNCE_MS + 50));
      vi.useFakeTimers();
      return { store, source: sources.at(-1)!, destroy };
    }

    afterEach(() => vi.useRealTimers());

    async function after() {
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await tick();
    }

    it('reads the catalog again after a release of the frontend', async () => {
      const { store, source } = await followed();
      source.push('SCMRelease', { repository: REPO, repositoryName: REPO, version: '2' });
      await after();
      http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
      await tick();
      expect(store.catalog()?.status).toBe('loaded');
    });

    it('reads the catalog again after a release of a service a site names', async () => {
      const { source } = await followed(CONTRACTS);
      source.push('SCMRelease', { repositoryName: 'qits-projects-service', version: '2' });
      await after();
      // The list and the site's versions, each its own resource, read again.
      http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
      http.expectOne(contracts().versionsUrl).flush(masters.body(CONTRACTS, 'listDocsVersions'));
      await tick();
    });

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
