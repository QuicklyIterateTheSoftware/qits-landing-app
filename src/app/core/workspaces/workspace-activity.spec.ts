import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { filter, Subject } from 'rxjs';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { WorkspaceActivity } from './workspace-activity';

/*
 * Ported from `workspaces.store.spec.ts` (qits-2146): an item's own workspaces in every state
 * (`loadHistory`, `refreshHistory`) are the work item page's own read now, so they are not tested
 * here.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const BOUND = 'a project with workspaces bound to work items';
const AGENTS = 'a project with agents bound to work items';
const OPEN = '/workspaces/api/work/workspaces';
const LIST = '/workspaces/api/agents?state=ACTIVE';

const params = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId).params;

/** `WorkspaceActivity` on qits-workspaces' recorded states. */
describe('WorkspaceActivity', () => {
  let http: HttpTestingController;
  let activity: WorkspaceActivity;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    activity = TestBed.inject(WorkspaceActivity);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  /** Lets a resource start its read (from an effect) and the client build its request. */
  async function started() {
    TestBed.tick();
    await settle();
  }

  /** The open workspaces wanted and answered with `body`. */
  async function answerOpen(body: object | null, init?: { status: number; statusText: string }) {
    activity.wantOpen();
    await started();
    http.expectOne(OPEN).flush(body, init);
    await settle();
  }

  /** Sends `sent` as one burst, lets it settle, and lets the reads it starts begin. */
  async function burst(...sent: DomainEvent[]) {
    vi.useFakeTimers();
    sent.forEach((event) => events.next(event));
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await started();
  }

  const placed: DomainEvent = {
    name: 'AgentPlaced',
    payload: JSON.stringify({ agentId: 'a', workId: 'w' }),
  };

  it('requests nothing until wanted', async () => {
    await started();
    http.expectNone(OPEN);
    http.expectNone(LIST);
  });

  it('knows which items have an active workspace', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    const p = params(BOUND, 'listOpenWorkspaces');
    expect(activity.open.status()).toBe('resolved');
    for (const id of [p['epicId'], p['featureId'], p['taskId'], p['bugTicketId']]) {
      expect(activity.hasOpen(id)).toBe(true);
    }
    expect(activity.hasOpen(p['improvementTicketId'])).toBe(false);
    expect(activity.hasOpen(undefined)).toBe(false);
  });

  it('loads once', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    activity.wantOpen();
    await started();
    http.expectNone(OPEN);
  });

  it('keeps the last good answer when a read again fails', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    activity.follow(TestBed.inject(DestroyRef));
    await burst(placed);
    http.expectOne(OPEN).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(activity.open.status()).toBe('resolved');
    expect(activity.hasOpen(params(BOUND, 'listOpenWorkspaces')['bugTicketId'])).toBe(true);
  });

  it('fails a first load, and loads again on the next want', async () => {
    await answerOpen(null, { status: 500, statusText: 'Server Error' });
    expect(activity.open.status()).toBe('error');
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    expect(activity.open.status()).toBe('resolved');
  });

  describe('agents', () => {
    it('knows which items an active agent is on, and reads them once', async () => {
      activity.wantAgents();
      await started();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await settle();
      expect(activity.agents.status()).toBe('resolved');
      expect(activity.agentSet().has(params(AGENTS, 'listAgents')['bugTicketId'])).toBe(true);
      activity.wantAgents();
      await started();
      http.expectNone(LIST);
    });

    it('holds no item when the read is refused, and reads again on the next want', async () => {
      activity.wantAgents();
      await started();
      http.expectOne(LIST).flush(null, { status: 403, statusText: 'Forbidden' });
      await settle();
      expect(activity.agents.status()).toBe('error');
      expect([...activity.agentSet()]).toEqual([]);
      activity.wantAgents();
      await started();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await settle();
      expect(activity.agents.status()).toBe('resolved');
    });

    it('reads the agents again on an agent event, once they are read', async () => {
      activity.wantAgents();
      await started();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await settle();
      activity.follow(TestBed.inject(DestroyRef));
      await burst(placed);
      // The open workspaces were never read: they are not read now either.
      http.expectNone(OPEN);
      http.expectOne(LIST).flush({ agents: [] });
      await settle();
      expect([...activity.agentSet()]).toEqual([]);
    });
  });

  describe('follow', () => {
    it('reads the open workspaces again after an agent is placed, obsolete or removed', async () => {
      await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      activity.follow(TestBed.inject(DestroyRef));
      await burst(placed, {
        name: 'AgentRemoved',
        payload: JSON.stringify({ agentId: 'b', workId: 'v' }),
      });
      http.expectOne(OPEN).flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      await settle();
      expect(activity.open.status()).toBe('resolved');
    });

    it('reads nothing after a work item’s move, or a harness event', async () => {
      await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      activity.follow(TestBed.inject(DestroyRef));
      await burst(
        { name: 'EntityTransitioned', payload: JSON.stringify({ entities: [] }) },
        { name: 'AgentHarnessExited', payload: JSON.stringify({ agentId: 'a' }) },
      );
      http.expectNone(OPEN);
    });
  });
});
