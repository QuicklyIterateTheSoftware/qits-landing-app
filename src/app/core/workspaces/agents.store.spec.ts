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
const DRAFT = 'an agent with a saved prompt draft';
const NO_AGENT = 'no agent with that id';
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

  it('reads which of an item’s agents is ACTIVE', async () => {
    const workId = params(STARTING)['bugTicketId'];
    const done = store.loadItem(workId);
    await settle();
    http
      .expectOne(`${API}/agents?workId=${workId}`)
      .flush(workspacesGoldenMaster(STARTING, 'listAgents'));
    await done;
    expect(store.itemOf(workId)?.agent?.agentId).toBe(params(STARTING)['agentId']);
  });

  it('holds no agent for an item without an ACTIVE one', async () => {
    const done = store.loadItem('w-none');
    await settle();
    http
      .expectOne(`${API}/agents?workId=w-none`)
      .flush({ agents: [{ agentId: 'old', state: 'REMOVED' }] });
    await done;
    expect(store.itemOf('w-none')).toEqual({ status: 'loaded', agent: undefined });
  });

  it('reads an agent by its id, then its slot and the start running against it', async () => {
    const agentId = workspacesGoldenMasters.operation(DRAFT, 'getAgent').params['agentId'];
    const done = store.loadAgent(agentId);
    await settle();
    http.expectOne(`${API}/agents/${agentId}`).flush(workspacesGoldenMaster(DRAFT, 'getAgent'));
    await settle();
    http.expectOne(`${API}/workspaces/1`).flush(workspacesGoldenMaster(STARTING, 'getWorkspace'));
    http
      .expectOne(`${API}/workspaces/1/active-process`)
      .flush(workspacesGoldenMaster(STARTING, 'getWorkspaceActiveProcess'));
    await done;
    expect(store.agentOf(agentId)?.status).toBe('loaded');
    expect(store.agentOf(agentId)?.agent?.entityId).toBe('contract-00000001-10');
    expect(store.slotOf(1)?.slot?.runtimeStatus).toBe('PROVISIONING');
  });

  it('marks an agent the service does not know as missing', async () => {
    const agentId = workspacesGoldenMasters.operation(NO_AGENT, 'getAgent').params['agentId'];
    const done = store.loadAgent(agentId);
    await settle();
    http.expectOne(`${API}/agents/${agentId}`).flush(workspacesGoldenMaster(NO_AGENT, 'getAgent'), {
      status: 404,
      statusText: 'Not Found',
    });
    await done;
    expect(store.agentOf(agentId)).toEqual({ status: 'missing' });
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

  /**
   * `loadProjectAgents` until the pinned golden masters hold state `a project with agents needing
   * attention`: the request it makes, and what it keeps of an answer. The answer is state
   * `a project with workspace slots hosting agents`'s `listAgents` as recorded (it has no waits or
   * attention yet; the service filters by project and state, so the store keeps the list as is).
   */
  const projectAgentsUrl = (projectId: string) =>
    `${API}/agents?projectId=${projectId}&state=ACTIVE`;

  async function answerProjectAgents(projectId: string) {
    const done = store.loadProjectAgents(projectId);
    await settle();
    http
      .expectOne(projectAgentsUrl(projectId))
      .flush(workspacesGoldenMaster(PROJECT, 'listAgents'));
    await done;
  }

  it('reads a project’s ACTIVE agents by its id, and keeps the last good answer', async () => {
    await answerProjectAgents('p1');
    const loaded = store.projectAgentsOf('p1')!;
    expect(loaded.status).toBe('loaded');
    const recorded = workspacesGoldenMaster(PROJECT, 'listAgents') as {
      agents: { agentId: string }[];
    };
    expect(loaded.agents.map((a) => a.agentId)).toEqual(recorded.agents.map((a) => a.agentId));

    const again = store.loadProjectAgents('p1');
    await settle();
    http.expectOne(projectAgentsUrl('p1')).flush(null, { status: 500, statusText: 'Server Error' });
    await again;
    expect(store.projectAgentsOf('p1')).toEqual(loaded);
  });

  it('calls a first failed read of a project’s agents an error', async () => {
    const done = store.loadProjectAgents('p2');
    expect(store.projectAgentsOf('p2')?.status).toBe('loading');
    await settle();
    http.expectOne(projectAgentsUrl('p2')).flush(null, { status: 403, statusText: 'Forbidden' });
    await done;
    expect(store.projectAgentsOf('p2')).toEqual({ status: 'error', agents: [] });
  });

  it('reads the project’s agents again after the status events about it, at most once a second', async () => {
    await answerProjectAgents('p1');
    const listed = store.projectAgentsOf('p1')!.agents[0]!;
    const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });
    const reads = () => http.match(projectAgentsUrl('p1'));
    let open: string | undefined = 'p1';
    vi.useFakeTimers();
    try {
      store.followProject(TestBed.inject(DestroyRef), () => open);
      // Another project's status event; a nudge of a listed agent; one of this project's.
      events.next(event('AgentAttentionChanged', { agentId: listed.agentId, projectId: 'p9' }));
      events.next(event('AgentNudged', { agentId: listed.agentId }));
      events.next(event('AgentWaitOpened', { agentId: 'x', projectId: 'p1' }));
      vi.advanceTimersByTime(WORKSPACE_REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    const burst = reads();
    expect(burst).toHaveLength(1);
    burst[0]!.flush(workspacesGoldenMaster(PROJECT, 'listAgents'));
    await settle();

    vi.useFakeTimers();
    try {
      // A lifecycle event outside the status events; an agent placed where no listed agent works;
      // a status event once no project is open.
      events.next(event('AgentStarted', { agentId: listed.agentId }));
      events.next(event('AgentPlaced', { agentId: 'new', repositoryId: 'elsewhere' }));
      events.next(event('AgentAttentionChanged', { agentId: listed.agentId, projectId: 'p9' }));
      open = undefined;
      events.next(event('AgentActivityChanged', { agentId: 'x', projectId: 'p1' }));
      vi.advanceTimersByTime(WORKSPACE_REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(reads()).toHaveLength(0);
  });
});
