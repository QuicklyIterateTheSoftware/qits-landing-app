import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { filter, Subject } from 'rxjs';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { AgentsStore, ofProject } from './agents.store';
import { HARNESS_EVENTS, WORKSPACE_REFRESH_DEBOUNCE_MS } from './workspace-events';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PROJECT = 'a project with workspace slots hosting agents';
const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const API = '/workspaces/api';

const params = (state: string) => workspacesGoldenMasters.operation(state, 'listAgents').params;

/** `AgentsStore` on qits-workspaces' recorded states (epic qits-1230). */
describe('AgentsStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentsStore>;
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentsStore);
  });

  afterEach(() => http.verify());

  async function answerProject(repositoryId: string) {
    const done = store.loadProject(repositoryId);
    await settle();
    http
      .expectOne(`${API}/workspaces?repositoryId=${repositoryId}`)
      .flush(workspacesGoldenMaster(PROJECT, 'listWorkspaces'));
    http.expectOne(`${API}/agents`).flush(workspacesGoldenMaster(PROJECT, 'listAgents'));
    await done;
  }

  it('holds the wrapper’s slots, and its agents that are not removed', async () => {
    const repositoryId = params(PROJECT)['repositoryId'];
    await answerProject(repositoryId);
    const project = store.projectOf(repositoryId)!;
    expect(project.status).toBe('loaded');
    expect(project.slots.map((s) => s.workspaceId)).toEqual(['ws-contract']);
    expect(project.agents.map((a) => a.entityId)).toEqual([
      'contract-00000001-11',
      'contract-00000001-10',
      'contract-00000001-2',
    ]);
  });

  it('leaves out another wrapper’s agents, and keeps the last good answer when a read fails', async () => {
    await answerProject('another-wrapper');
    expect(store.projectOf('another-wrapper')?.agents).toEqual([]);
    const again = store.loadProject('another-wrapper');
    await settle();
    http
      .expectOne(`${API}/workspaces?repositoryId=another-wrapper`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(`${API}/agents`).flush(workspacesGoldenMaster(PROJECT, 'listAgents'));
    await again;
    expect(store.projectOf('another-wrapper')?.status).toBe('loaded');
  });

  it('keeps the agents on the project’s items, whatever wrapper the page names', async () => {
    const done = store.loadProject('another-wrapper', 'contract-00000001');
    await settle();
    http
      .expectOne(`${API}/workspaces?repositoryId=another-wrapper`)
      .flush(workspacesGoldenMaster(PROJECT, 'listWorkspaces'));
    http.expectOne(`${API}/agents`).flush(workspacesGoldenMaster(PROJECT, 'listAgents'));
    await done;
    expect(store.projectOf('another-wrapper')?.agents).toHaveLength(3);
  });

  it('tells a project’s items by their qualified id, exactly', () => {
    expect(ofProject('qits-12', 'qits')).toBe(true);
    expect(ofProject('qits-ci-3', 'qits')).toBe(false);
    expect(ofProject('qits-ci-3', 'qits-ci')).toBe(true);
    expect(ofProject('qits-x', 'qits')).toBe(false);
    expect(ofProject(undefined, 'qits')).toBe(false);
    expect(ofProject('qits-12', undefined)).toBe(false);
  });

  it('reads a slot: its status, the start against it, and the agents it hosts', async () => {
    const id = Number(params(SLOT)['workspaceId']);
    const done = store.loadSlot(id);
    expect(store.slotAgentsOf(id)?.status).toBe('loading');
    await settle();
    http.expectOne(`${API}/workspaces/${id}`).flush(workspacesGoldenMaster(SLOT, 'getWorkspace'));
    http
      .expectOne(`${API}/workspaces/${id}/active-process`)
      .flush(workspacesGoldenMaster(SLOT, 'getWorkspaceActiveProcess'));
    http
      .expectOne(`${API}/agents?workspaceId=${id}`)
      .flush(workspacesGoldenMaster(SLOT, 'listAgents'));
    await done;
    expect(store.slotOf(id)).toMatchObject({ status: 'loaded', processId: null });
    expect(store.slotOf(id)?.slot?.runner?.name).toBe('localhost');
    expect(store.slotAgentsOf(id)?.agents.map((a) => a.runState)).toEqual(['RUNNING', 'YIELDED']);
  });

  it('calls a slot that answers 404 missing', async () => {
    const done = store.loadSlotStatus(99);
    await settle();
    http.expectOne(`${API}/workspaces/99`).flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(`${API}/workspaces/99/active-process`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await done;
    expect(store.slotOf(99)?.status).toBe('missing');
  });

  it('reads an item’s agent, then its slot and the start running against it', async () => {
    const workId = params(STARTING)['bugTicketId'];
    const id = Number(params(STARTING)['workspaceId']);
    const done = store.loadItem(workId);
    await settle();
    http
      .expectOne(`${API}/agents?workId=${workId}`)
      .flush(workspacesGoldenMaster(STARTING, 'listAgents'));
    await settle();
    http
      .expectOne(`${API}/workspaces/${id}`)
      .flush(workspacesGoldenMaster(STARTING, 'getWorkspace'));
    http
      .expectOne(`${API}/workspaces/${id}/active-process`)
      .flush(workspacesGoldenMaster(STARTING, 'getWorkspaceActiveProcess'));
    await done;
    expect(store.itemOf(workId)?.agent?.waitingOn).toContain('release-request');
    expect(store.slotOf(id)?.slot?.runtimeStatus).toBe('PROVISIONING');
    expect(store.slotOf(id)?.processId).toBeTruthy();
  });

  it('holds no agent for an item without one', async () => {
    const done = store.loadItem('w-none');
    await settle();
    http.expectOne(`${API}/agents?workId=w-none`).flush({ agents: [] });
    await done;
    expect(store.itemOf('w-none')).toEqual({ status: 'loaded', agent: undefined });
  });

  it('refreshes after the lifecycle events about its scope, at most once a second', async () => {
    vi.useFakeTimers();
    try {
      let refreshed = 0;
      const destroy = TestBed.inject(DestroyRef);
      store.follow(
        destroy,
        () => ({ workspaceId: '12' }),
        () => refreshed++,
      );
      const about = (workspaceId: string) => ({
        name: 'AgentPlaced',
        payload: JSON.stringify({ agentId: 'a', workspaceId }),
      });
      events.next(about('12'));
      events.next(about('12'));
      events.next(about('13'));
      vi.advanceTimersByTime(WORKSPACE_REFRESH_DEBOUNCE_MS);
      expect(refreshed).toBe(1);
      events.next(about('13'));
      vi.advanceTimersByTime(WORKSPACE_REFRESH_DEBOUNCE_MS);
      expect(refreshed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('narrows by the names it is given, hands the burst over, and takes several scopes', async () => {
    vi.useFakeTimers();
    try {
      const bursts: (readonly DomainEvent[])[] = [];
      store.follow(
        TestBed.inject(DestroyRef),
        () => [{ repositoryId: 'r1' }, { agentId: 'a2' }],
        (burst) => bursts.push(burst),
        HARNESS_EVENTS,
      );
      const exited = {
        name: 'AgentHarnessExited',
        payload: JSON.stringify({ agentId: 'a2', workspaceId: '9', commandId: 'c1' }),
      };
      // Placed is not a harness event; a foreign agent in a foreign wrapper is somebody else's.
      events.next({ name: 'AgentPlaced', payload: JSON.stringify({ agentId: 'a2' }) });
      events.next({
        name: 'AgentStarted',
        payload: JSON.stringify({ agentId: 'a3', repositoryId: 'r9' }),
      });
      events.next(exited);
      vi.advanceTimersByTime(WORKSPACE_REFRESH_DEBOUNCE_MS);
      expect(bursts).toEqual([[exited]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
