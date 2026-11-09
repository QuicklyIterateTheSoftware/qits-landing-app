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
import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import { RoutesBundleStore } from './routes-bundle.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const BUNDLE = 'a published routes bundle';
const FREEZE = 'a published routes bundle freeze';
const FONT = 'a published routes bundle font';

/** The repository the recorded bundle's newest version names. */
const REPO = 'qits-landing-app';
const { site: SITE, version: VERSION } = masters.operation(BUNDLE, 'getDocsFile').params;
const FREEZE_FILE = masters.operation(FREEZE, 'getDocsFile').params['path'];
const FONT_FILE = masters.operation(FONT, 'getDocsFile').params['path'];

/** Where the store reads: the site and the file path with `/` and `@` literal, `[`/`]` encoded. */
const SITES_URL = '/artifacts/docs/docs';
const VERSIONS_URL = `/artifacts/docs/docs/${SITE}`;
const VERSION_URL = `${VERSIONS_URL}/-/${VERSION}`;
const fileUrl = (file: string) =>
  `${VERSION_URL}/${file.split('/').map(encodeURIComponent).join('/')}`;

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

describe('RoutesBundleStore', () => {
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

  /** Answers the reads `load(REPO)` makes for the recorded bundle. */
  async function answerBundle() {
    await settle();
    http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
    await settle();
    http.expectOne(VERSIONS_URL).flush(masters.body(BUNDLE, 'listDocsVersions'));
    await settle();
    const manifest = http.expectOne(fileUrl('manifest.json'));
    expect(manifest.request.responseType).toBe('json');
    manifest.flush(masters.body(BUNDLE, 'getDocsFile'));
  }

  it('finds the site by its newest version’s metadata and reads its manifest', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const done = store.load(REPO);
    expect(store.bundles()[REPO]).toEqual({ status: 'loading' });
    await answerBundle();
    await done;
    expect(store.bundles()[REPO]).toEqual({
      status: 'loaded',
      site: SITE,
      version: VERSION,
      manifest: masters.body(BUNDLE, 'getDocsFile'),
    });
    await store.load(REPO);
    http.expectNone(SITES_URL);
  });

  it('finds nothing when no @routes/ site is published', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const done = store.load(REPO);
    await settle();
    http.expectOne(SITES_URL).flush(masters.body('a published docs site', 'listDocsSites'));
    await done;
    expect(store.bundles()[REPO]).toEqual({ status: 'none' });
  });

  it('finds nothing when the newest version names another repository', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const done = store.load('contract-frontend');
    await settle();
    http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
    await settle();
    http.expectOne(VERSIONS_URL).flush(masters.body(BUNDLE, 'listDocsVersions'));
    await done;
    expect(store.bundles()['contract-frontend']).toEqual({ status: 'none' });
  });

  it('reports a failed catalog, and reads again on the next ask', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const done = store.load(REPO);
    await settle();
    http.expectOne(SITES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.bundles()[REPO]).toEqual({ status: 'error' });
    void store.load(REPO);
    await settle();
    http.expectOne(SITES_URL);
  });

  it('reports a manifest without the manifest’s shape as an error', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const done = store.load(REPO);
    await settle();
    http.expectOne(SITES_URL).flush(masters.body(BUNDLE, 'listDocsSites'));
    await settle();
    http.expectOne(VERSIONS_URL).flush(masters.body(BUNDLE, 'listDocsVersions'));
    await settle();
    // Another recorded JSON answer in the manifest's place: the version list has no `routes`.
    http.expectOne(fileUrl('manifest.json')).flush(masters.body(BUNDLE, 'listDocsVersions'));
    await done;
    expect(store.bundles()[REPO]).toEqual({ status: 'error' });
  });

  it('reads a freeze and the bundle’s assets once, and inlines the font', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const bundle = { site: SITE, version: VERSION };
    store.freeze(bundle, FREEZE_FILE);
    expect(store.freezeRead(bundle, FREEZE_FILE)).toEqual({ status: 'loading' });
    await settle();
    const freeze = http.expectOne(fileUrl(FREEZE_FILE));
    expect(freeze.request.url).toContain('/%5Bslug%5D/');
    expect(freeze.request.responseType).toBe('text');
    // The freeze is recorded without a body. A freeze names its font relative to itself, as here.
    freeze.flush('<style>@font-face{src:url("../../assets/inter-latin-400-normal.woff2")}</style>');
    http.expectOne(VERSION_URL).flush(masters.body(BUNDLE, 'getDocsVersion'));
    await settle();
    const font = http.expectOne(fileUrl(FONT_FILE));
    expect(font.request.responseType).toBe('blob');
    // The font is recorded without a body: any bytes of its media type stand in for it.
    font.flush(new Blob([new Uint8Array([119, 79, 70, 50])], { type: 'font/woff2' }));
    for (let i = 0; i < 20 && store.preview(bundle, FREEZE_FILE) === null; i++) await settle();
    expect(store.preview(bundle, FREEZE_FILE)).toBe(
      '<style>@font-face{src:url("data:font/woff2;base64,d09GMg==")}</style>',
    );

    // Held: neither the freeze nor the assets are read again.
    store.freeze(bundle, FREEZE_FILE);
    await settle();
    http.expectNone(() => true);
  });

  it('shows a freeze without its assets when they cannot be read', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const bundle = { site: SITE, version: VERSION };
    store.freeze(bundle, FREEZE_FILE);
    await settle();
    http.expectOne(fileUrl(FREEZE_FILE)).flush('<p>frozen</p>');
    http.expectOne(VERSION_URL).flush(null, { status: 500, statusText: 'Server Error' });
    for (let i = 0; i < 20 && store.preview(bundle, FREEZE_FILE) === null; i++) await settle();
    expect(store.preview(bundle, FREEZE_FILE)).toBe('<p>frozen</p>');
  });

  it('reports a freeze that cannot be read', async () => {
    const store = TestBed.inject(RoutesBundleStore);
    const bundle = { site: SITE, version: VERSION };
    store.freeze(bundle, FREEZE_FILE);
    await settle();
    http.expectOne(fileUrl(FREEZE_FILE)).flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne(VERSION_URL).flush(masters.body(BUNDLE, 'getDocsVersion'));
    await settle();
    http.expectOne(fileUrl(FONT_FILE)).flush(null, { status: 404, statusText: 'Not Found' });
    for (let i = 0; i < 20 && store.freezeRead(bundle, FREEZE_FILE)?.status === 'loading'; i++) {
      await settle();
    }
    expect(store.freezeRead(bundle, FREEZE_FILE)).toEqual({ status: 'error' });
    expect(store.preview(bundle, FREEZE_FILE)).toBeNull();
  });

  describe('follow', () => {
    async function followed(destroy = new ManualDestroy()) {
      const store = TestBed.inject(RoutesBundleStore);
      const loaded = store.load(REPO);
      await answerBundle();
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

    it('reads the bundle again after a release of the repository', async () => {
      const { store, source } = await followed();
      source.push('SCMRelease', { repository: REPO, repositoryName: REPO, version: '2' });
      await after();
      await answerBundle();
      await settle();
      expect(store.bundles()[REPO]?.status).toBe('loaded');
    });

    it('ignores a release of another repository', async () => {
      const { source } = await followed();
      source.push('SCMRelease', {
        repository: 'qits-ci-service',
        repositoryName: 'qits-ci-service',
      });
      await after();
      http.expectNone(SITES_URL);
    });

    it('stops when its page is destroyed', async () => {
      const { source, destroy } = await followed();
      destroy.destroy();
      source.push('SCMRelease', { repository: REPO, repositoryName: REPO });
      await after();
      http.expectNone(SITES_URL);
    });
  });
});
