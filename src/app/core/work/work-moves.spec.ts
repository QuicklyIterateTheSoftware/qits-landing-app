import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { client as projectsClient } from '../../api/projects/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { DomainEvents } from '$core/events/domain-events';
import { SelectedProject } from '$core/projects/selected-project';
import { FINISH_DELAY_MS } from './finish-delay';
import { PendingFinishes } from './pending-finishes';
import { SelectedWork } from './selected-work';
import type { WorkEntry } from './work.consumes';
import { WorkMoves } from './work-moves';

/*
 * Ported from `work.store.spec.ts` (qits-2146): `WorkStore`'s per-project `load`/`byProject` record,
 * its refined-work count and its settled-status clock are gone (the read is `SelectedWork`'s one
 * resource, and a move's answer drops a read on its way instead of being laid over it), so only
 * the moves, the finishes with Undo, dispatch and what they write into that read are tested here.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Lets the generated client's and the mutation's awaits run, without moving the fake clock. */
const drain = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

/** The recorded project's id: every work state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';
const WORK = `/projects/api/projects/${ID}/work`;

describe('WorkMoves', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        {
          provide: SelectedProject,
          useValue: {
            project: signal({ id: ID }),
            slug: signal('qits'),
            listState: signal('loaded'),
          },
        },
        // `SelectedWork.followTransitions` is not called here: no event arrives.
        { provide: DomainEvents, useValue: { on: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  /** `SelectedWork` read for the project, answered with `entities`, and the moves. */
  async function loaded(entities: readonly WorkEntry[]) {
    const work = TestBed.inject(SelectedWork);
    work.want();
    TestBed.tick();
    await settle();
    http.expectOne(WORK).flush({ entities });
    await settle();
    return { work, moves: TestBed.inject(WorkMoves), pending: TestBed.inject(PendingFinishes) };
  }

  const statusOf = (work: SelectedWork, id: string) =>
    work.loaded().find((e) => e.id === id)?.status;

  describe('SelectedWork’s read', () => {
    it('requests nothing until the work is wanted', async () => {
      TestBed.inject(WorkMoves);
      TestBed.tick();
      await settle();
      http.expectNone(WORK);
    });

    it('reads a project’s whole planning tree once', async () => {
      const work = TestBed.inject(SelectedWork);
      const recorded = goldenMaster('a project with refined work', 'listProjectWork');
      work.want();
      expect(work.state()).toBe('loading');
      TestBed.tick();
      await settle();
      http.expectOne(WORK).flush(recorded);
      await settle();
      expect(work.state()).toBe('loaded');
      expect(work.entries()).toHaveLength(recorded.entities.length);
      work.want();
      TestBed.tick();
      await settle();
      http.expectNone(WORK);
    });

    it('holds no entry for a project with no work', async () => {
      const work = TestBed.inject(SelectedWork);
      work.want();
      TestBed.tick();
      await settle();
      http.expectOne(WORK).flush(goldenMaster('a project with no work', 'listProjectWork'));
      await settle();
      expect(work.state()).toBe('loaded');
      expect(work.entries()).toEqual([]);
    });

    it('reports failed work, and reads it again on the next reload', async () => {
      const work = TestBed.inject(SelectedWork);
      work.want();
      TestBed.tick();
      await settle();
      http.expectOne(WORK).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();
      expect(work.state()).toBe('error');
      work.reload();
      TestBed.tick();
      await settle();
      http.expectOne(WORK);
    });

    it('reads one at a time: reloads during a read wait for it, then read once more together (qits-1684)', async () => {
      const ticket = { id: 't-1', qualifiedId: 'qits-1', status: 'VERIFIED' } as WorkEntry;
      const { work } = await loaded([ticket]);
      work.reload();
      TestBed.tick();
      await settle();
      const slow = http.expectOne(WORK);

      work.reload();
      work.reload();
      TestBed.tick();
      await settle();
      http.expectNone(WORK);

      slow.flush({ entities: [ticket] });
      await settle();
      TestBed.tick();
      await settle();
      TestBed.tick();
      await settle();
      http.expectOne(WORK).flush({ entities: [{ ...ticket, status: 'DONE' }] });
      await settle();
      TestBed.tick();
      await settle();
      http.expectNone(WORK);
      expect(statusOf(work, 't-1')).toBe('DONE');
    });
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

    /** The ticket and the epic read, then the fake clock. */
    async function waiting() {
      const read = await loaded([ticket, epic]);
      vi.useFakeTimers();
      return read;
    }

    it('hides the item at once and sends the move to DONE after the delay', async () => {
      const { work, moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      expect(pending.hidden().has('t-1')).toBe(true);
      expect(work.entries().map((e) => e.id)).toEqual(['e-1']);
      expect(pending.all()['t-1']?.phase).toBe('waiting');

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS - 1);
      await drain();
      http.expectNone('/projects/api/work/qits-1/status');

      await vi.advanceTimersByTimeAsync(1);
      await drain();
      expect(pending.all()['t-1']?.phase).toBe('sending');
      const request = http.expectOne('/projects/api/work/qits-1/status');
      expect(request.request.body).toEqual({ target: 'DONE' });
      request.flush({ status: 'DONE' });
      await drain();

      expect(statusOf(work, 't-1')).toBe('DONE');
      expect(pending.all()).toEqual({});
      expect(pending.hidden().size).toBe(0);
    });

    it('stays sending and hidden while the status call has not answered (qits-1684)', async () => {
      const { moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      expect(pending.all()['t-1']?.phase).toBe('sending');
      expect(pending.hidden().has('t-1')).toBe(true);
      http.expectOne('/projects/api/work/qits-1/status');
      // Left open on purpose: the call never answers in this test.
    });

    it('sends nothing after an Undo, and shows the item again', async () => {
      const { work, moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      moves.undoFinish('t-1');
      expect(pending.hidden().size).toBe(0);
      expect(pending.all()).toEqual({});

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS * 2);
      await drain();
      http.expectNone('/projects/api/work/qits-1/status');
      expect(statusOf(work, 't-1')).toBe('VERIFIED');
      expect(work.entries().map((e) => e.id)).toEqual(['t-1', 'e-1']);
    });

    it('shows the item again when the move fails, until the failure is dismissed', async () => {
      const { work, moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http
        .expectOne('/projects/api/work/qits-1/status')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await drain();

      expect(pending.all()['t-1']?.phase).toBe('failed');
      expect(pending.hidden().size).toBe(0);
      expect(moves.finishing()['t-1']).toBe('error');
      expect(statusOf(work, 't-1')).toBe('VERIFIED');

      // An Undo is too late now; only Dismiss takes the failure away.
      moves.undoFinish('t-1');
      expect(pending.all()['t-1']?.phase).toBe('failed');
      moves.dismissFinish('t-1');
      expect(pending.all()).toEqual({});
    });

    it('keeps several finishes apart, each on its own timer', async () => {
      const { work, moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(2_000);
      moves.finishLater(ID, epic);
      expect([...pending.hidden()]).toEqual(['t-1', 'e-1']);

      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS - 2_000);
      await drain();
      http.expectOne('/projects/api/work/qits-1/status').flush({ status: 'DONE' });
      http.expectNone('/projects/api/work/qits-2/status');

      moves.undoFinish('e-1');
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectNone('/projects/api/work/qits-2/status');
      expect(statusOf(work, 't-1')).toBe('DONE');
      expect(statusOf(work, 'e-1')).toBe('VERIFIED');
    });

    it('keeps a finished item gone when an older read answers after it (qits-1223)', async () => {
      const { work, moves } = await waiting();
      moves.finishLater(ID, ticket);
      moves.finishLater(ID, epic);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      const ticketMove = http.expectOne('/projects/api/work/qits-1/status');
      const epicMove = http.expectOne('/projects/api/work/qits-2/status');

      // The ticket's event starts a read while the epic's move is still on its way.
      ticketMove.flush({ status: 'DONE' });
      await drain();
      work.reload();
      TestBed.tick();
      await drain();
      const stale = http.expectOne(WORK);
      epicMove.flush({ status: 'DONE' });
      await drain();
      expect(statusOf(work, 'e-1')).toBe('DONE');

      // The answered move dropped the read on its way: its answer is not believed.
      stale.flush({ entities: [{ ...ticket, status: 'DONE' }, epic] });
      await drain();
      expect(statusOf(work, 'e-1')).toBe('DONE');
      expect(statusOf(work, 't-1')).toBe('DONE');

      // A read that started after the finish is believed again.
      work.reload();
      TestBed.tick();
      await drain();
      http.expectOne(WORK).flush({
        entities: [
          { ...ticket, status: 'DONE' },
          { ...epic, status: 'DONE', title: 'Read again' },
        ],
      });
      await drain();
      expect(statusOf(work, 'e-1')).toBe('DONE');
      expect(work.loaded().find((e) => e.id === 'e-1')?.title).toBe('Read again');
    });

    it('asks once for an item already waiting', async () => {
      const { moves } = await waiting();
      moves.finishLater(ID, ticket);
      moves.finishLater(ID, ticket);
      await vi.advanceTimersByTimeAsync(FINISH_DELAY_MS);
      await drain();
      http.expectOne('/projects/api/work/qits-1/status').flush({ status: 'DONE' });
      await drain();
    });

    it('sends every waiting finish at once, kept alive, when the page is left', async () => {
      const { moves, pending } = await waiting();
      moves.finishLater(ID, ticket);
      moves.finishLater(ID, epic);
      globalThis.dispatchEvent(new Event('pagehide'));
      await drain();
      const sent = [
        http.expectOne('/projects/api/work/qits-1/status'),
        http.expectOne('/projects/api/work/qits-2/status'),
      ];
      expect(sent.map((r) => r.request.keepalive)).toEqual([true, true]);
      sent[0].flush({ status: 'DONE' });
      sent[1].flush({ status: 'DONE' });
      await drain();
      expect(pending.all()).toEqual({});
    });
  });

  describe('transition', () => {
    const ticket = {
      id: 't-1',
      qualifiedId: 'qits-1',
      archetype: 'TICKET',
      status: 'REPORTED',
    } as WorkEntry;
    const epic = {
      id: 'e-1',
      qualifiedId: 'qits-2',
      archetype: 'EPIC',
      status: 'REFINED',
    } as WorkEntry;

    it('marks a reported ticket refined through the status door', async () => {
      const { work, moves } = await loaded([ticket, epic]);
      const moved = moves.transition(ID, ticket, 'REFINED');
      expect(moves.transitioning()['t-1']).toBe('running');
      await settle();
      const request = http.expectOne('/projects/api/work/qits-1/status');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ target: 'REFINED' });
      request.flush({ status: 'REFINED' });
      await moved;
      expect(statusOf(work, 't-1')).toBe('REFINED');
      expect(moves.transitioning()).toEqual({});
    });

    it('drops an epic through the same door', async () => {
      const { work, moves } = await loaded([ticket, epic]);
      const moved = moves.transition(ID, epic, 'DROPPED');
      await settle();
      const request = http.expectOne('/projects/api/work/qits-2/status');
      expect(request.request.body).toEqual({ target: 'DROPPED' });
      request.flush({ status: 'DROPPED' });
      await moved;
      expect(statusOf(work, 'e-1')).toBe('DROPPED');
    });

    it('keeps the status and marks the move failed when it is refused', async () => {
      const { work, moves } = await loaded([ticket, epic]);
      const moved = moves.transition(ID, ticket, 'REFINED');
      await settle();
      http
        .expectOne('/projects/api/work/qits-1/status')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await moved;
      expect(statusOf(work, 't-1')).toBe('REPORTED');
      expect(moves.transitioning()['t-1']).toBe('error');
      // No message in the answer: the refusal names the HTTP status.
      expect(moves.refusals()['t-1']).toBe('The move failed (HTTP 409).');
    });

    // A quality gate's refusal, in the service's words (qits-887). Error answers are only a status
    // to the pact, so the body is the service's message format, written out.
    const GATE =
      'Epic e-1 cannot move to READY_FOR_DEV: ACCEPTANCE_CRITERIA: it has no acceptance criteria — ' +
      'write them first (acceptanceCriteria: update_epic, PATCH /entities/{id} or qits work update)';

    it('keeps the refusal’s message verbatim, until the next move of the same item', async () => {
      const { work, moves } = await loaded([ticket, epic]);
      const refused = moves.transition(ID, epic, 'READY_FOR_DEV');
      await settle();
      http
        .expectOne('/projects/api/work/qits-2/status')
        .flush({ message: GATE }, { status: 409, statusText: 'Conflict' });
      await refused;
      expect(moves.refusals()).toEqual({ 'e-1': GATE });
      expect(statusOf(work, 'e-1')).toBe('REFINED');

      const again = moves.transition(ID, epic, 'READY_FOR_DEV');
      expect(moves.refusals()).toEqual({});
      await settle();
      http.expectOne('/projects/api/work/qits-2/status').flush({ status: 'READY_FOR_DEV' });
      await again;
      expect(moves.refusals()).toEqual({});
      expect(statusOf(work, 'e-1')).toBe('READY_FOR_DEV');
    });

    it('moves several items at once, each on its own', async () => {
      const { work, moves } = await loaded([ticket, epic]);
      const refined = { ...ticket, status: 'REFINED' } as WorkEntry;
      const moved = moves.transitionAll(ID, [refined, epic], 'READY_FOR_DEV');
      await settle();
      const sent = [
        http.expectOne('/projects/api/work/qits-1/status'),
        http.expectOne('/projects/api/work/qits-2/status'),
      ];
      expect(sent.map((r) => r.request.body)).toEqual([
        { target: 'READY_FOR_DEV' },
        { target: 'READY_FOR_DEV' },
      ]);
      sent[0].flush({ status: 'READY_FOR_DEV' });
      sent[1].flush({ message: GATE }, { status: 409, statusText: 'Conflict' });
      await moved;
      expect(statusOf(work, 't-1')).toBe('READY_FOR_DEV');
      expect(statusOf(work, 'e-1')).toBe('REFINED');
      expect(moves.transitioning()).toEqual({ 'e-1': 'error' });
      expect(moves.refusals()).toEqual({ 'e-1': GATE });
    });

    it('sends one move while one is running', async () => {
      const { moves } = await loaded([ticket, epic]);
      const moved = moves.transition(ID, ticket, 'REFINED');
      await moves.transition(ID, ticket, 'REFINED');
      await settle();
      http.expectOne('/projects/api/work/qits-1/status').flush({ status: 'REFINED' });
      await moved;
    });

    // The Drop action's own move (qits-248): the same status door, carrying an outcome and, where
    // the outcome asks for one, a reference. The form that asks for them is `work-drop.spec.ts`;
    // this is `WorkMoves.drop` itself.
    describe('drop', () => {
      it('sends the outcome, and no reference for an outcome that forbids one', async () => {
        const { work, moves } = await loaded([ticket, epic]);
        const moved = moves.drop(ID, ticket, 'OBSOLETE');
        expect(moves.transitioning()['t-1']).toBe('running');
        await settle();
        const request = http.expectOne('/projects/api/work/qits-1/status');
        expect(request.request.body).toEqual({ target: 'DROPPED', outcome: 'OBSOLETE' });
        request.flush({ status: 'DROPPED' });
        expect(await moved).toEqual({ status: 'DROPPED' });
        expect(statusOf(work, 't-1')).toBe('DROPPED');
        expect(moves.transitioning()).toEqual({});
      });

      it('sends the reference alongside an outcome that requires one', async () => {
        const { moves } = await loaded([ticket, epic]);
        const moved = moves.drop(ID, ticket, 'DUPLICATE', 'qits-378');
        await settle();
        const request = http.expectOne('/projects/api/work/qits-1/status');
        expect(request.request.body).toEqual({
          target: 'DROPPED',
          outcome: 'DUPLICATE',
          supersededBy: 'qits-378',
        });
        request.flush({ status: 'DROPPED' });
        await moved;
      });

      it('surfaces a 400 naming the rule, and keeps the status', async () => {
        const { work, moves } = await loaded([ticket, epic]);
        const moved = moves.drop(ID, ticket, 'DUPLICATE');
        await settle();
        http
          .expectOne('/projects/api/work/qits-1/status')
          .flush(
            { message: 'DUPLICATE needs a reference naming what it duplicates' },
            { status: 400, statusText: 'Bad Request' },
          );
        const result = await moved;
        expect(result.refusal).toBe('DUPLICATE needs a reference naming what it duplicates');
        expect(statusOf(work, 't-1')).toBe('REPORTED');
        expect(moves.transitioning()['t-1']).toBe('error');
        expect(moves.refusals()['t-1']).toBe(
          'DUPLICATE needs a reference naming what it duplicates',
        );
      });

      it('does not repeat a running drop', async () => {
        const { moves } = await loaded([ticket, epic]);
        const moved = moves.drop(ID, ticket, 'OBSOLETE');
        await moves.drop(ID, ticket, 'OBSOLETE');
        await settle();
        http.expectOne('/projects/api/work/qits-1/status').flush({ status: 'DROPPED' });
        await moved;
      });
    });
  });

  describe('dispatch', () => {
    const epic = {
      id: 'e-1',
      qualifiedId: 'qits-2',
      archetype: 'EPIC',
      status: 'READY_FOR_DEV',
    } as WorkEntry;

    it.each([
      ['FLOW', 'a ready for dev epic'],
      ['PHASE', 'a reported epic'],
    ] as const)(
      'presses dispatch with mode %s and keeps the phase it started',
      async (mode, state) => {
        const moves = TestBed.inject(WorkMoves);
        const pressed = moves.dispatch(epic, mode);
        expect(moves.dispatching()['e-1']).toBe('running');
        await settle();
        const request = http.expectOne('/projects/api/work/qits-2/dispatch');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual({ mode });
        const answer = goldenMaster(state, 'dispatchWork');
        request.flush(answer);
        await pressed;
        expect(moves.dispatching()).toEqual({});
        expect(moves.dispatched()['e-1']).toBe(answer.dispatch.phase);
      },
    );

    it('marks the press failed when it is refused, and sends one press at a time', async () => {
      const moves = TestBed.inject(WorkMoves);
      const pressed = moves.dispatch(epic, 'FLOW');
      await moves.dispatch(epic, 'FLOW');
      await settle();
      http
        .expectOne('/projects/api/work/qits-2/dispatch')
        .flush(null, { status: 409, statusText: 'Conflict' });
      await pressed;
      expect(moves.dispatching()['e-1']).toBe('error');
      expect(moves.dispatched()).toEqual({});
    });
  });
});
