import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { client as workspacesClient } from '../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../api/workspaces/client/client.gen';
import { workspacesGoldenMaster, workspacesGoldenMasters } from '../../../testing/golden-masters';
import { AgentActionsStore, describeRefusal, refusalOf } from './agent-actions.store';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WAITING = 'an agent waiting for a workspace slot';
const UNREACHABLE = 'an agent whose workspace daemon is not connected';
const LEFTOVER = 'an agent with leftover work';
const AGENT = 'an agent with a saved prompt draft';

const op = (state: string, operationId: string) =>
  workspacesGoldenMasters.operation(state, operationId);

describe('refusalOf and describeRefusal', () => {
  it('read the service’s message and code, and nothing that is not a string', () => {
    const body = workspacesGoldenMaster(LEFTOVER, 'discardAgent');
    expect(refusalOf(body, { status: 409 })).toEqual({
      ok: false,
      status: 409,
      message: body.message,
      code: 'AGENT_HAS_LEFTOVER_WORK',
    });
    expect(refusalOf({ message: 3 }, undefined)).toEqual({
      ok: false,
      status: 0,
      message: undefined,
      code: undefined,
    });
  });

  it('say what is known: the status and message, a bare status, or no answer', () => {
    expect(describeRefusal({ status: 409, message: 'Busy.' })).toBe('409 Busy.');
    expect(describeRefusal({ status: 500 })).toBe('500');
    expect(describeRefusal({ status: 0 })).toBe('the service is unreachable');
  });
});

/** `AgentActionsStore` on qits-workspaces' recorded states (epic qits-1230). */
describe('AgentActionsStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof AgentActionsStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AgentActionsStore);
  });

  afterEach(() => http.verify());

  it('discards an agent, without force', async () => {
    const { agentId } = op(WAITING, 'discardAgent').params;
    const done = store.discardAgent(agentId);
    await settle();
    const request = http.expectOne(`/workspaces/api/agents/${agentId}/discard`);
    expect(request.request.body).toEqual({ force: false });
    request.flush(workspacesGoldenMaster(WAITING, 'discardAgent'));
    expect(await done).toEqual({ ok: true, value: expect.objectContaining({ state: 'REMOVED' }) });
  });

  for (const [state, code] of [
    [LEFTOVER, 'AGENT_HAS_LEFTOVER_WORK'],
    [UNREACHABLE, 'AGENT_DAEMON_UNREACHABLE'],
  ] as const) {
    it(`hands a discard refused with ${code} back with the service’s reason`, async () => {
      const { agentId } = op(state, 'discardAgent').params;
      const done = store.discardAgent(agentId);
      await settle();
      const body = workspacesGoldenMaster(state, 'discardAgent');
      http
        .expectOne(`/workspaces/api/agents/${agentId}/discard`)
        .flush(body, { status: 409, statusText: 'Conflict' });
      expect(await done).toEqual({ ok: false, status: 409, message: body.message, code });
    });
  }

  it('discards with force after a refusal', async () => {
    const { agentId } = op(LEFTOVER, 'discardAgent').params;
    const done = store.discardAgent(agentId, true);
    await settle();
    const request = http.expectOne(`/workspaces/api/agents/${agentId}/discard`);
    expect(request.request.body).toEqual({ force: true });
    // No forced discard is recorded: the answer is the recorded discard of a waiting agent, which
    // has the same shape (the agent, REMOVED).
    request.flush(workspacesGoldenMaster(WAITING, 'discardAgent'));
    expect(await done).toMatchObject({ ok: true, value: { state: 'REMOVED' } });
  });

  /** The agent verbs' recorded answers (epic qits-1667), all the same agent. */
  const agent = () => workspacesGoldenMaster(AGENT, 'getAgent');
  const recorded = (state: string, operationId: string) =>
    workspacesGoldenMaster(state, operationId);

  it('interrupts a running agent by its id', async () => {
    const { agentId } = agent();
    const done = store.interruptAgent(agentId);
    await settle();
    const request = http.expectOne(`/workspaces/api/agents/${agentId}/interrupt`);
    expect(request.request.method).toBe('POST');
    request.flush(recorded('an agent in the middle of a turn', 'interruptAgent'));
    expect(await done).toMatchObject({ ok: true, value: { interrupted: true } });
  });

  it('says why an interrupt was refused', async () => {
    const { agentId } = agent();
    const done = store.interruptAgent(agentId);
    await settle();
    http
      .expectOne(`/workspaces/api/agents/${agentId}/interrupt`)
      .flush(
        { message: 'The agent has no running harness.', code: 'AGENT_NOT_RUNNING' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(await done).toEqual({
      ok: false,
      status: 409,
      message: 'The agent has no running harness.',
      code: 'AGENT_NOT_RUNNING',
    });
  });

  it('stops an agent by its id', async () => {
    const { agentId } = agent();
    const done = store.stopAgent(agentId);
    await settle();
    const request = http.expectOne(`/workspaces/api/agents/${agentId}/stop`);
    expect(request.request.method).toBe('POST');
    request.flush(recorded('an agent working on a ticket', 'stopAgent'));
    expect(await done).toMatchObject({ ok: true, value: { runState: 'STOPPED' } });
  });

  it('restarts an agent by its id, and says why a restart was refused', async () => {
    const { agentId } = agent();
    const done = store.restartAgent(agentId);
    await settle();
    http
      .expectOne(`/workspaces/api/agents/${agentId}/restart`)
      .flush(recorded('a stopped workspace slot', 'restartAgent'));
    expect(await done).toMatchObject({ ok: true, value: { runState: 'YIELDED' } });

    const refused = store.restartAgent(agentId);
    await settle();
    http
      .expectOne(`/workspaces/api/agents/${agentId}/restart`)
      .flush(
        { message: 'The agent has not started yet.' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(await refused).toMatchObject({
      ok: false,
      status: 409,
      message: 'The agent has not started yet.',
    });
  });
});
