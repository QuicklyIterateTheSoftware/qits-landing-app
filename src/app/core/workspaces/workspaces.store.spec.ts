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
import { WorkspacesStore } from './workspaces.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const BOUND = 'a project with workspaces bound to work items';
const NONE = 'a work item with no workspaces';
const OPEN = '/workspaces/api/work/workspaces';

const params = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId).params;

/** `WorkspacesStore` on qits-workspaces' recorded states. */
describe('WorkspacesStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof WorkspacesStore>;
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
    store = TestBed.inject(WorkspacesStore);
  });

  afterEach(() => http.verify());

  async function answerOpen(body: object | null, init?: { status: number; statusText: string }) {
    const done = store.status() === 'loaded' ? store.refresh() : store.load();
    await settle();
    http.expectOne(OPEN).flush(body, init);
    await done;
  }

  it('knows which items have an active workspace', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    const p = params(BOUND, 'listOpenWorkspaces');
    expect(store.status()).toBe('loaded');
    for (const id of [p['epicId'], p['featureId'], p['taskId'], p['bugTicketId']]) {
      expect(store.hasOpen(id)).toBe(true);
    }
    expect(store.hasOpen(p['improvementTicketId'])).toBe(false);
    expect(store.hasOpen(undefined)).toBe(false);
  });

  it('loads once', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    await store.load();
    await settle();
    http.expectNone(OPEN);
  });

  it('keeps the last good answer when a refresh fails', async () => {
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    await answerOpen(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('loaded');
    expect(store.hasOpen(params(BOUND, 'listOpenWorkspaces')['bugTicketId'])).toBe(true);
  });

  it('fails a first load, and loads again after it', async () => {
    await answerOpen(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('error');
    await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    expect(store.status()).toBe('loaded');
  });

  it('reads an item’s workspaces in every state, newest first', async () => {
    const ref = params(BOUND, 'listWorkItemWorkspaces')['bugTicketId'];
    const done = store.loadHistory(ref);
    expect(store.historyOf(ref)?.status).toBe('loading');
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(workspacesGoldenMaster(BOUND, 'listWorkItemWorkspaces'));
    await done;
    const history = store.historyOf(ref)!;
    expect(history.status).toBe('loaded');
    expect(history.entries.map((w) => w.status)).toEqual(['ACTIVE', 'INTEGRATED', 'ABANDONED']);
  });

  it('reads an item without workspaces, and an error', async () => {
    const ref = params(NONE, 'listWorkItemWorkspaces')['improvementTicketId'];
    const empty = store.loadHistory(ref);
    const failed = store.loadHistory('contract-404');
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(workspacesGoldenMaster(NONE, 'listWorkItemWorkspaces'));
    http
      .expectOne('/workspaces/api/work/contract-404/workspaces')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await Promise.all([empty, failed]);
    expect(store.historyOf(ref)).toEqual({ status: 'loaded', entries: [] });
    expect(store.historyOf('contract-404')).toEqual({ status: 'error', entries: [] });
  });

  describe('agents', () => {
    const AGENTS = 'a project with agents bound to work items';
    const LIST = '/workspaces/api/agents?state=ACTIVE';

    it('knows which items an active agent is on, and reads them once', async () => {
      const loading = store.loadAgents();
      await settle();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await loading;
      expect(store.agentsStatus()).toBe('loaded');
      expect(store.agentSet().has(params(AGENTS, 'listAgents')['bugTicketId'])).toBe(true);
      await store.loadAgents();
      await settle();
      http.expectNone(LIST);
    });

    it('holds no item when the read is refused, and reads again on the next call', async () => {
      const loading = store.loadAgents();
      await settle();
      http.expectOne(LIST).flush(null, { status: 403, statusText: 'Forbidden' });
      await loading;
      expect(store.agentsStatus()).toBe('error');
      expect(store.agentWorkIds()).toEqual([]);
      void store.loadAgents();
      await settle();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await settle();
      expect(store.agentsStatus()).toBe('loaded');
    });

    it('reads the agents again on a refresh, once they are loaded', async () => {
      const loading = store.loadAgents();
      await settle();
      http.expectOne(LIST).flush(workspacesGoldenMaster(AGENTS, 'listAgents'));
      await loading;
      const refreshing = store.refresh();
      await settle();
      http.expectOne(LIST).flush({ agents: [] });
      await refreshing;
      expect(store.agentWorkIds()).toEqual([]);
    });
  });

  describe('follow', () => {
    /** Sends `sent` as one burst, and lets it settle. */
    async function burst(...sent: DomainEvent[]) {
      vi.useFakeTimers();
      sent.forEach((event) => events.next(event));
      vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
      vi.useRealTimers();
      await settle();
    }

    it('reads the open workspaces again after an agent is placed, obsolete or removed', async () => {
      await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      store.follow(TestBed.inject(DestroyRef));
      await burst(
        { name: 'AgentPlaced', payload: JSON.stringify({ agentId: 'a', workId: 'w' }) },
        { name: 'AgentRemoved', payload: JSON.stringify({ agentId: 'b', workId: 'v' }) },
      );
      http.expectOne(OPEN).flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      await settle();
      expect(store.status()).toBe('loaded');
    });

    it('reads nothing after a work item’s move, or a harness event', async () => {
      await answerOpen(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
      store.follow(TestBed.inject(DestroyRef));
      await burst(
        { name: 'EntityTransitioned', payload: JSON.stringify({ entities: [] }) },
        { name: 'AgentHarnessExited', payload: JSON.stringify({ agentId: 'a' }) },
      );
      http.expectNone(OPEN);
    });
  });

  it('reads a loaded history again quietly, and nothing for one never read', async () => {
    const ref = params(BOUND, 'listWorkItemWorkspaces')['bugTicketId'];
    const done = store.loadHistory(ref);
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(workspacesGoldenMaster(BOUND, 'listWorkItemWorkspaces'));
    await done;
    const again = store.refreshHistory(ref);
    expect(store.historyOf(ref)?.status).toBe('loaded');
    await settle();
    http
      .expectOne(`/workspaces/api/work/${ref}/workspaces`)
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await again;
    expect(store.historyOf(ref)?.entries.length).toBe(3);
    await store.refreshHistory('never-read');
    await settle();
    http.expectNone('/workspaces/api/work/never-read/workspaces');
  });
});
