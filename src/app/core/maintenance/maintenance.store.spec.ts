import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as maintenanceClient } from '../../api/maintenance/client.gen';
import { provideHeyApiClient } from '../../api/maintenance/client/client.gen';
import { maintenanceGoldenMaster } from '../../../testing/golden-masters';
import { PENDING_BUMPS } from './maintenance.consumes';
import { MaintenanceStore } from './maintenance.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('MaintenanceStore', () => {
  let http: HttpTestingController;
  const LIST = `/maintenance/api/bumps/pending?limit=${PENDING_BUMPS}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(maintenanceClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(state: string) {
    const store = TestBed.inject(MaintenanceStore);
    const loading = store.load();
    await settle();
    http.expectOne(LIST).flush(maintenanceGoldenMaster(state, 'listPendingBumps'));
    await loading;
    return store;
  }

  it('requests nothing until asked', async () => {
    TestBed.inject(MaintenanceStore);
    await settle();
    http.expectNone(LIST);
  });

  it('holds the pending bumps qits-maintenance answers, newest first', async () => {
    const store = await loaded('pending bumps');
    expect(store.status()).toBe('loaded');
    expect(store.pending().map((bump) => [bump.status, bump.releaseState ?? null])).toEqual([
      ['REQUESTED', null],
      ['RUNNING', null],
      ['SUCCEEDED', null],
      ['SUCCEEDED', 'PENDING'],
    ]);
  });

  it('holds nothing when nothing is pending', async () => {
    const store = await loaded('no pending bumps');
    expect(store.pending()).toEqual([]);
  });

  it('refreshes a loaded list, and keeps it when the refresh fails', async () => {
    const store = await loaded('pending bumps');
    const refreshing = store.refresh();
    await settle();
    http.expectOne(LIST).flush(null, { status: 500, statusText: 'Server Error' });
    await refreshing;
    expect(store.status()).toBe('loaded');
    expect(store.pending()).toHaveLength(4);
  });

  it('does not refresh what was never loaded', async () => {
    const store = TestBed.inject(MaintenanceStore);
    await store.refresh();
    await settle();
    http.expectNone(LIST);
  });
});
