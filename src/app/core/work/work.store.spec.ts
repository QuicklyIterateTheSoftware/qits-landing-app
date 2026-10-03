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

  it('reads each campaign’s members and description', async () => {
    const store = TestBed.inject(WorkStore);
    const state = 'a campaign with work in every phase';
    const campaign = goldenMaster(state, 'getCampaign');
    const done = store.load(ID);
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/entities`)
      .flush(goldenMaster(state, 'listProjectEntities'));
    await settle();
    http.expectOne(`/projects/api/campaigns/${campaign.campaign.id}`).flush(campaign);
    await done;
    const work = store.byProject()[ID];
    expect(work?.campaigns[campaign.campaign.id]).toEqual(
      campaign.campaign.members.map((m: { entity: { id: string } }) => m.entity.id),
    );
    expect(work?.campaignDescriptions).toEqual({
      [campaign.campaign.id]: campaign.campaign.description,
    });
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
      campaignDescriptions: {},
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
      http.expectNone('/projects/api/entities/t-1/status');

      await vi.advanceTimersByTimeAsync(1);
      await drain();
      expect(store.pendingFinishes()['t-1']?.phase).toBe('sending');
      const request = http.expectOne('/projects/api/entities/t-1/status');
      expect(request.request.body).toEqual({ target: 'DONE' });
      request.flush({ status: 'DONE' });
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
      http.expectNone('/projects/api/entities/t-1/status');
      expect(statusOf(store, 't-1')).toBe('VERIFIED');
    });

    it('shows the item again when the move fails, until the failure is dismissed', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http
        .expectOne('/projects/api/entities/t-1/status')
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
      http.expectOne('/projects/api/entities/t-1/status').flush({ status: 'DONE' });
      http.expectNone('/projects/api/entities/e-1/status');

      store.undoFinish('e-1');
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectNone('/projects/api/entities/e-1/status');
      expect(statusOf(store, 't-1')).toBe('DONE');
      expect(statusOf(store, 'e-1')).toBe('VERIFIED');
    });

    it('keeps a finished item gone when an older fetch answers after it', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.finishLater(ID, epic);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      const ticketMove = http.expectOne('/projects/api/entities/t-1/status');
      const epicMove = http.expectOne('/projects/api/entities/e-1/status');

      // The ticket's event starts a fetch while the epic's move is still on its way.
      ticketMove.flush({ status: 'DONE' });
      await drain();
      const refreshed = store.refresh(ID);
      await drain();
      const stale = http.expectOne(`/projects/api/projects/${ID}/entities`);
      epicMove.flush({ status: 'DONE' });
      await drain();
      expect(statusOf(store, 'e-1')).toBe('DONE');

      stale.flush({ entities: [{ ...ticket, status: 'DONE' }, epic] });
      await refreshed;
      expect(statusOf(store, 'e-1')).toBe('DONE');
      expect(statusOf(store, 't-1')).toBe('DONE');

      // A fetch that started after the finish is believed again.
      const later = store.refresh(ID);
      await drain();
      http.expectOne(`/projects/api/projects/${ID}/entities`).flush({
        entities: [
          { ...ticket, status: 'DONE' },
          { ...epic, status: 'DONE' },
        ],
      });
      await later;
      expect(statusOf(store, 'e-1')).toBe('DONE');
    });

    it('asks once for an item already waiting', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectOne('/projects/api/entities/t-1/status').flush({ status: 'DONE' });
      await drain();
    });

    it('sends every waiting finish at once, kept alive, when the page is left', async () => {
      const store = await loaded();
      store.finishLater(ID, ticket);
      store.finishLater(ID, epic);
      globalThis.dispatchEvent(new Event('pagehide'));
      await drain();
      const sent = [
        http.expectOne('/projects/api/entities/t-1/status'),
        http.expectOne('/projects/api/entities/e-1/status'),
      ];
      expect(sent.map((r) => r.request.keepalive)).toEqual([true, true]);
      sent[0].flush({ status: 'DONE' });
      sent[1].flush({ status: 'DONE' });
      await drain();
      expect(store.pendingFinishes()).toEqual({});
    });
  });

  describe('transition', () => {
    const ticket = { id: 't-1', archetype: 'TICKET', status: 'REPORTED' } as WorkEntry;
    const epic = { id: 'e-1', archetype: 'EPIC', status: 'REFINED' } as WorkEntry;

    async function loaded(): Promise<InstanceType<typeof WorkStore>> {
      const store = TestBed.inject(WorkStore);
      const done = store.load(ID);
      await settle();
      http.expectOne(`/projects/api/projects/${ID}/entities`).flush({ entities: [ticket, epic] });
      await done;
      return store;
    }

    const statusOf = (store: InstanceType<typeof WorkStore>, id: string) =>
      store.byProject()[ID]?.entries.find((e) => e.id === id)?.status;

    it('marks a reported ticket refined through the status door', async () => {
      const store = await loaded();
      const moved = store.transition(ID, ticket, 'REFINED');
      expect(store.transitioning()['t-1']).toBe('running');
      await settle();
      const request = http.expectOne('/projects/api/entities/t-1/status');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ target: 'REFINED' });
      request.flush({ status: 'REFINED' });
      await moved;
      expect(statusOf(store, 't-1')).toBe('REFINED');
      expect(store.transitioning()).toEqual({});
    });

    it('drops an epic through the same door', async () => {
      const store = await loaded();
      const moved = store.transition(ID, epic, 'DROPPED');
      await settle();
      const request = http.expectOne('/projects/api/entities/e-1/status');
      expect(request.request.body).toEqual({ target: 'DROPPED' });
      request.flush({ status: 'DROPPED' });
      await moved;
      expect(statusOf(store, 'e-1')).toBe('DROPPED');
    });

    it('keeps the status and marks the move failed when it is refused', async () => {
      const store = await loaded();
      const moved = store.transition(ID, ticket, 'REFINED');
      await settle();
      http
        .expectOne('/projects/api/entities/t-1/status')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await moved;
      expect(statusOf(store, 't-1')).toBe('REPORTED');
      expect(store.transitioning()['t-1']).toBe('error');
    });

    it('sends one move while one is running', async () => {
      const store = await loaded();
      const moved = store.transition(ID, ticket, 'REFINED');
      await store.transition(ID, ticket, 'REFINED');
      await settle();
      http.expectOne('/projects/api/entities/t-1/status').flush({ status: 'REFINED' });
      await moved;
    });
  });

  describe('dispatch', () => {
    const epic = { id: 'e-1', archetype: 'EPIC', status: 'REFINED' } as WorkEntry;

    it.each([
      ['FLOW', 'a refined epic'],
      ['PHASE', 'a reported epic'],
    ] as const)(
      'presses dispatch with mode %s and keeps the phase it started',
      async (mode, state) => {
        const store = TestBed.inject(WorkStore);
        const pressed = store.dispatch(epic, mode);
        expect(store.dispatching()['e-1']).toBe('running');
        await settle();
        const request = http.expectOne('/projects/api/entities/e-1/dispatch');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ mode });
        const answer = goldenMaster(state, 'dispatchEntity');
        request.flush(answer);
        await pressed;
        expect(store.dispatching()).toEqual({});
        expect(store.dispatched()['e-1']).toBe(answer.dispatch.phase);
      },
    );

    it('marks the press failed when it is refused, and sends one press at a time', async () => {
      const store = TestBed.inject(WorkStore);
      const pressed = store.dispatch(epic, 'FLOW');
      await store.dispatch(epic, 'FLOW');
      await settle();
      http
        .expectOne('/projects/api/entities/e-1/dispatch')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await pressed;
      expect(store.dispatching()['e-1']).toBe('error');
      expect(store.dispatched()).toEqual({});
    });
  });
});
