import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/githost/client/client.gen';
import { client as githostClient } from '../../api/githost/client.gen';
import { githostGoldenMaster, githostGoldenMasters } from '../../../testing/golden-masters';
import { LocStore, RECOUNT_AFTER_MS } from './loc.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const COUNTED = 'a repository with counted lines';
const PENDING = 'a repository not counted yet';
const EMPTY = 'a repository with no commit';
const MIXED = 'two repositories, one counted';

/** The counted recording's languages, summed: Java 3/2 and TypeScript 4/1 tie on 5, by name. */
const COUNTED_LANGUAGES = [
  { language: 'Java', main: 3, test: 2 },
  { language: 'TypeScript', main: 4, test: 1 },
  { language: 'Markdown', main: 1, test: 0 },
];

/** An id qits-githost's golden masters do not hold. */
const OTHER_ID = '00000000-0000-4000-8000-0000000000ff';

/** The state's frozen repository id, by param name. */
const param = (state: string, name = 'repositoryId') =>
  githostGoldenMasters.operation(state, 'listLoc').params[name];

describe('LocStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(githostClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  /** A store whose one load is answered with qits-githost's golden master for `state`. */
  async function loadedWith(state: string) {
    const store = TestBed.inject(LocStore);
    await settle();
    http.expectOne('/githost/api/loc').flush(githostGoldenMaster(state, 'listLoc'));
    await settle();
    return store;
  }

  it('sums a counted repository: Java 3/2, TypeScript 4/1, Markdown 1/0', async () => {
    const store = await loadedWith(COUNTED);
    expect(store.status()).toBe('loaded');
    expect(store.totals([param(COUNTED)])).toEqual({
      main: 8,
      test: 3,
      partial: false,
      languages: COUNTED_LANGUAGES,
    });
  });

  it('marks a repository not counted yet as partial, and asks once more later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const store = TestBed.inject(LocStore);
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/githost/api/loc').flush(githostGoldenMaster(PENDING, 'listLoc'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.totals([param(PENDING)])).toEqual({
      main: 0,
      test: 0,
      partial: true,
      languages: [],
    });

    await vi.advanceTimersByTimeAsync(RECOUNT_AFTER_MS);
    // Counted by now: the second answer is the counted state's recording under the same id.
    const counted = githostGoldenMaster(COUNTED, 'listLoc');
    http.expectOne('/githost/api/loc').flush(counted);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.totals([param(COUNTED)])).toEqual({
      main: 8,
      test: 3,
      partial: false,
      languages: COUNTED_LANGUAGES,
    });

    // It asks once more, never again.
    await vi.advanceTimersByTimeAsync(RECOUNT_AFTER_MS * 2);
    http.expectNone('/githost/api/loc');
  });

  it('adds nothing for a repository without a commit', async () => {
    const store = await loadedWith(EMPTY);
    expect(store.totals([param(EMPTY)])).toEqual({
      main: 0,
      test: 0,
      partial: false,
      languages: [],
    });
  });

  it('sums a mixed list as a partial total', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const store = TestBed.inject(LocStore);
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/githost/api/loc').flush(githostGoldenMaster(MIXED, 'listLoc'));
    await vi.advanceTimersByTimeAsync(0);
    const counted = param(MIXED, 'countedRepositoryId');
    const pending = param(MIXED, 'pendingRepositoryId');
    expect(store.totals([counted, pending])).toEqual({
      main: 8,
      test: 3,
      partial: true,
      languages: COUNTED_LANGUAGES,
    });
    expect(store.totals([counted])).toEqual({
      main: 8,
      test: 3,
      partial: false,
      languages: COUNTED_LANGUAGES,
    });
  });

  it('adds nothing for a repository qits-githost does not hold', async () => {
    const store = await loadedWith(COUNTED);
    expect(store.totals([OTHER_ID])).toEqual({
      main: 0,
      test: 0,
      partial: false,
      languages: [],
    });
  });

  it('sums each language over several repositories, largest first', async () => {
    // Derived from the counted recording: the same entry once more under a second id, so every
    // language counts twice. qits-githost records no state with two counted repositories.
    const store = TestBed.inject(LocStore);
    await settle();
    const body = githostGoldenMaster(COUNTED, 'listLoc');
    const second = { ...structuredClone(body.entries[0]), repositoryId: OTHER_ID };
    http.expectOne('/githost/api/loc').flush({ ...body, entries: [...body.entries, second] });
    await settle();
    expect(store.totals([param(COUNTED), OTHER_ID])).toEqual({
      main: 16,
      test: 6,
      partial: false,
      languages: COUNTED_LANGUAGES.map((l) => ({ ...l, main: l.main * 2, test: l.test * 2 })),
    });
  });

  it('reports a failed list', async () => {
    const store = TestBed.inject(LocStore);
    await settle();
    http.expectOne('/githost/api/loc').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(store.status()).toBe('error');
    expect(store.totals([param(COUNTED)])).toBeUndefined();
  });
});
