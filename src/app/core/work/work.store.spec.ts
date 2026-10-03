import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import type { WorkEntry } from './work.consumes';
import { FINISH_DELAY_MS, WorkStore } from './work.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every work state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';

describe('WorkStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests nothing until asked to load', async () => {
    TestBed.inject(WorkStore);
    await settle();
    http.expectNone(`/projects/api/projects/${ID}/entities`);
  });

  it('counts a project’s refined work once, from its whole planning tree', async () => {
    const store = TestBed.inject(WorkStore);
    // 3 REFINED (an epic, two tickets), 1 REPORTED, 1 DONE: only the REFINED ones count.
    const work = goldenMaster('a project with refined work', 'listProjectEntities');
    const done = store.load(ID);
    expect(store.byProject()[ID]?.status).toBe('loading');
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/entities`).flush(work);
    await done;
    expect(store.byProject()[ID]).toMatchObject({ status: 'loaded', count: 3 });
    expect(store.byProject()[ID]?.entries).toHaveLength(work.entities.length);
    await store.load(ID);
    http.expectNone(`/projects/api/projects/${ID}/entities`);
  });

  it('counts zero for a project with no work', async () => {
    const store = TestBed.inject(WorkStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/entities`)
      .flush(goldenMaster('a project with no work', 'listProjectEntities'));
    await done;
    expect(store.byProject()[ID]).toEqual({
      status: 'loaded',
      count: 0,
      entries: [],
      campaigns: {},
    });
  });

  it('reports failed work, and fetches it again on the next ask', async () => {
    const store = TestBed.inject(WorkStore);
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/entities`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.byProject()[ID]?.status).toBe('error');
    void store.load(ID);
    await settle();
    http.expectOne(`/projects/api/projects/${ID}/entities`);
  });

  describe('finishing with Undo', () => {
    const ticket = {
      id: 't-1',
      qualifiedId: 'qits-1',
      archetype: 'TICKET',
      status: 'VERIFIED',
    } as WorkEntry;
    const epic = {
      id: 'e-1',
      qualifiedId: 'qits-2',
      archetype: 'EPIC',
      status: 'VERIFIED',
    } as WorkEntry;

    /** Lets the generated client's awaits run, without moving the fake clock. */
    const drain = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };

    async function loaded(): Promise<InstanceType<typeof WorkStore>> {
      const store = TestBed.inject(WorkStore);
      const done = store.load(ID);
      await drain();
      http.expectOne(`/projects/api/projects/${ID}/entities`).flush({ entities: [ticket, epic] });
      await done;
      return store;
    }

    const statusOf = (store: InstanceType<typeof WorkStore>, id: string) =>
      store.byProject()[ID]?.entries.find((e) => e.id === id)?.status;

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('hides the item at once and sends the move to DONE after the delay', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      expect(store.hidden().has('t-1')).toBe(true);
      expect(store.pendingFinishes()['t-1']?.phase).toBe('waiting');

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS - 1);
      await drain();
      http.expectNone('/projects/api/tickets/t-1/transition');

      await vi.advanceTimersByTimeAsync(1);
      await drain();
      expect(store.pendingFinishes()['t-1']?.phase).toBe('sending');
      const request = http.expectOne('/projects/api/tickets/t-1/transition');
      expect(request.request.body).toEqual({ target: 'DONE' });
      request.flush({ ticket: { status: 'DONE' } });
      await drain();

      expect(statusOf(store, 't-1')).toBe('DONE');
      expect(store.pendingFinishes()).toEqual({});
      expect(store.hidden().size).toBe(0);
    });

    it('sends nothing after an Undo, and shows the item again', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.undoFinish('t-1');
      expect(store.hidden().size).toBe(0);
      expect(store.pendingFinishes()).toEqual({});

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS * 2);
      await drain();
      http.expectNone('/projects/api/tickets/t-1/transition');
      expect(statusOf(store, 't-1')).toBe('VERIFIED');
    });

    it('shows the item again when the move fails, until the failure is dismissed', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http
        .expectOne('/projects/api/tickets/t-1/transition')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await drain();

      expect(store.pendingFinishes()['t-1']?.phase).toBe('failed');
      expect(store.hidden().size).toBe(0);
      expect(store.finishing()['t-1']).toBe('error');
      expect(statusOf(store, 't-1')).toBe('VERIFIED');

      // An Undo is too late now; only Dismiss takes the failure away.
      store.undoFinish('t-1');
      expect(store.pendingFinishes()['t-1']?.phase).toBe('failed');
      store.dismissFinish('t-1');
      expect(store.pendingFinishes()).toEqual({});
    });

    it('keeps several finishes apart, each on its own timer', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(2_000);
      store.finishLater(ID, epic);
      expect([...store.hidden()]).toEqual(['t-1', 'e-1']);

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS - 2_000);
      await drain();
      http.expectOne('/projects/api/tickets/t-1/transition').flush({ ticket: { status: 'DONE' } });
      http.expectNone('/projects/api/epics/e-1/transition');

      store.undoFinish('e-1');
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectNone('/projects/api/epics/e-1/transition');
      expect(statusOf(store, 't-1')).toBe('DONE');
      expect(statusOf(store, 'e-1')).toBe('VERIFIED');
    });

    it('asks once for an item already waiting', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectOne('/projects/api/tickets/t-1/transition').flush({ ticket: { status: 'DONE' } });
      await drain();
    });

    it('sends every waiting finish at once, kept alive, when the page is left', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.finishLater(ID, epic);
      globalThis.dispatchEvent(new Event('pagehide'));
      await drain();
      const sent = [
        http.expectOne('/projects/api/tickets/t-1/transition'),
        http.expectOne('/projects/api/epics/e-1/transition'),
      ];
      expect(sent.map((r) => r.request.keepalive)).toEqual([true, true]);
      sent[0].flush({ ticket: { status: 'DONE' } });
      sent[1].flush({ epic: { status: 'DONE' } });
      await drain();
      expect(store.pendingFinishes()).toEqual({});
    });
  });
});
