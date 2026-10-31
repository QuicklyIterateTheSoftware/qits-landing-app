import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/githost/client/client.gen';
import { client as githostClient } from '../../api/githost/client.gen';
import { githostGoldenMasters } from '../../../testing/golden-masters';
import { rawImageKey, RawImagesStore } from './raw-images.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** qits-githost's image state: a 1x1 PNG at `docs/screenshot.png`, its bytes base64 in `body`. */
const { params } = githostGoldenMasters.operation('a repository with an image on main', 'getRaw');
const REPO = params['repositoryId'];
const SHA = params['sha'];
const PATH = params['path'];
const PNG = new Blob([Uint8Array.from(atob(params['body']), (c) => c.charCodeAt(0))], {
  type: 'image/png',
});

/** A JSON error body, as the client hands it over: as a Blob, because the call asks for one. */
const errorBody = (body: object) => new Blob([JSON.stringify(body)], { type: 'application/json' });

describe('RawImagesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof RawImagesStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(RawImagesStore);
  });

  afterEach(() => http.verify());

  /** The one raw read in flight, checked for its address and its Blob response type. */
  async function pending() {
    await settle();
    const request = http.expectOne((req) =>
      req.urlWithParams.startsWith(`/githost/api/repositories/${REPO}/raw?`),
    );
    const query = new URL(request.request.urlWithParams, 'http://githost').searchParams;
    expect(query.get('rev')).toBe(SHA);
    expect(query.get('path')).toBe(PATH);
    expect(request.request.responseType).toBe('blob');
    return request;
  }

  async function answered(key: string) {
    for (let i = 0; i < 10 && store.read(key)?.status === 'loading'; i++) await settle();
    return store.read(key);
  }

  it('reads an image once per repository, commit and path, keyed by them', async () => {
    const key = store.image(REPO, SHA, PATH);
    expect(key).toBe(`${REPO}@${SHA}#${PATH}`);
    expect(rawImageKey(REPO, SHA, PATH)).toBe(key);
    expect(store.read(key)).toEqual({ status: 'loading' });
    (await pending()).flush(PNG);
    expect(await answered(key)).toEqual({ status: 'loaded', blob: PNG });

    store.image(REPO, SHA, PATH);
    await settle();
    http.expectNone(() => true);
  });

  it('says a blob past the size cap is too large, with its size', async () => {
    const key = store.image(REPO, SHA, PATH);
    (await pending()).flush(errorBody({ error: 'too-large', size: 17825792 }), {
      status: 413,
      statusText: 'Content Too Large',
    });
    expect(await answered(key)).toEqual({ status: 'error', reason: 'too-large', size: 17825792 });
  });

  it('says a 404 is missing, and anything else failed', async () => {
    const key = store.image(REPO, SHA, PATH);
    (await pending()).flush(errorBody({ error: 'no-such-path' }), {
      status: 404,
      statusText: 'Not Found',
    });
    expect(await answered(key)).toEqual({ status: 'error', reason: 'missing' });

    // A failed read is read again when asked again.
    store.image(REPO, SHA, PATH);
    (await pending()).flush(null, { status: 500, statusText: 'Server Error' });
    expect(await answered(key)).toEqual({ status: 'error', reason: 'failed' });
  });

  it('draws a side with nothing to read as missing, and a held read as its side', async () => {
    expect(store.side(null)).toEqual({
      status: 'error',
      message: 'The image is not in the repository at this revision.',
    });
    store.image(REPO, SHA, PATH);
    (await pending()).flush(PNG);
    await answered(rawImageKey(REPO, SHA, PATH));
    expect(store.side({ repoId: REPO, rev: SHA, path: PATH })).toEqual({
      status: 'loaded',
      blob: PNG,
    });
  });
});
