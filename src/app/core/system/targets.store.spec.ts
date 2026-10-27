import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as systemClient } from '../../api/system/client.gen';
import { provideHeyApiClient } from '../../api/system/client/client.gen';
import { systemGoldenMaster } from '../../../testing/golden-masters';
import { TargetsStore } from './targets.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('TargetsStore', () => {
  let http: HttpTestingController;
  const LIST = '/system/api/targets';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(systemClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads once, and refreshes only once loaded', async () => {
    const store = TestBed.inject(TargetsStore);
    void store.refresh();
    await settle();
    http.expectNone(LIST);
    const loading = store.load();
    await settle();
    http.expectOne(LIST).flush(systemGoldenMaster('a declared target', 'listTargets'));
    await loading;
    expect(store.status()).toBe('loaded');
    void store.load();
    await settle();
    http.expectNone(LIST);
  });

  it('is an error when the read is refused, and keeps the last list when a refresh fails', async () => {
    const store = TestBed.inject(TargetsStore);
    let loading = store.load();
    await settle();
    http.expectOne(LIST).flush(null, { status: 403, statusText: 'Forbidden' });
    await loading;
    expect(store.status()).toBe('error');

    loading = store.load();
    await settle();
    http.expectOne(LIST).flush(systemGoldenMaster('a declared target', 'listTargets'));
    await loading;
    const refreshing = store.refresh();
    await settle();
    http.expectOne(LIST).flush(null, { status: 500, statusText: 'Server Error' });
    await refreshing;
    expect(store.status()).toBe('loaded');
    expect(store.targets()).toHaveLength(1);
  });
});
