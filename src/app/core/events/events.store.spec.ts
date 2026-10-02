import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as eventsClient } from '../../api/events/client.gen';
import { provideHeyApiClient } from '../../api/events/client/client.gen';
import { eventsGoldenMaster } from '../../../testing/golden-masters';
import { RECENT_EVENTS } from './events.consumes';
import { EventsStore } from './events.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('EventsStore', () => {
  let http: HttpTestingController;
  const LIST = `/events/api/events?limit=${RECENT_EVENTS}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(eventsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(state: string) {
    const store = TestBed.inject(EventsStore);
    const loading = store.load();
    await settle();
    http.expectOne(LIST).flush(eventsGoldenMaster(state, 'listEvents'));
    await loading;
    return store;
  }

  it('requests nothing until asked', async () => {
    TestBed.inject(EventsStore);
    await settle();
    http.expectNone(LIST);
  });

  it('loads the newest events once, newest first', async () => {
    const store = await loaded('a few recent events');
    expect(store.status()).toBe('loaded');
    expect(store.recent().map((event) => event.name)).toEqual([
      'DeploymentActive',
      'ReleaseRequestChanged',
      'TicketReported',
    ]);
    await store.load();
    await settle();
    http.expectNone(LIST);
  });

  it('holds an empty list when there are no events', async () => {
    const store = await loaded('no events');
    expect(store.status()).toBe('loaded');
    expect(store.recent()).toEqual([]);
  });

  it('puts a later event at the top, once, and keeps at most the newest 20', async () => {
    const store = await loaded('a few recent events');
    store.prepend({ id: 'new', name: 'BuildFailed' });
    store.prepend({ id: 'new', name: 'BuildFailed' });
    expect(store.recent().map((event) => event.id)[0]).toBe('new');
    expect(store.recent()).toHaveLength(4);
    for (let i = 0; i < 30; i++) store.prepend({ id: `e${i}`, name: 'BuildFailed' });
    expect(store.recent()).toHaveLength(RECENT_EVENTS);
    expect(store.recent()[0].id).toBe('e29');
  });

  it('reports a failed list, and tries again on the next load', async () => {
    const store = TestBed.inject(EventsStore);
    const first = store.load();
    await settle();
    http.expectOne(LIST).flush(null, { status: 500, statusText: 'Server Error' });
    await first;
    expect(store.status()).toBe('error');
    const second = store.load();
    await settle();
    http.expectOne(LIST).flush(eventsGoldenMaster('no events', 'listEvents'));
    await second;
    expect(store.status()).toBe('loaded');
  });
});
